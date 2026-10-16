#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(dirname "$script_dir")"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/omr-online-fallback.XXXXXX")"
trap 'rm -rf "$test_root"' EXIT

fake_bin="$test_root/bin"
npm_root="$test_root/npm-root"
npm_prefix="$test_root/npm-prefix"
mkdir -p "$fake_bin" "$npm_root" "$npm_prefix/bin" "$test_root/artifacts"
touch "$test_root/artifacts/omr-0.1.0.tgz"

cat >"$fake_bin/node" <<'NODE'
#!/usr/bin/env bash
case "${1:-}" in
  -) cat >/dev/null; exit 0 ;;
  -e)
    case "${2:-}" in
      *process.versions.node*) echo 24; exit 0 ;;
      *require*) echo 0.1.0; exit 0 ;;
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
    printf '{"version":"0.1.0"}\n' > "$OMR_TEST_ROOT/@ohoooho/model-router/package.json"
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

echo "OMR online tarball fallback regression passed."
