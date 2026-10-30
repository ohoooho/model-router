#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(dirname "$script_dir")"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/omr-online-fallback.XXXXXX")"
trap 'rm -rf "$test_root"' EXIT

# 与 install.sh 同一套读法：按 artifact id 从 component.yaml 的 artifacts 段取字段。
artifact_field() {
    local yaml="$1" artifact_id="$2" field="$3"
    awk -v want="${artifact_id}" -v field="${field}" '
        /^[ \t]*-[ \t]*id:[ \t]*/ {
            id = $0
            sub(/^[ \t]*-[ \t]*id:[ \t]*/, "", id)
            gsub(/"/, "", id)
            gsub(/[ \t\r]+$/, "", id)
            inblock = (id == want)
            next
        }
        inblock && $0 ~ ("^[ \t]*" field "[ \t]*:") {
            val = $0
            sub("^[ \t]*" field "[ \t]*:[ \t]*", "", val)
            sub(/[ \t]*#.*$/, "", val)
            gsub(/"/, "", val)
            gsub(/[ \t\r]+$/, "", val)
            print val
            exit
        }
        inblock && /^[A-Za-z_][A-Za-z0-9_]*[ \t]*:/ { inblock = 0 }
    ' "${yaml}"
}

fake_bin="$test_root/bin"
npm_root="$test_root/npm-root"
npm_prefix="$test_root/npm-prefix"

sha256_file() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    else
        shasum -a 256 "$1" | awk '{print $1}'
    fi
}
mkdir -p "$fake_bin" "$npm_root" "$npm_prefix/bin" "$test_root/artifacts"
# 占位物料的名字从 component.yaml 的 artifacts 段读，不在这里写死。
# 之前写死的是 omr-0.1.0.tgz —— 那不是任何一份物料的名字（离线包是
# omr-<version>.tar.gz，npm 包是 ohoooho-model-router-<version>.tgz），
# 写死的名字迟早和清单对不上，测试就成了假绿。
npm_tarball_name="$(artifact_field "$script_dir/component.yaml" omr-npm-package path)"
offline_tarball_name="$(artifact_field "$script_dir/component.yaml" omr-offline-package path)"
printf 'fake npm tarball\n' >"$test_root/artifacts/${npm_tarball_name}"
touch "$test_root/artifacts/${offline_tarball_name}"

# 物料哈希是真校对的，所以占位物料的哈希也得对上。
# 用一份 fixture 清单：把 omr-npm-package 的 sha256 换成占位物料的真实哈希，
# 其余内容与真清单一致。这样这条回归测的是"回退路径也会核对物料哈希"，
# 而不是把校验关掉。
npm_tarball_sha="$(sha256_file "$test_root/artifacts/${npm_tarball_name}")"
# 装完的版本必须和清单里的 default_version 一致（契约 §3.4 死规），
# 所以假 npm 装出来的版本号也来自清单，不在这里写死。
omr_version="$(grep -A1 'default_version:' "$script_dir/component.yaml" | head -1 | sed 's/.*default_version:[[:space:]]*//')"
awk -v sha="${npm_tarball_sha}" '
    /^[ \t]*-[ \t]*id:[ \t]*/ {
        id = $0
        sub(/^[ \t]*-[ \t]*id:[ \t]*/, "", id)
        gsub(/"/, "", id)
        gsub(/[ \t\r]+$/, "", id)
        inblock = (id == "omr-npm-package")
        print
        next
    }
    inblock && /^[ \t]*sha256[ \t]*:/ { print "  sha256: " sha; next }
    inblock && /^[A-Za-z_][A-Za-z0-9_]*[ \t]*:/ { inblock = 0 }
    { print }
' "$script_dir/component.yaml" >"$test_root/component.yaml"

cat >"$fake_bin/node" <<'NODE'
#!/usr/bin/env bash
case "${1:-}" in
  -) cat >/dev/null; exit 0 ;;
  -e)
    case "${2:-}" in
      *process.versions.node*) echo 24; exit 0 ;;
      *require*) echo "$OMR_TEST_VERSION"; exit 0 ;;
    esac
    ;;
  -p) echo 137; exit 0 ;;
esac
exit 0
NODE

cat >"$fake_bin/uname" <<'UNAME'
#!/usr/bin/env bash
echo Darwin
UNAME

cat >"$fake_bin/npm" <<'NPM'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$OMR_NPM_CALL_LOG"
case "${1:-}" in
  prefix) echo "$OMR_TEST_PREFIX" ;;
  root) echo "$OMR_TEST_ROOT" ;;
  config)
    case "${2:-}" in
      get) case "${3:-}" in
        registry) echo "https://registry.npmmirror.com/" ;;
        offline) echo false ;;
        cache) echo "$OMR_TEST_ROOT/cache" ;;
      esac ;;
    esac ;;
  view) exit 1 ;;
  install)
    if [[ " $* " == *" --offline "* ]]; then
      echo "unexpected offline install in online mode" >&2
      exit 99
    fi
    [[ " $* " == *" --offline=false "* ]] || exit 98
    mkdir -p "$OMR_TEST_ROOT/@ohoooho/model-router/dist/main"
    printf '{"version":"%s"}\n' "$OMR_TEST_VERSION" > "$OMR_TEST_ROOT/@ohoooho/model-router/package.json"
    printf '#!/usr/bin/env node\nconsole.log("OMR CLI")\n' > "$OMR_TEST_ROOT/@ohoooho/model-router/dist/main/cli.js"
    exit 0 ;;
  rebuild) exit 0 ;;
  *) exit 0 ;;
esac
NPM

chmod +x "$fake_bin/node" "$fake_bin/npm" "$fake_bin/uname"

PATH="$fake_bin:$PATH" \
NODE_COMMAND="$fake_bin/node" \
NPM_COMMAND="$fake_bin/npm" \
COMPONENT_YAML="$test_root/component.yaml" \
OMR_TEST_VERSION="$omr_version" \
OMR_TEST_PREFIX="$npm_prefix" \
OMR_TEST_ROOT="$npm_root" \
OMR_NPM_CALL_LOG="$test_root/npm-calls.log" \
OMR_OFFLINE_TARBALL_DIR="$test_root/artifacts" \
OMR_DATA_DIR="$test_root/omr-data" \
OMR_SKIP_CONFIGURE=1 \
bash "$script_dir/install.sh" --online >"$test_root/install.log" 2>&1

grep -Fq 'npm registry 未能查询目标版本' "$test_root/install.log"
grep -Fq 'install -g ' "$test_root/npm-calls.log"
grep -Fq -- '--offline=false' "$test_root/npm-calls.log"
if grep -Fq -- '--offline ' "$test_root/npm-calls.log"; then
  echo "online fallback incorrectly forced npm offline mode" >&2
  exit 1
fi
# 回退路径也要核对物料哈希，并在安装报告里回显算出来的那个值。
grep -Fq "\"artifact_sha256\": \"${npm_tarball_sha}\"" "$test_root/install.log" || {
  echo "online fallback did not verify the tarball sha256" >&2
  cat "$test_root/install.log" >&2
  exit 1
}

# 反面：清单里写的哈希和物料对不上时必须拒绝装。
# 没有这一条，上面那条断言可能是"哈希根本没查"的假绿。
sed "s|^  sha256: ${npm_tarball_sha}\$|  sha256: 0000000000000000000000000000000000000000000000000000000000000000|" \
  "$test_root/component.yaml" >"$test_root/component-badhash.yaml"
if PATH="$fake_bin:$PATH" \
  NODE_COMMAND="$fake_bin/node" \
  NPM_COMMAND="$fake_bin/npm" \
  COMPONENT_YAML="$test_root/component-badhash.yaml" \
  OMR_TEST_PREFIX="$test_root/npm-prefix-badhash" \
  OMR_TEST_ROOT="$test_root/npm-root-badhash" \
  OMR_NPM_CALL_LOG="$test_root/npm-calls-badhash.log" \
  OMR_OFFLINE_TARBALL_DIR="$test_root/artifacts" \
  OMR_DATA_DIR="$test_root/omr-data-badhash" \
  OMR_SKIP_CONFIGURE=1 \
  bash "$script_dir/install.sh" --online >"$test_root/install-badhash.log" 2>&1; then
  echo "online fallback accepted a tarball whose sha256 does not match the manifest" >&2
  cat "$test_root/install-badhash.log" >&2
  exit 1
fi
grep -Fq 'npm tarball sha256 不匹配' "$test_root/install-badhash.log" || {
  echo "online fallback did not report the sha256 mismatch" >&2
  cat "$test_root/install-badhash.log" >&2
  exit 1
}

echo "OMR online tarball fallback regression passed."
