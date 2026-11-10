# OMR Patches — 应用指南

**上游**: musistudio/claude-code-router
**基线**: 4560c6c（fork claude-code-router v3.0.18）
**生成**: 2026-08-11（git format-patch）

---

## 应用顺序（必须按编号）

| # | 补丁 | 内容 | 冲突风险 |
|---|------|------|----------|
| 001 | readme-fork.md | README fork 来源声明 | 低（README 文案）|
| 002 | readme-omr-brand | README OMR 品牌化 | 低（README 文案）|
| 003 | publish-omr-script | 发布脚本 publish-omr.sh | 低（新增文件）|
| 004 | docker-omr-brand | docker-compose OMR 化 | 低（配置）|
| 005 | api-key-prefix | API key 前缀 ccr- → omr- | 中（SQLite/API 逻辑）|
| 006 | hide-provider | /v1/models 隐藏 provider（001+003）| **高**（model-discovery.ts 核心）|
| 007 | internal-rename | ccr-* → omr-* 内部命名 | **高**（10 文件 16 处）|

## 应用命令

```bash
cd /root/ohoooho-model-router
git checkout upstream/main -b upgrade/v4.x

for p in patches/00*.patch; do
  echo "=== 应用 $p ==="
  git apply --check "$p" && git apply "$p" || echo "⚠️ $p 冲突，需手动处理"
done
```

## 冲突处理

1. 冲突的补丁 → 打开对应源文件看改动点
2. 查 `docs/OMR-FORK-PATCHES.md` 对应编号的「冲突风险」指引
3. 手动解决后 `git add + git commit`
4. **注意**：如果上游自己实现了补丁的功能（如隐藏 provider），**跳过该补丁**，标记「上游已实现」

## 高冲突补丁的替代方案

006 / 007 冲突时（上游大改 model-discovery / 重命名）：
- 不硬重放，**手动重新实现**（改的地方不多，对照 OMR-FORK-PATCHES.md 的「改动」清单逐个核对）
- 这比解冲突更稳——补丁的语义比补丁的文本重要

## 升级后验证

```bash
npm run build:assets
node packages/core/dist/main/cli.js serve --daemon-child --no-open &
curl -H "Authorization: Bearer <key>" http://127.0.0.1:3456/v1/models   # 确认无 provider 前缀
```

## 注意

- 本目录补丁会随修改更新（新增修改 → 新补丁）
- 补丁与 `dopple/OMR-FORK-UPDATE-GUIDE.md`、`dopple/OMR-FORK-PATCHES.md` 三处同步维护
