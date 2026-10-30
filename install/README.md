# OMR component installer

这些脚本是 OMR 组件自己的生命周期实现。桃仙 Installer 只提供受保护的
`TX_CONTEXT_FILE`，并依次调用 `install.sh`、`configure.sh` 和 `verify.sh`。

## 在线安装

```bash
./install.sh --online
./verify.sh
```

安装位置由当前 Node/npm 环境决定，脚本不会修改用户的 npm prefix：

```bash
npm prefix -g
npm root -g
```

已有 OMR 时，脚本会跳过覆盖和升级，并且**默认不再执行 configure**，
以免重复部署覆盖现有 Provider、Key、`virtual_models` 或用户手写的模型列表。
需要显式重配时加 `--reconfigure`：

```bash
./install.sh --reconfigure
# 或
OMR_RECONFIGURE_EXISTING=1 ./install.sh
```

重配时如果某些 Key 没提供，安装器不会用空值/fake 占位覆盖已有 Key；
内置 key 也不再写默认 `rpm/tpm`。旧安装器写入的 `60/100000`、`30/50000`
只会在首次 configure 时一次性清理，之后用户自己在 UI 里设置的限流会被保留。

正式发布时 `component.yaml` 的 `release.default_version` 必须和
`packages/cli/package.json` 以及已发布 npm 包一致，不能使用 `latest`。

## Node 原生依赖

OMR 使用 `better-sqlite3` 保存本地配置和运行数据。它包含按 Node ABI
编译的原生模块，因此“npm 安装成功”不等于“当前 Node 可以运行”。
`install.sh` 会在新安装和已有安装上都执行一次真实的内存数据库加载检查；
如果发现模块是由其他 Node 版本编译的，会在 OMR 的实际安装目录自动执行
`npm rebuild`，不会修改 npm prefix，也不会覆盖用户已有的 OMR 版本。

如果自动重建仍失败，按安装器输出的实际路径手动执行：

```bash
npm rebuild --prefix "$(npm root -g)/@ohoooho/model-router" \
  better-sqlite3 --foreground-scripts --no-audit --no-fund
```

重建后再运行 `./verify.sh`，确认 `installed`、`configured` 和 `healthy`
状态均通过。升级 Node 后也应重新运行一次 OMR 安装脚本，让这项 ABI 检查
自动修复依赖。

## 配置输入

组件从 `TX_CONTEXT_FILE` 读取输入；密钥文件应为 0600，不能放入命令行。
没有订单密钥时，脚本可以写入 fake 占位，但 doctor 必须把上游能力标为
`skipped`，不能把占位符当成真实成功。

## 本地 tarball 安装

发行流程先校验 SHA-256，再通过 `OMR_TARBALL` 传入本地包：

```bash
OMR_INSTALL_MODE=offline OMR_TARBALL=./omr-0.1.0.tgz ./install.sh --offline
```

默认只固定包体（包本身从 tarball 安装），npm 依赖仍从 registry 解析。需要完全断网时，
先把依赖预热到 npm cache，再设置 `OMR_STRICT_OFFLINE=1`：

```bash
OMR_STRICT_OFFLINE=1 OMR_INSTALL_MODE=offline OMR_TARBALL=./omr-0.1.0.tgz ./install.sh --offline
```

完全离线物料（含跨平台依赖缓存）仍是发行前工作；未预热 cache 时脚本会明确失败，不会
静默改成在线安装。

## 备份与回滚

配置写入前会备份 `config.sqlite` 以及存在的 `-wal`/`-shm` sidecar：

```bash
./backup.sh
./rollback.sh
```

回滚和卸载都保留用户数据；如需彻底删除数据，必须由用户明确执行删除命令。
