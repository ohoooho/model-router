# OMR Component Manifest v2

> 改造依据: docs/COMPONENT-INSTALLATION-CONTRACT.md V1 (md 17:30 commit 8da0744)
> 改造者: baxian (失职 213-217)
> 改造时间: 2026-09-20 17:40

## 版本 (契约 §3.2 release.channels)

| channel | version | 状态 |
|---|---|---|
| stable | `0.1.0-fork3.0.18+p5` | 当前默认 (已装 123 端) |
| beta | `0.2.0-fork3.0.18+p6` | 占位 (未发布) |

semver 命名规则 (老板 14:29 建议):
```
omr-<semver>-fork<base>+p<n>
  ├─ <semver>: 自家 semver
  ├─ fork<base>: 上游 fork base (claude-code-router)
  └─ +p<n>: 自家 patch 数 (5 个 K-251/272/273/294/295)
```

## 物料清单 (BOM) — 契约 §4 标准结构

| 文件 | 契约要求 | 必备 | 路径 |
|---|---|---|---|
| `component.yaml` | §5 12 section 必填 | ✅ | install/component.yaml |
| `component.context.json` | §6.2 模板 | ✅ | install/component.context.json |
| `install.sh` | §7.1 install 入口 | ✅ | install/install.sh |
| `configure.sh` | §7.2 configure 入口 | ✅ | install/configure.sh |
| `write-config.js` | 配合 configure 写 SQLite | ✅ | install/write-config.js |
| `verify.sh` | §7.3 doctor (4 状态) | ✅ | install/verify.sh |
| `e2e-test.sh` | 真路由测试 | ✅ | install/e2e-test.sh |
| `backup.sh` | 备份 config | ✅ | install/backup.sh |
| `rollback.sh` | 回滚 | ✅ | install/rollback.sh |
| `uninstall.sh` | §7.4 卸载 (TODO: 复用 rollback) | ⏳ | — |
| `omr.service` | systemd unit | ✅ | install/omr.service |
| `config.template.json` | 旧版兼容 | ⏳ deprecated | install/config.template.json |
| `web-ui.template.html` | Web UI (SSR) | ✅ | install/web-ui.template.html |
| `web-ui-gen.sh` | SSR 注入器 | ✅ | install/web-ui-gen.sh |
| `README.md` | 人类可读 + 人工安装说明 | ✅ | install/README.md |

## 4 状态验证 (契约 §7.3)

verify.sh 输出 4 状态:

| 状态 | 检查项 | 123 端当前 |
|---|---|---|
| installed | ccr 命令 + 装包目录 + package.json | ✅ |
| configured | config.sqlite + schema 合法 + providers ≥ 2 + vmodels ≥ 3 | ❌ (没跑 configure) |
| healthy | omr.service active + 3456/3458 端口 | ❌ (失职 215 没装 service) |
| upstream_ready | POST /v1/chat/completions = 200 | ⏳ (待 3456 起来) |

## 装时需要的输入 (契约 §6.1 inputs 声明)

| input | kind | source | 必需 |
|---|---|---|---|
| `baozi_api_key` | secret | order_material / user_prompt | 否 (OMR 用 fake_key) |
| `omr_admin_api_key` | secret | generated (openssl rand) | 否 (自动生成) |
| `license_path` | path | default | 否 |
| `enable_background_service` | boolean | default=true | 否 |

## 系统要求 (契约 §5.1 platforms)

| OS | arch | 实测 | 状态 |
|---|---|---|---|
| linux | x86_64 | 123 端 v22.19.0 | ✅ |
| linux | arm64 | 老板 orangepi5b | ⏳ 待测 |
| macos | arm64 | — | ❌ 暂未声明 |
| macos | x86_64 | — | ❌ 暂未声明 |
| windows | x64 | — | ❌ 不支持 |

## 装时环境变量 (合同外, 兼容老调用)

- `OMR_VERSION` (默认: `default_version`)
- `OMR_INSTALL_MODE` (`online` / `offline`)
- `OMR_TARBALL` (offline 时必填)
- `OMR_BAOZI_API_KEY` (兼容老调用, 推荐用 TX_CONTEXT_FILE)
- `OMR_API_KEY` (admin key, 自动生成)
- `OMR_LICENSE_PATH` (license 文件路径)
- `OMR_OFFLINE_TARBALL_DIR` (offline tarball 目录)
- `TX_CONTEXT_FILE` (新契约: 受保护 context.json, 0600)

## 失职记录 (老板 17:34 lockin 改造发现)

| # | 失职 | 现状 |
|---|---|---|
| 213 | 没按契约写 component.yaml | ✅ 已写 12 section |
| 214 | 123 端 OMR 空壳 (装了没启) | ⏳ 待跑 install.sh |
| 215 | 123 端没装 systemd unit | ✅ install.sh v2 已加 (systemctl enable + restart) |
| 216 | 123 端没监听 3456/3458 | ⏳ 待 systemctl restart 完 |
| 217 | install.sh 没 @版本 | ✅ v2 已加 `@ohoooho/model-router@${OMR_VERSION}` |

## 下一步

1. ⏳ rsync install/ 物料到 123 端
2. ⏳ 跑 install.sh (online + @版本)
3. ⏳ 跑 verify.sh 看 4 状态
4. ⏳ commit + push (老板 K-302 我不动, 给老板建议)

## patches/ 子目录

- `patches/0006-omr-data-dir.sh`: OMR_DATA_DIR 品牌化 patch (77 行, sed-based, 幂等). apply.sh 重建后或升级 OMR fork 时调用, 保持 ~/.omr 路径而不是 OMR upstream musistudio/claude-code-router 写的 ~/.claude-code-router/. 失职 255 闭环 (helper 不能插 2 次).
