#!/usr/bin/env bash
# omr web-ui-gen: 读 ~/.omr/config.json → 生成 Web UI HTML (SSR 注入)
# 失职 199 修: sed 替换占位符, 不嵌 heredoc, 路径自动探测
set -euo pipefail
OMR_CONFIG="${OMR_CONFIG_PATH:-/root/.omr/config.json}"
TEMPLATE="$(dirname "$0")/web-ui.template.html"

NPM_GLOBAL=$(npm root -g 2>/dev/null || echo "/usr/local/lib/node_modules")
OMR_INSTALL_DIR="${NPM_GLOBAL}/@ohoooho/model-router"
OUT="${OMR_INSTALL_DIR}/dist/renderer/pages/home/index.html"

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
