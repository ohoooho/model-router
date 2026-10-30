#!/usr/bin/env python3
"""component-manifest.py — 读写 component.yaml 的 artifacts 段。

两个用法:

  placeholder <file>            把 omr-component-scripts 自己的 sha256/size_bytes
                                换成占位符 (归档进 install.tar.gz 时用)
  fill <src> <dst> <sha> <size>  把占位符/旧值填成真实哈希与大小, 写到 dst
                                (独立发布的那份 component.yaml 用)

为什么需要它:
  install.tar.gz 里装着 component.yaml, 而 component.yaml 又要声明
  install.tar.gz 自己的 sha256 —— 直接写等于找 sha256 的不动点, 算不出来。
  所以归档里的那份把自己的哈希换成占位符, 归档哈希因此与声明值无关;
  真实哈希填在**独立发布的**那份里。

block 边界跟 install/install.sh 的 artifact_field 保持一致:
只有**顶格**的 key 才结束当前 artifact block; artifacts 段里的
path/sha256/size_bytes 都是缩进的字段, 不能当成 block 结束标志。
"""

import re
import sys

TARGET_ARTIFACT = "omr-component-scripts"
SHA_PLACEHOLDER = "<self-hash-in-published-component.yaml>"
SIZE_PLACEHOLDER = "<self-size-in-published-component.yaml>"


def rewrite(text: str, sha: str | None, size: str | None) -> str:
    """把 artifacts 段里 TARGET_ARTIFACT 的 sha256/size_bytes 换成给定值。

    sha 为 None 表示用占位符; 否则填入实际值。
    """
    out = []
    in_block = False
    for line in text.split("\n"):
        stripped = line.strip()
        if re.match(r"^-\s*id:\s*", stripped):
            ident = re.sub(r"^-\s*id:\s*", "", stripped).strip().strip('"')
            in_block = ident == TARGET_ARTIFACT
        elif in_block and re.match(r"^[A-Za-z_][A-Za-z0-9_]*\s*:", line):
            in_block = False
        if in_block:
            if re.match(r"^sha256\s*:", stripped):
                value = SHA_PLACEHOLDER if sha is None else sha
                line = re.sub(r"sha256\s*:.*$", f"sha256: {value}", line)
            elif re.match(r"^size_bytes\s*:", stripped):
                value = SIZE_PLACEHOLDER if size is None else size
                line = re.sub(r"size_bytes\s*:.*$", f"size_bytes: {value}", line)
        out.append(line)
    return "\n".join(out)


def collect_versions(text: str) -> dict:
    """收集各处出现的版本号, 用来核对"版本只有一个真源"。"""
    versions: dict[str, list[str]] = {}

    def add(key: str, value: str) -> None:
        versions.setdefault(key, []).append(value)

    release_default = None
    stable_version = None
    in_channels = False
    in_stable = False
    in_release = False
    in_artifacts = False
    artifact_id = None

    for line in text.split("\n"):
        if re.match(r"^release\s*:", line):
            in_release = True
            continue
        if re.match(r"^artifacts\s*:", line):
            in_artifacts = True
            continue
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*\s*:", line):
            # 顶格 key: 结束之前的块
            if in_release and not re.match(r"^(release|channels|default_version)\b", line):
                in_release = False
            if not re.match(r"^(release|artifacts)\b", line):
                in_artifacts = False
            in_channels = False
            in_stable = False
            continue
        if in_release:
            m = re.match(r"^\s+default_version\s*:\s*(.+?)\s*$", line)
            if m:
                release_default = m.group(1).strip().strip('"').strip("'")
                continue
            if re.match(r"^\s+channels\s*:", line):
                in_channels = True
                continue
            if in_channels and re.match(r"^\s+stable\s*:", line):
                in_stable = True
                continue
            if in_stable:
                m = re.match(r"^\s+version\s*:\s*(.+?)\s*$", line)
                if m:
                    stable_version = m.group(1).strip().strip('"').strip("'")
                    in_stable = False
        if in_artifacts:
            m = re.match(r"^\s*-\s*id\s*:\s*(.+?)\s*$", line)
            if m:
                artifact_id = m.group(1).strip().strip('"').strip("'")
                continue
            m = re.match(r"^\s+version\s*:\s*(.+?)\s*$", line)
            if m and artifact_id:
                add(f"artifacts[{artifact_id}].version", m.group(1).strip().strip('"').strip("'"))
                artifact_id = None

    if release_default:
        add("release.default_version", release_default)
    if stable_version:
        add("release.channels.stable.version", stable_version)
    return versions


def check_version(text: str) -> int:
    versions = collect_versions(text)
    if not versions:
        print("ERR: component.yaml 里读不到任何版本号", file=sys.stderr)
        return 1
    distinct = {v for values in versions.values() for v in values}
    if len(distinct) > 1:
        print("ERR: 版本号不止一个, 违反'版本只有一个真源'", file=sys.stderr)
        for key, values in versions.items():
            for value in values:
                print(f"    {key}: {value}", file=sys.stderr)
        print("    以 release.default_version 为准, 其余全部对齐。", file=sys.stderr)
        return 1
    print(f"✅ 版本一致: {versions['release.default_version'][0]}")
    for key, values in versions.items():
        print(f"    {key}: {values[0]}")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2

    command = argv[1]
    if command == "placeholder":
        if len(argv) != 3:
            print("用法: component-manifest.py placeholder <file>", file=sys.stderr)
            return 2
        path = argv[2]
        text = open(path, encoding="utf-8").read()
        open(path, "w", encoding="utf-8").write(rewrite(text, None, None))
        return 0

    if command == "check-version":
        if len(argv) != 3:
            print("用法: component-manifest.py check-version <file>", file=sys.stderr)
            return 2
        return check_version(open(argv[2], encoding="utf-8").read())

    if command == "fill":
        if len(argv) != 6:
            print(
                "用法: component-manifest.py fill <src> <dst> <sha256> <size>",
                file=sys.stderr,
            )
            return 2
        src, dst, sha, size = argv[2], argv[3], argv[4], argv[5]
        text = open(src, encoding="utf-8").read()
        open(dst, "w", encoding="utf-8").write(rewrite(text, sha, size))
        return 0

    print(f"未知命令: {command}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
