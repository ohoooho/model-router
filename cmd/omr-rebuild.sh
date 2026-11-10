#!/bin/bash
# ============================================================
# cmd/omr-rebuild.sh - OMR 完整重建（重启 daemon + 验证端口）
#
# 用法：omr-rebuild.sh [--dry-run]
# 功能：kill OMR -> 备份配置 -> 重启 -> 验证端口 + API
# ============================================================

set -u

NODE="${NODE_BIN:-/usr/local/bin/node}"
CLI="${OMR_CLI:-/root/.npm-global/lib/node_modules/@ohoooho/model-router/dist/main/cli.js}"
OMR_DIR="${HOME}/.omr"
GATEWAY_PORT=3456
WEB_PORT=3458

log() { echo "[$(date '+%F %T')] $*"; }

# 1. Kill OMR
kill_omr() {
  log "Step 1: kill OMR"
  pkill -9 -f "cli.js serve" 2>/dev/null || true
  pkill -9 -f "gateway-bootstrap" 2>/dev/null || true
  sleep 3
}

# 2. Backup current config
backup_config() {
  local ts=$(date +%s)
  log "Step 2: backup current config to *.bak-rebuild-${ts}"
  for f in config.sqlite config.sqlite-wal config.sqlite-shm config.json; do
    local p="${OMR_DIR}/${f}"
    if [ -f "$p" ]; then
      cp "$p" "${OMR_DIR}/${f}.bak-rebuild-${ts}"
      log "  backed up ${f}"
    fi
  done
}

# 3. Start OMR
start_omr() {
  log "Step 3: start OMR"
  nohup "$NODE" "$CLI" serve --daemon-child --no-open > /tmp/omr-rebuild-$(date +%s).log 2>&1 &
  sleep 6
  if pgrep -f "model-router/dist/main/cli.js" >/dev/null 2>&1; then
    log "  OMR started (pid=$(pgrep -f 'model-router/dist/main/cli.js' | head -1))"
    return 0
  else
    log "  ✗ OMR start failed!"
    return 1
  fi
}

# 4. Verify ports
verify_ports() {
  log "Step 4: verify ports"
  local gw_ok=0 web_ok=0
  
  # Check gateway port
  if curl -s --max-time 5 -o /dev/null -w "%{http_code}" \
    "http://127.0.0.1:${GATEWAY_PORT}/v1/models" 2>/dev/null | grep -q "200"; then
    gw_ok=1
    log "  ✓ Gateway port ${GATEWAY_PORT} responding"
  else
    log "  ✗ Gateway port ${GATEWAY_PORT} not responding"
  fi

  # Check web management port
  if curl -s --max-time 5 -o /dev/null -w "%{http_code}" \
    "http://127.0.0.1:${WEB_PORT}/" 2>/dev/null | grep -q "200\|301\|302"; then
    web_ok=1
    log "  ✓ Web port ${WEB_PORT} responding"
  else
    log "  ⚠ Web port ${WEB_PORT} not responding (may be normal)"
  fi

  [ "$gw_ok" = "1" ] && return 0 || return 1
}

# 5. Verify API
verify_api() {
  log "Step 5: verify /v1/models API"
  local api_key
  api_key=$("$NODE" -e "
const db = require('better-sqlite3')('${OMR_DIR}/config.sqlite');
const row = db.prepare(\"SELECT encrypted_key FROM api_keys WHERE id IN ('local-gateway','key-1') ORDER BY CASE id WHEN 'local-gateway' THEN 1 WHEN 'key-1' THEN 2 ELSE 3 END LIMIT 1\").get();
if (row) console.log(row.encrypted_key);
" 2>/dev/null || echo "")

  if [ -z "$api_key" ]; then
    log "  ⚠ No API key found, skipping API test"
    return 0
  fi

  local resp
  resp=$(curl -s --max-time 10 -H "Authorization: Bearer ${api_key}" \
    "http://127.0.0.1:${GATEWAY_PORT}/v1/models" 2>/dev/null)
  
  if echo "$resp" | grep -q '"object":"list"'; then
    local count
    count=$(echo "$resp" | "$NODE" -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.data?.length||0)" 2>/dev/null || echo "?")
    log "  ✓ /v1/models OK (${count} models)"
    return 0
  else
    log "  ✗ /v1/models failed: $(echo "$resp" | head -c 100)"
    return 1
  fi
}

# 6. Verify SQLite
verify_sqlite() {
  log "Step 6: verify SQLite config"
  if [ ! -f "${OMR_DIR}/config.sqlite" ]; then
    log "  ✗ config.sqlite not found"
    return 1
  fi
  
  local result
  result=$("$NODE" -e "
const db = require('better-sqlite3')('${OMR_DIR}/config.sqlite', { readonly: true });
const row = db.prepare(\"SELECT value_json FROM app_config WHERE key='default'\").get();
if (row) {
  const cfg = JSON.parse(row.value_json);
  console.log('providers=' + (cfg.Providers?.length || 0));
  console.log('profiles=' + (cfg.Profiles?.length || 0));
  console.log('virtualModelProfiles=' + (cfg.virtualModelProfiles?.length || 0));
} else {
  console.log('no config');
}
" 2>/dev/null || echo "error")
  
  log "  SQLite: $result"
  [ "$result" != "error" ] && [ "$result" != "no config" ]
}

main() {
  log "=== OMR Rebuild ==="
  
  if [ "${1:-}" = "--dry-run" ]; then
    log "[DRY RUN] 不实际执行"
    log "  Would: kill OMR -> backup -> start -> verify"
    exit 0
  fi

  kill_omr
  backup_config
  start_omr || { log "FATAL: OMR start failed"; exit 1; }
  
  local verify_ok=0
  verify_ports && verify_ok=1
  verify_api
  verify_sqlite

  log "=== Rebuild 完成 ==="
  
  if [ "$verify_ok" = "1" ]; then
    log "✓ OMR rebuilt successfully"
    exit 0
  else
    log "⚠ OMR rebuilt but verification incomplete"
    exit 1
  fi
}

main "$@"
