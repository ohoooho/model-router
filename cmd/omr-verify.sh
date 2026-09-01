#!/bin/bash
# ============================================================
# cmd/omr-verify.sh - OMR 配置完整性验证
#
# 用法：omr-verify.sh
# 功能：检查 5 provider 配置完整性 + key 完整性 + 路由策略
# ============================================================

set -u

NODE="${NODE_BIN:-/usr/local/bin/node}"
OMR_DIR="${HOME}/.omr"
GATEWAY_PORT=3456
PASS=0
FAIL=0
WARN=0

ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
warn() { echo "  ⚠ $1"; WARN=$((WARN+1)); }

# 1. SQLite config 完整性
check_sqlite() {
  echo "=== 1. SQLite Config ==="
  if [ ! -f "${OMR_DIR}/config.sqlite" ]; then
    fail "config.sqlite not found at ${OMR_DIR}/"
    return 1
  fi
  ok "config.sqlite exists"

  local result
  result=$("$NODE" -e "
const db = require('better-sqlite3')('${OMR_DIR}/config.sqlite', { readonly: true });
const row = db.prepare(\"SELECT value_json FROM app_config WHERE key='default'\").get();
if (!row) { console.log('NO_CONFIG'); process.exit(0); }
const cfg = JSON.parse(row.value_json);
console.log('providers=' + (cfg.Providers?.length || 0));
console.log('profiles=' + (cfg.Profiles?.length || 0));
console.log('virtualModelProfiles=' + (cfg.virtualModelProfiles?.length || 0));
console.log('fallback=' + (cfg.Router?.fallback?.models?.length || 0));
// Check each provider
if (cfg.Providers) {
  for (const p of cfg.Providers) {
    const credCount = p.credentials?.length || 0;
    const modelCount = p.models?.length || 0;
    console.log('provider:' + p.name + ':creds=' + credCount + ':models=' + modelCount);
  }
}
" 2>/dev/null || echo "ERROR")

  if [ "$result" = "NO_CONFIG" ]; then
    fail "app_config['default'] not found"
    return 1
  fi
  if [ "$result" = "ERROR" ]; then
    fail "SQLite read error"
    return 1
  fi

  # Parse results
  echo "$result" | while IFS='=' read -r key val; do
    case "$key" in
      providers)        [ "${val:-0}" -ge 1 ] && ok "Providers: $val" || fail "Providers: $val (need ≥1)" ;;
      profiles)         [ "${val:-0}" -ge 1 ] && ok "Profiles: $val" || warn "Profiles: $val" ;;
      virtualModelProfiles) [ "${val:-0}" -ge 1 ] && ok "VirtualModelProfiles: $val" || warn "VirtualModelProfiles: $val" ;;
      fallback)         [ "${val:-0}" -ge 1 ] && ok "Fallback models: $val" || warn "Fallback models: $val" ;;
      provider:*)       echo "  • $key=$val" ;;
    esac
  done
}

# 2. Provider credential 完整性
check_credentials() {
  echo "=== 2. Credential Integrity ==="
  local result
  result=$("$NODE" -e "
const db = require('better-sqlite3')('${OMR_DIR}/config.sqlite', { readonly: true });
const row = db.prepare(\"SELECT value_json FROM app_config WHERE key='default'\").get();
if (!row) { console.log('NO_CONFIG'); process.exit(0); }
const cfg = JSON.parse(row.value_json);
let issues = 0;
for (const p of (cfg.Providers || [])) {
  const creds = p.credentials || [];
  for (const c of creds) {
    if (!c.api_key || c.api_key.length < 10) {
      console.log('MISSING_KEY:' + p.name + ':' + (c.id || 'unknown'));
      issues++;
    }
    if (!c.enabled) {
      console.log('DISABLED:' + p.name + ':' + (c.id || 'unknown'));
    }
  }
  if (creds.length === 0) {
    console.log('NO_CREDS:' + p.name);
    issues++;
  }
}
if (issues === 0) console.log('ALL_OK');
" 2>/dev/null || echo "ERROR")

  case "$result" in
    ALL_OK)    ok "All credentials present and enabled" ;;
    NO_CONFIG) fail "No config found" ;;
    ERROR)     fail "SQLite read error" ;;
    *)
      echo "$result" | while IFS=':' read -r type provider cred; do
        case "$type" in
          MISSING_KEY) fail "Missing/short API key: $provider/$cred" ;;
          DISABLED)    warn "Disabled credential: $provider/$cred" ;;
          NO_CREDS)    fail "No credentials for provider: $provider" ;;
        esac
      done
      ok "Credential check completed (issues above if any)"
      ;;
  esac
}

# 3. API key 前缀检查
check_key_prefix() {
  echo "=== 3. API Key Prefix ==="
  local result
  result=$("$NODE" -e "
const db = require('better-sqlite3')('${OMR_DIR}/config.sqlite', { readonly: true });
const rows = db.prepare('SELECT id, encrypted_key FROM api_keys').all();
for (const r of rows) {
  const key = r.encrypted_key || '';
  if (key.startsWith('omr-')) {
    console.log('OK_PREFIX:' + r.id);
  } else if (key.startsWith('ccr-')) {
    console.log('OLD_PREFIX:' + r.id);
  } else {
    console.log('NO_PREFIX:' + r.id);
  }
}
" 2>/dev/null || echo "ERROR")

  case "$result" in
    ERROR) fail "Cannot read api_keys table" ;;
    *)
      echo "$result" | while IFS=':' read -r type id; do
        case "$type" in
          OK_PREFIX)   ok "Key $id has omr- prefix" ;;
          OLD_PREFIX)  warn "Key $id has old ccr- prefix (consider migrating)" ;;
          NO_PREFIX)   warn "Key $id has no prefix" ;;
        esac
      done
      ;;
  esac
}

# 4. Daemon 状态
check_daemon() {
  echo "=== 4. Daemon Status ==="
  if pgrep -f "model-router/dist/main/cli.js" >/dev/null 2>&1; then
    local pid
    pid=$(pgrep -f "model-router/dist/main/cli.js" | head -1)
    ok "OMR daemon running (pid=$pid)"
  else
    fail "OMR daemon not running"
  fi

  # Check service.json
  if [ -f "${OMR_DIR}/service.json" ]; then
    ok "service.json exists"
  else
    warn "service.json not found (daemon may not have started properly)"
  fi
}

# 5. Gateway 端点
check_gateway() {
  echo "=== 5. Gateway Endpoint ==="
  local api_key
  api_key=$("$NODE" -e "
const db = require('better-sqlite3')('${OMR_DIR}/config.sqlite', { readonly: true });
const row = db.prepare(\"SELECT encrypted_key FROM api_keys WHERE id IN ('local-gateway','key-1') ORDER BY CASE id WHEN 'local-gateway' THEN 1 WHEN 'key-1' THEN 2 ELSE 3 END LIMIT 1\").get();
if (row) console.log(row.encrypted_key);
" 2>/dev/null || echo "")

  if [ -z "$api_key" ]; then
    warn "No API key found, skipping gateway test"
    return
  fi

  local resp code
  resp=$(curl -s --max-time 10 -H "Authorization: Bearer ${api_key}" \
    "http://127.0.0.1:${GATEWAY_PORT}/v1/models" 2>/dev/null)
  code=$(echo "$resp" | "$NODE" -e "
const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
if (d.data) console.log('OK:' + d.data.length + ' models');
else console.log('FAIL:' + JSON.stringify(d).slice(0,100));
" 2>/dev/null || echo "PARSE_ERROR")

  case "$code" in
    OK:*)   ok "Gateway /v1/models: ${code#OK:}" ;;
    FAIL:*) fail "Gateway /v1/models: ${code#FAIL:}" ;;
    PARSE_ERROR) fail "Gateway /v1/models: parse error" ;;
    *) fail "Gateway /v1/models: $code" ;;
  esac
}

# Main
main() {
  echo "===== OMR Verify ($(date '+%F %T')) ====="
  echo
  check_sqlite
  echo
  check_credentials
  echo
  check_key_prefix
  echo
  check_daemon
  echo
  check_gateway
  echo
  echo "===== Summary: ✓ $PASS  ✗ $FAIL  ⚠ $WARN ====="
  [ "$FAIL" -eq 0 ] && exit 0 || exit 1
}

main "$@"
