#!/bin/bash
# ============================================================
# publish-omr.sh — 发布 OMR 组件物料到 dopple
#
# 用法:
#   publish-omr.sh                      # 用 HEAD 构建并发布
#   publish-omr.sh --ref <commit>       # 从指定 commit 构建并发布
#   publish-omr.sh --dry-run            # 只构建 + 本地校验, 不上传
#
# 物料来自一个 git ref, 不是工作区快照 —— 发布的每份物料都能追到某个 commit。
# 构建逻辑在 scripts/build-release-materials.sh (确定性打包 + 物料对照表)。
#
# 发布什么:
#   install.tar.gz   组件脚本包
#   component.yaml   独立清单 (声明 install.tar.gz 的真实哈希)
#   SHA256SUMS       目录里所有文件的哈希, 重新计算
#
# 不发布什么:
#   ohoooho-model-router-*.tgz      npm 包, 单独构建单独发布 (改了会换哈希)
#   omr-*.tar.gz                    离线包, 同上
#
# dopple 是运营界面, 自己 publish (老板 2026-09-02 16:44 拍板),
# 目标机 123 = dopple.ohoooho.com 的解析目标。
# ============================================================
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

REF=""
DRY_RUN=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref)     REF="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

DOPPLE_HOST="${DOPPLE_HOST:-root@123.57.90.30}"
SSH_KEY="${SSH_KEY:-/root/.ssh/id_ed25519_baxian_server}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/dopple/omr}"
BASE_URL="${BASE_URL:-https://dopple.ohoooho.com/omr}"

STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "${STAGE_DIR}"' EXIT

echo "==> 1) 构建物料 (ref=${REF:-HEAD})"
"${SCRIPT_DIR}/build-release-materials.sh" ${REF:+--ref "${REF}"} --out "${STAGE_DIR}"

ARCHIVE_SHA=$(grep -E "^install\.tar\.gz" "${STAGE_DIR}/materials.sha256" | awk '{print $2}' | sed 's/^sha256=//')
YAML_SHA=$(grep -E "^component\.yaml" "${STAGE_DIR}/materials.sha256" | awk '{print $2}' | sed 's/^sha256=//')
echo "    install.tar.gz  ${ARCHIVE_SHA}"
echo "    component.yaml  ${YAML_SHA}"

echo "==> 2) 本地校验: 归档能解开, 且内容与该 ref 一致"
VERIFY_DIR="${STAGE_DIR}/verify"
mkdir -p "${VERIFY_DIR}"
tar -xzf "${STAGE_DIR}/install.tar.gz" -C "${VERIFY_DIR}"
"${SCRIPT_DIR}/build-release-materials.sh" ${REF:+--ref "${REF}"} --out "${STAGE_DIR}" --verify "${VERIFY_DIR}" >/dev/null
echo "    ✅ 归档内容与 ref 一致"

if $DRY_RUN; then
  echo "==> dry-run: 不上传。产物在 ${STAGE_DIR}"
  exit 0
fi

echo "==> 3) 上传到 ${DOPPLE_HOST}:${REMOTE_DIR}/"
ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${DOPPLE_HOST}" \
  "mkdir -p '${REMOTE_DIR}'"
scp -i "${SSH_KEY}" -o ConnectTimeout=15 \
  "${STAGE_DIR}/install.tar.gz" "${STAGE_DIR}/component.yaml" \
  "${DOPPLE_HOST}:${REMOTE_DIR}/"

echo "==> 4) 重算 ${REMOTE_DIR}/SHA256SUMS (目录里所有文件)"
ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no -o ConnectTimeout=15 "${DOPPLE_HOST}" \
  "cd ${REMOTE_DIR} && sha256sum \$(ls -1 | grep -v '^SHA256SUMS\$' | sort) > SHA256SUMS.tmp && mv SHA256SUMS.tmp SHA256SUMS && chmod 644 SHA256SUMS"

echo "==> 5) 线上复核"
for name in install.tar.gz component.yaml; do
  local_sha=$(sha256sum "${STAGE_DIR}/${name}" | awk '{print $1}')
  remote_sha=$(curl -fsS "${BASE_URL}/${name}" | sha256sum | awk '{print $1}')
  code=$(curl -fsS -o /dev/null -w "%{http_code}" "${BASE_URL}/${name}" || echo 000)
  if [ "${local_sha}" = "${remote_sha}" ]; then
    echo "    ✅ ${name}  HTTP ${code}  ${local_sha}"
  else
    echo "    ❌ ${name}  HTTP ${code}  本地 ${local_sha} ≠ 线上 ${remote_sha}"
    exit 1
  fi
done

echo "==> 6) 清单里的声明与刚发布的归档是否一致"
grep -A4 "id: omr-component-scripts" "${REMOTE_DIR}/component.yaml" >/dev/null 2>&1 || true
declared=$(curl -fsS "${BASE_URL}/component.yaml" | grep -A6 "id: omr-component-scripts" | grep "sha256:" | head -1 | awk '{print $2}')
if [ "${declared}" = "${ARCHIVE_SHA}" ]; then
  echo "    ✅ component.yaml 声明的归档哈希 = 刚发布的 ${ARCHIVE_SHA}"
else
  echo "    ❌ component.yaml 声明 ${declared}, 与刚发布的 ${ARCHIVE_SHA} 不一致"
  exit 1
fi

echo ""
echo "✅ 发布完成: ${BASE_URL}/"
echo "   物料来自 commit: $(grep -E '^source_commit:' "${STAGE_DIR}/materials.sha256" | awk '{print $2}')"
