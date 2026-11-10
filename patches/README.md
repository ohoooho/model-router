# OMR Patches - 应用指南

**上游**: musistudio/claude-code-router v3.0.18
**基线**: commit `4560c6c`（fork claude-code-router v3.0.18）
**生成**: 2026-08-12（git format-patch HEAD~6..HEAD）

---

## 应用顺序（必须按编号）

| # | 补丁文件 | commit | change-id | 冲突风险 |
|---|---------|--------|-----------|----------|
| 001 | `001-omr-deccr-config-dir.patch` | `96a21a8` | deccr | **高**（74 文件） |
| 002 | `002-multi-credential-routing.patch` | `300d3f4` | 004 | 中（3 文件） |
| 003 | `003-auto-balance-formula.patch` | `6f6bd56` | 004b | 低（2 文件） |
| 004 | `004-deccr-spawn-env.patch` | `97fe211` | 005 | **高**（17 文件） |
| 005b | `005b-deccr-codex-spawn.patch` | `acf6a6d` | 005b | 低（1 文件） |
| 005c | `005c-deccr-read-path.patch` | `1906ed3` | 005c | 低（2 文件） |

详见 `docs/PATCHES.md`。

## 应用命令

```bash
cd /root/ohoooho-model-router
git checkout upstream/main -b upgrade/v4.x

for p in patches/0*.patch; do
  echo "=== 应用 $p ==="
  git apply --check "$p" && git apply "$p" || echo "⚠️ $p 冲突，需手动处理"
done
```

## 冲突处理

高冲突补丁（001 / 004）：不硬重放，**手动重新实现**（对照 `docs/PATCHES.md` 的「核心内容」清单）。

低冲突补丁（003 / 005b / 005c）：直接 `git apply`。

## 升级后验证

```bash
npm run build:assets
node packages/cli/dist/main/cli.js serve --daemon-child --no-open &
curl -H "Authorization: Bearer <key>" http://127.0.0.1:3456/v1/models
node packages/cli/dist/main/cli.js health
```

## 旧补丁归档

`patches-archive/` 里的 7 个旧补丁（001-007）是 fork 早期的产物，已被新补丁覆盖或合并，不需要单独应用。
