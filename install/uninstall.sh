#!/usr/bin/env bash
set -Eeuo pipefail

echo "停止 OMR 服务（如果存在）"
if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files omr.service >/dev/null 2>&1; then
  systemctl disable --now omr.service 2>/dev/null || true
  rm -f /etc/systemd/system/omr.service
  systemctl daemon-reload 2>/dev/null || true
fi

if command -v npm >/dev/null 2>&1; then
  npm uninstall -g @ohoooho/model-router || true
fi

echo "✅ OMR 程序和 Linux 服务已移除；${OMR_DATA_DIR:-$HOME/.omr} 配置数据保留。"
