#!/usr/bin/env bash
# 0006-omr-data-dir.sh — OMR_DATA_DIR 品牌化 patch
#
# 目的: 让 OMR fork 在 apply.sh 重建后, 仍然用 OMR_DATA_DIR env
#       (而不是 OMR upstream musistudio/claude-code-router 写的 ~/.claude-code-router/)
#
# 改造依据:
# - K-243 老板 lockin "OMR fork 是我的项目"
# - 失职 247 立刻认: 首次 cli.js fix 用 heredoc 引号转义炸, sed 干净 fix 后验证 OK
# - 失职 254 立刻认: 首次想写 .patch 格式但 cli.js 巨量内容淹没 exec 输出, 改用 sed script 更稳
#
# 适用场景:
# - 全新装机 (install.sh v2 第 5 步之后)
# - 重建 (apply.sh 重新解包 npm 后)
# - 老板升级 OMR fork 时
#
# 用法:
#   sudo bash patches/0006-omr-data-dir.sh /usr/local/lib/node_modules/@ohoooho/model-router/dist/main/cli.js
#
# 效果:
#   1. 在 shebang 后插入 getOMRDataDir() helper (Linux/Darwin: ~/.omr 或 $OMR_DATA_DIR; Windows: %APPDATA%/omr)
#   2. 替换 path.join(appData, "claude-code-router") → path.join(appData, "omr")
#   3. 替换 return path.join(os.homedir(), ".claude-code-router") → return getOMRDataDir()
#   4. 替换 .claude-code-router marker → .omr marker (用于配置迁移)
#
# 备份: 自动在原文件旁生成 cli.js.bak-omr-data-dir-XXXX
#
# 验证: bash -n $CLI && node --check $CLI 必须通过
set -euo pipefail

CLI="${1:-/usr/local/lib/node_modules/@ohoooho/model-router/dist/main/cli.js}"

if [ ! -f "${CLI}" ]; then
  echo "❌ cli.js 不存在: ${CLI}"
  exit 1
fi

# 备份 (避免重复备份)
BAK="${CLI}.bak-omr-data-dir-$(date +%H%M)"
if ls "${CLI}".bak-omr-data-dir-* >/dev/null 2>&1; then
  echo "⚠️ 已有 bak, 跳过备份"
else
  cp -p "${CLI}" "${BAK}"
  echo "✅ 备份: ${BAK}"
fi

# 幂等检查: 失职 255 立刻认 — helper 不能插 2 次
if grep -q 'function getOMRDataDir' "${CLI}"; then
  echo "⚠️ helper 已存在, 跳过插入 (幂等)"
else
  # 1. 插入 helper (用 sed a 命令, shebang 后)
  HELPER='function getOMRDataDir(){var p=process.env.OMR_DATA_DIR;if(p&&p.trim())return p.trim();var os=require("os");var path=require("path");if(process.platform==="win32"){return path.join(process.env.APPDATA||process.env.LOCALAPPDATA||"","omr")}return path.join(os.homedir(),".omr")}'
  sed -i "1 a ${HELPER}" "${CLI}"
  echo "✅ helper 已插入"
fi

# 2-4. 3 处 hardcoded 路径替换
sed -i 's|path\.join(appData, "claude-code-router")|path.join(appData, "omr")|' "${CLI}"
sed -i 's|return path\.join(os\.homedir(), "\.claude-code-router");|return getOMRDataDir();|' "${CLI}"
sed -i 's|const marker = path\.sep + "\.claude-code-router" + path\.sep;|const marker = path.sep + ".omr" + path.sep;|' "${CLI}"

# 验证
echo "=== 验证 ==="
echo "OMR_DATA_DIR_count: $(grep -c OMR_DATA_DIR "${CLI}")"
echo "getOMRDataDir_count: $(grep -c getOMRDataDir "${CLI}")"
echo "claude-code-router_remaining: $(grep -c claude-code-router "${CLI}")"

if node --check "${CLI}" 2>/dev/null; then
  echo "✅ node --check 语法 OK"
else
  echo "❌ node --check 语法失败, 立即回滚"
  cp -p "${BAK}" "${CLI}"
  exit 2
fi

echo "✅ 0006 应用成功"
