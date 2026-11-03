#!/usr/bin/env bash
# omr web-ui-gen: 读 ~/.omr/config.json → 生成 Web UI HTML (SSR 注入)
#
# ⚠️ 2026-11-03 实测: 本脚本是【死代码】, 跑不通也用不上
#   ① 全仓无任何脚本调用它 (只在 install/MANIFEST.md 登记)
#   ② OMR fork 已改用 config.sqlite, ~/.omr/config.json 不存在 → 第一步就退出
#   ③ 2026-09-20 曾被手动跑过一次, 把当时机器的 React GUI 覆盖成只读页
# 保留它只为兜底: 若将来要恢复 SSR 注入, 改读 sqlite 即可。
# 失职 199 修: sed 替换占位符, 不嵌 heredoc, 路径自动探测
set -euo pipefail
OMR_CONFIG="${OMR_CONFIG_PATH:-/root/.omr/config.json}"
TEMPLATE="$(dirname "$0")/web-ui.template.html"

NPM_GLOBAL=$(npm root -g 2>/dev/null || echo "/usr/local/lib/node_modules")
OMR_INSTALL_DIR="${NPM_GLOBAL}/@ohoooho/model-router"
OUT="${OMR_INSTALL_DIR}/dist/renderer/pages/home/index.html"

# ---- 防覆盖护栏 (2026-11-03 加) ----------------------------------------
# 背景: 这个脚本会把 19.9KB 的手写只读页写到 dist/renderer/pages/home/index.html,
#   而那个路径【本该】是 React GUI 的挂载壳 (767B, 指向 ../../assets/main.js)。
#   一旦覆盖, 完整 GUI (Providers/Server/Agent Profiles) 就退化成只读展示,
#   且 RPC 鉴权页拿不到 token -> 变成"能看不能点"。
# 事实: 本脚本【不被任何装机脚本调用】(全仓只在 install/MANIFEST.md 登记),
#   2026-09-20 曾被手动跑过一次, 把当时的机器污染成了只读页。
# 规则: 目标已经是 React 壳时【默认拒绝覆盖】; 要覆盖必须显式 --force。
# ----------------------------------------------------------------------
FORCE=0
for a in "$@"; do
  [ "$a" = "--force" ] && FORCE=1
done

if [ -f "$OUT" ] && grep -q 'assets/main.js' "$OUT" 2>/dev/null; then
  if [ "$FORCE" != "1" ]; then
    echo "SKIP: $OUT 已是 React GUI 挂载壳, 拒绝覆盖(手写页会退化成只读展示)."
    echo "      要强制覆盖请显式加 --force."
    echo "      (正常装机流程不需要跑这个脚本: React 壳随 npm 包自带)"
    exit 0
  fi
  BACKUP="${OUT}.bak-$(date +%Y%m%d-%H%M%S)-pre-force"
  cp -a "$OUT" "$BACKUP"
  echo "WARN: --force 覆盖 React 壳, 已备份到 $BACKUP"
fi


[ -f "$OMR_CONFIG" ] || { echo "ERR: $OMR_CONFIG"; exit 1; }
[ -f "$TEMPLATE" ] || { echo "ERR: $TEMPLATE"; exit 1; }
[ -d "$OMR_INSTALL_DIR" ] || { echo "ERR: $OMR_INSTALL_DIR 不存在"; exit 1; }

# 写 SSR JSON 到 tmp 文件 (避免 shell 嵌 heredoc)

JSON_DATA_FILE=/tmp/omr-ssr-data.json
python3 - "$OMR_CONFIG" "$JSON_DATA_FILE" <<'PYEOF'
import json, sys, os, re
config_path, out_path = sys.argv[1], sys.argv[2]
with open(config_path) as f: c = json.load(f)
def mask(k):
    if not k or re.match(r'^[*]+$|^fake-', k): return '***'
    return k[:4]+'***'+k[-4:] if len(k)>8 else '***'
providers = [{'name':p['name'],'enabled':p.get('enabled',True),'fake':bool((p.get('_meta') or {}).get('fake_key')) or bool(re.match(r'^[*]+$|^fake-', p.get('api_key',''))),'baseUrl':p.get('api_base_url',''),'models':p.get('models',[]),'apiKeyMasked':mask(p.get('api_key',''))} for p in c.get('Providers',[])]
vmodels = [{'id':v['id'],'displayName':v.get('displayName',v['id']),'enabled':v.get('enabled',True),'strategy':v.get('strategy','priority'),'userSelectable':((v.get('metadata') or {}).get('user_selectable',False))} for v in c.get('VirtualModels',[])]
data = {'providers':providers,'virtualModels':vmodels,'configBytes':os.path.getsize(config_path),'configMtime':os.path.getmtime(config_path)}
with open(out_path, 'w') as f: f.write(json.dumps(data, ensure_ascii=False))
print(f'SSR JSON: {os.path.getsize(out_path)} bytes')
PYEOF

# 用 python 安全替换占位符 (避免 sed 转义 + 多行 JSON 难处理)
python3 - "$TEMPLATE" "$JSON_DATA_FILE" "$OUT" <<'PYEOF'
import sys
template_path, data_file, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
with open(template_path) as f: t = f.read()
with open(data_file) as f: data = f.read()
with open(out_path, 'w') as f: f.write(t.replace('{{OMR_CONFIG_DATA}}', data))
import os
print(f'OK: {os.path.getsize(out_path)} bytes -> {out_path}')
PYEOF

rm -f "$JSON_DATA_FILE"
systemctl restart omr
sleep 3
echo "✅ Web UI 生成完, OMR 已 reload"
