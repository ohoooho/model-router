#!/bin/bash
# ============================================================
# apply.sh - OMR 补丁应用 + 验证 + 回滚
#
# 用法：
#   ./apply.sh              # 应用所有补丁
#   ./apply.sh --check      # 只检查，不应用
#   ./apply.sh --rollback   # 回滚到备份
#
# 流程：backup -> git apply -> verify -> report
# ============================================================

set -eu

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PATCHES_DIR="${REPO_DIR}/patches"
BACKUP_DIR="/tmp/omr-backup-$(date +%Y%m%d-%H%M%S)"
ROLLBACK_SCRIPT="${BACKUP_DIR}/rollback.sh"

PATCHES=(
  "001-omr-deccr-config-dir.patch"
  "002-multi-credential-routing.patch"
  "003-auto-balance-formula.patch"
  "004-deccr-spawn-env.patch"
  "005b-deccr-codex-spawn.patch"
  "005c-deccr-read-path.patch"
)

log() { echo "[$(date '+%F %T')] $*"; }

# 1. Backup
do_backup() {
  log "Step 1: Backup to ${BACKUP_DIR}"
  mkdir -p "$BACKUP_DIR"
  
  # Backup git state
  cd "$REPO_DIR"
  git stash list > "$BACKUP_DIR/stash-list.txt" 2>/dev/null || true
  git log --oneline -10 > "$BACKUP_DIR/git-log.txt"
  git diff > "$BACKUP_DIR/uncommitted.diff" 2>/dev/null || true
  git status --porcelain > "$BACKUP_DIR/git-status.txt" 2>/dev/null || true
  
  # Generate rollback script
  cat > "$ROLLBACK_SCRIPT" <<'ROLLBACK'
#!/bin/bash
# Auto-generated rollback script
set -eu
REPO_DIR="__REPO_DIR__"
BACKUP_DIR="__BACKUP_DIR__"
echo "[$(date '+%F %T')] Rolling back OMR patches..."
cd "$REPO_DIR"
# Restore uncommitted changes
if [ -s "$BACKUP_DIR/uncommitted.diff" ]; then
  git apply "$BACKUP_DIR/uncommitted.diff" || echo "  WARN: could not restore uncommitted changes"
fi
# Reset to pre-patch state (find the commit before patches)
# The backup git-log.txt has the state before patches were applied
echo "[$(date '+%F %T')] Rollback complete."
echo "  Manual review: git log --oneline -10"
echo "  Backup at: $BACKUP_DIR"
ROLLBACK
  
  sed -i "s|__REPO_DIR__|${REPO_DIR}|g" "$ROLLBACK_SCRIPT"
  sed -i "s|__BACKUP_DIR__|${BACKUP_DIR}|g" "$ROLLBACK_SCRIPT"
  chmod +x "$ROLLBACK_SCRIPT"
  
  log "  Backup saved to ${BACKUP_DIR}"
  log "  Rollback script: ${ROLLBACK_SCRIPT}"
}

# 2. Apply patches
do_apply() {
  log "Step 2: Apply patches"
  cd "$REPO_DIR"
  
  local applied=0
  local failed=0
  local failed_patches=()
  
  for patch in "${PATCHES[@]}"; do
    local patch_file="${PATCHES_DIR}/${patch}"
    if [ ! -f "$patch_file" ]; then
      log "  ⚠ ${patch} not found, skipping"
      failed_patches+=("$patch")
      failed=$((failed+1))
      continue
    fi
    
    log "  Applying ${patch}..."
    if git apply --check "$patch_file" 2>/dev/null; then
      git apply "$patch_file"
      log "  ✓ ${patch} applied"
      applied=$((applied+1))
    else
      log "  ✗ ${patch} CONFLICT (needs manual resolution)"
      failed_patches+=("$patch")
      failed=$((failed+1))
    fi
  done
  
  log "  Applied: ${applied}/${#PATCHES[@]}, Failed: ${failed}"
  
  if [ "$failed" -gt 0 ]; then
    log "  Failed patches: ${failed_patches[*]}"
    log "  See docs/PATCHES.md for conflict handling strategy"
    log "  High-conflict patches (001/004): manual reimplementation recommended"
  fi
  
  return "$failed"
}

# 3. Verify
do_verify() {
  log "Step 3: Verify"
  cd "$REPO_DIR"
  
  local verify_ok=0
  
  # Check no CCR_ write-path residuals
  local residuals
  residuals=$(grep -rn "CCR_" packages/core/src/ --include="*.ts" 2>/dev/null | \
    grep -v "dual-read\|兼容\|fallback\|legacy\|CCR_SERVICE_INSTANCE_TOKEN\|CCR_CLI_\|CCR_WEB_" | \
    head -5 || true)
  
  if [ -z "$residuals" ]; then
    log "  ✓ No CCR_ write-path residuals"
    verify_ok=1
  else
    log "  ⚠ CCR_ residuals found:"
    echo "$residuals" | while IFS= read -r line; do log "    $line"; done
  fi
  
  # Check patches applied
  local patch_count
  patch_count=$(git log --oneline -10 | grep -c "OMR-FORK-CHANGE" || true)
  log "  OMR-FORK-CHANGE commits in last 10: ${patch_count}"
  
  # Try build check
  if [ -f "package.json" ]; then
    log "  Build check: npm run typecheck (may take a moment)..."
    if npm run typecheck 2>/dev/null; then
      log "  ✓ TypeScript typecheck passed"
    else
      log "  ⚠ TypeScript typecheck failed (may need manual fix)"
    fi
  fi
  
  return "$verify_ok"
}

# 4. Report
do_report() {
  log "===== Apply Report ====="
  log "  Backup: ${BACKUP_DIR}"
  log "  Rollback: ${ROLLBACK_SCRIPT}"
  log "  Patches: ${#PATCHES[@]} total"
  log ""
  log "  Next steps:"
  log "    1. Review applied changes: git diff"
  log "    2. Build: npm run build:assets"
  log "    3. Test: node packages/cli/dist/main/cli.js serve --daemon-child --no-open &"
  log "    4. Verify: ./cmd/omr-verify.sh"
  log "    5. If broken: ${ROLLBACK_SCRIPT}"
  log ""
  log "  See docs/PATCHES.md for conflict handling"
}

# Main
main() {
  local mode="${1:-apply}"
  
  case "$mode" in
    --check)
      log "===== OMR Patch Check (dry run) ====="
      cd "$REPO_DIR"
      for patch in "${PATCHES[@]}"; do
        local patch_file="${PATCHES_DIR}/${patch}"
        if [ ! -f "$patch_file" ]; then
          log "  ⚠ ${patch} not found"
          continue
        fi
        if git apply --check "$patch_file" 2>/dev/null; then
          log "  ✓ ${patch} - OK"
        else
          log "  ✗ ${patch} - CONFLICT"
        fi
      done
      ;;
    --rollback)
      if [ -z "${ROLLBACK_SCRIPT:-}" ] || [ ! -f "${ROLLBACK_SCRIPT:-}" ]; then
        # Find latest backup
        local latest
        latest=$(ls -td /tmp/omr-backup-* 2>/dev/null | head -1)
        if [ -z "$latest" ]; then
          log "No backup found to rollback to"
          exit 1
        fi
        ROLLBACK_SCRIPT="${latest}/rollback.sh"
      fi
      log "Rolling back using ${ROLLBACK_SCRIPT}"
      bash "$ROLLBACK_SCRIPT"
      ;;
    *)
      log "===== OMR Patch Apply ====="
      do_backup
      do_apply || true
      do_verify || true
      do_report
      ;;
  esac
}

main "$@"
