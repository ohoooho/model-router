#!/bin/bash
# ============================================================
# cmd/omr-health.sh - OMR 守护 + 自检 + 飞书汇报
#
# 功能：检查 OMR 进程存活 + API 自检 + 状态变更飞书推送
# 用法：omr-health.sh [--force-alert]
# 飞书 webhook 配置：~/.omr/omr-webhook.conf
# ============================================================

set -u

CONF=~/.omr/omr-webhook.conf
STATE_FILE=/tmp/omr-health.json
LOG=~/.omr/omr-health.log
PIDFILE=~/.omr/omr.pid
GATEWAY_PORT=3456
WEB_PORT=3458
CLI="${OMR_CLI:-/root/.npm-global/lib/node_modules/@ohoooho/model-router/dist/main/cli.js}"
NODE="${NODE_BIN:-/usr/local/bin/node}"

# 取本地 gateway API key
API_KEY=""
API_KEY=$("$NODE" -e "
const db = require('better-sqlite3')('$HOME/.omr/config.sqlite');
const row = db.prepare(\"SELECT encrypted_key FROM api_keys WHERE id IN ('local-gateway','key-1') ORDER BY CASE id WHEN 'local-gateway' THEN 1 WHEN 'key-1' THEN 2 ELSE 3 END LIMIT 1\").get();
if (row) console.log(row.encrypted_key);
" 2>/dev/null || echo "")

FEISHU_WEBHOOK=""
[ -f "$CONF" ] && . "$CONF"

log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

check_proc() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then return 0; fi
  pgrep -f "model-router/dist/main/cli.js" >/dev/null 2>&1
}

start_omr() {
  nohup "$NODE" "$CLI" serve --daemon-child --no-open > ~/.omr/omr.log 2>&1 &
  echo $! > "$PIDFILE"
  sleep 6
  if pgrep -f "model-router/dist/main/cli.js" >/dev/null 2>&1; then
    log "OMR 已拉起 pid=$(cat $PIDFILE)"
    return 0
  else
    log "OMR 拉起失败！"
    return 1
  fi
}

api_test() {
  [ -z "$API_KEY" ] && { echo "NO_KEY"; return 1; }
  local resp
  resp=$(curl -s --max-time 10 -H "Authorization: Bearer $API_KEY" \
    "http://127.0.0.1:${GATEWAY_PORT}/v1/models" 2>/dev/null)
  if echo "$resp" | grep -q '"object":"list"'; then
    echo "OK"
    return 0
  else
    echo "FAIL: $(echo "$resp" | head -c 100)"
    return 1
  fi
}

feishu_alert() {
  local title="$1" content="$2"
  [ -z "$FEISHU_WEBHOOK" ] && { log "无飞书 webhook，跳过推送"; return 0; }
  local payload
  payload=$("$NODE" -e "
const data = {
  msg_type: 'interactive',
  card: {
    header: { title: { tag: 'plain_text', content: process.argv[1] }, template: 'red' },
    elements: [{ tag: 'div', text: { tag: 'lark_md', content: process.argv[2] } }]
  }
};
console.log(JSON.stringify(data));
" "$title" "$content")
  curl -s --max-time 10 -X POST "$FEISHU_WEBHOOK" \
    -H "Content-Type: application/json" -d "$payload" >/dev/null 2>&1
  log "飞书推送: $title"
}

main() {
  local proc_ok=0 api_ok=0 started=0 alert_reason=""
  local prev_state=""
  [ -f "$STATE_FILE" ] && prev_state=$(grep -o '"state":"[^"]*"' "$STATE_FILE" 2>/dev/null | head -1 | cut -d'"' -f4)

  if check_proc; then
    proc_ok=1
  else
    log "OMR 进程不存在，尝试拉起"
    if start_omr; then
      proc_ok=1; started=1
      alert_reason="OMR 进程曾挂掉，已自动拉起"
    else
      alert_reason="OMR 进程挂掉且拉起失败！"
    fi
  fi

  local api_res=""
  if [ "$proc_ok" = "1" ]; then
    api_res=$(api_test)
    if [ "$api_res" = "OK" ]; then
      api_ok=1
    else
      alert_reason="OMR API 自检失败: $api_res"
    fi
  fi

  local state=""
  if [ "$proc_ok" = "1" ] && [ "$api_ok" = "1" ]; then
    state="ok"
  elif [ "$proc_ok" = "1" ] && [ "$api_ok" = "0" ]; then
    state="api-fail"
  else
    state="down"
  fi

  cat > "$STATE_FILE" <<EOF
{"state":"$state","time":"$(date -Iseconds)","proc":$proc_ok,"api":$api_ok,"started":$started}
EOF

  log "状态=$state proc=$proc_ok api=$api_ok started=$started"

  local need_alert=0
  [ "$state" != "$prev_state" ] && need_alert=1
  [ "$started" = "1" ] && need_alert=1
  [ "$state" != "ok" ] && need_alert=1
  [ "${1:-}" = "--force-alert" ] && need_alert=1

  if [ "$need_alert" = "1" ]; then
    if [ "$state" = "ok" ]; then
      feishu_alert "✅ OMR 恢复正常" "模型路由网关已恢复。\n**状态**: $state\n**时间**: $(date '+%F %T')"
    else
      feishu_alert "🚨 OMR 异常！" "**状态**: $state\n**原因**: ${alert_reason:-未知}\n**时间**: $(date '+%F %T')"
    fi
  fi
}

main "$@"
exit 0
