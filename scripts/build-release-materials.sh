#!/usr/bin/env bash
# ============================================================================
# build-release-materials.sh — 从一个 git ref 确定性地复现 OMR 组件物料
#
# 用法:
#   scripts/build-release-materials.sh                      # 用 HEAD
#   scripts/build-release-materials.sh --ref v0.1.0         # 用某个 ref
#   scripts/build-release-materials.sh --out /tmp/mats      # 指定输出目录
#   scripts/build-release-materials.sh --verify <已解开的目录>
#                                                       # 校验已发布物料的内容
#
# 为什么有这份脚本 (2026-10-30):
#   桃仙的 catalog 记着 OMR 每个文件的 sha256, 但它记的那份 OMR 内容
#   **在任何 commit 里都不存在** —— 是某人当时工作区里没提交的状态。
#   于是整条发行链不可复现, 谁都重生成不出来。
#   根因是「产物记了文件哈希, 却没记这些哈希对应哪个版本」。
#
#   这份脚本把版本坐标变成流程的一部分:
#     物料 = f(git ref)  —— 同一个 ref 永远产出同一份物料。
#
# 自哈希循环 (为什么 archived 的 component.yaml 带占位符):
#   install.tar.gz 里装着 component.yaml, 而 component.yaml 又要声明
#   install.tar.gz 自己的 sha256 ⇒ 直接写等于找 sha256 的不动点, 算不出来。
#   所以归档里的那份 component.yaml 把自己的 sha256 换成占位符,
#   归档哈希因此与声明值无关; 真实哈希填在**独立发布的**那份 component.yaml 里。
#   dopple 上现在是两份: /omr/component.yaml (带真哈希) 与
#   /omr/install.tar.gz (内含带占位符的那份)。
#
# 产物 (输出目录):
#   install.tar.gz   组件脚本包 (内含 component.yaml 的占位符版本)
#   component.yaml   独立清单 (带真实哈希 + 大小)
#   materials.sha256 物料对照表 (含来源 commit)
# ============================================================================
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

REF=""
OUT_DIR="${REPO_ROOT}/release-materials"
VERIFY_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref)    REF="$2"; shift 2 ;;
    --out)    OUT_DIR="$2"; shift 2 ;;
    --verify) VERIFY_DIR="$2"; shift 2 ;;
    --help|-h) sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

cd "${REPO_ROOT}"

REF="${REF:-$(git rev-parse HEAD)}"
COMMIT_SHA=$(git rev-parse "${REF}")
COMMIT_SHORT=$(git rev-parse --short "${REF}")
COMMIT_TIME=$(git log -1 --format=%ct "${REF}")

if ! git cat-file -e "${COMMIT_SHA}^{commit}" 2>/dev/null; then
  echo "ERR: ref 不存在或不是 commit: ${REF}" >&2
  exit 1
fi

echo "==> 源 ref: ${REF} (${COMMIT_SHORT})"

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

file_size() {
  if command -v stat >/dev/null 2>&1; then
    stat -c %s "$1" 2>/dev/null || wc -c < "$1"
  else
    wc -c < "$1"
  fi
}

WORK_DIR=$(mktemp -d)
trap 'rm -rf "${WORK_DIR}"' EXIT

# ---------------------------------------------------------------------------
# 1. 从 ref 取出 install/ 树 —— 不是工作区快照
# ---------------------------------------------------------------------------
echo "==> 从 ref 取出 install/ 树"
git archive --format=tar "${COMMIT_SHA}" install/ | tar -xf - -C "${WORK_DIR}"
[[ -f "${WORK_DIR}/install/component.yaml" ]] || {
  echo "ERR: ref ${REF} 里没有 install/component.yaml" >&2
  exit 1
}

COMPONENT_YAML="${WORK_DIR}/component.yaml.pristine"
cp "${WORK_DIR}/install/component.yaml" "${COMPONENT_YAML}"

# 版本只有一个真源 —— 不一致就不许发布
echo "==> 校验版本口径"
python3 "${SCRIPT_DIR}/component-manifest.py" check-version "${COMPONENT_YAML}"

# ---------------------------------------------------------------------------
# 2. 归档用的 component.yaml: 自己的 sha256/size 换成占位符
# ---------------------------------------------------------------------------
ARCHIVE_YAML="${WORK_DIR}/install/component.yaml"
python3 "${SCRIPT_DIR}/component-manifest.py" placeholder "${ARCHIVE_YAML}"

# ---------------------------------------------------------------------------
# 3. 确定性打包 install.tar.gz
#    --sort=name / --mtime / --owner=0 / gzip -n ⇒ 同一个 ref 永远同一份字节
# ---------------------------------------------------------------------------
echo "==> 打包 install.tar.gz (确定性)"
mkdir -p "${OUT_DIR}"
ARCHIVE="${OUT_DIR}/install.tar.gz"
tar --sort=name --mtime="@${COMMIT_TIME}" --owner=0 --group=0 --numeric-owner \
    -cf - -C "${WORK_DIR}" install/ | gzip -n -9 > "${ARCHIVE}"

ARCHIVE_SHA=$(sha256_file "${ARCHIVE}")
ARCHIVE_SIZE=$(file_size "${ARCHIVE}")
echo "    install.tar.gz  sha256=${ARCHIVE_SHA}  size=${ARCHIVE_SIZE}"

# ---------------------------------------------------------------------------
# 4. 独立清单: 把真实哈希与大小填回占位符
# ---------------------------------------------------------------------------
echo "==> 生成独立 component.yaml (填真实哈希)"
PUBLISHED_YAML="${OUT_DIR}/component.yaml"
python3 "${SCRIPT_DIR}/component-manifest.py" fill \
  "${COMPONENT_YAML}" "${PUBLISHED_YAML}" "${ARCHIVE_SHA}" "${ARCHIVE_SIZE}"

YAML_SHA=$(sha256_file "${PUBLISHED_YAML}")
YAML_SIZE=$(file_size "${PUBLISHED_YAML}")
echo "    component.yaml  sha256=${YAML_SHA}  size=${YAML_SIZE}"

# ---------------------------------------------------------------------------
# 5. 物料对照表 —— 写清每份物料来自哪个 commit
# ---------------------------------------------------------------------------
cat > "${OUT_DIR}/materials.sha256" <<EOF
# OMR 组件物料对照表
# 由 scripts/build-release-materials.sh 生成 —— 同一个 ref 永远产出同一份。
source_repo:   ${REPO_ROOT}
source_ref:    ${REF}
source_commit: ${COMMIT_SHA}
source_commit_short: ${COMMIT_SHORT}
generated_at:  $(date -u +%Y-%m-%dT%H:%M:%SZ)

# 归档内的 component.yaml 用占位符代替自己的哈希, 所以归档哈希与声明值无关;
# 真实哈希填在独立发布的那份 component.yaml 里。
install.tar.gz  sha256=${ARCHIVE_SHA}  size=${ARCHIVE_SIZE}
component.yaml  sha256=${YAML_SHA}  size=${YAML_SIZE}
EOF

echo "==> 对照表: ${OUT_DIR}/materials.sha256"

# ---------------------------------------------------------------------------
# 6. --verify: 与已发布物料逐文件比对内容
# ---------------------------------------------------------------------------
if [[ -n "${VERIFY_DIR}" ]]; then
  echo "==> 校验已发布物料内容: ${VERIFY_DIR}"
  if [[ ! -d "${VERIFY_DIR}/install" ]]; then
    echo "ERR: ${VERIFY_DIR}/install 不存在 (先解开 install.tar.gz)" >&2
    exit 1
  fi
  diff -r "${WORK_DIR}/install" "${VERIFY_DIR}/install" > /tmp/omr-material-diff.txt 2>&1 || true
  # 归档里的 component.yaml 是占位符版本, 与独立清单本来就差 2 行 —— 比内容不比这两行
  if [[ -s /tmp/omr-material-diff.txt ]]; then
    echo "--- 差异 (应只有 component.yaml 的自哈希两行) ---"
    cat /tmp/omr-material-diff.txt
    only_manifest=$(grep -c "^diff .*component\.yaml" /tmp/omr-material-diff.txt || true)
    if [[ "${only_manifest}" == "0" ]]; then
      echo "ERR: 内容与该 ref 不一致 (不只是 component.yaml 的自哈希两行)" >&2
      exit 1
    fi
  fi
  echo "✅ 除 component.yaml 的自哈希两行外, 已发布物料与 ref ${COMMIT_SHORT} 逐文件一致"
fi

echo ""
echo "✅ 物料已生成于 ${OUT_DIR}"
echo "   发布时把 install.tar.gz 与 component.yaml 一起传到 dopple/omr/,"
echo "   并把 component.yaml 里的 omr-component-scripts.sha256/size_bytes 提交回仓。"
