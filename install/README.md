# OMR component installer

在线安装模式优先使用当前 npm registry 安装指定版本。若 registry 元数据查询失败但本地
OMR tarball 存在，脚本不会把在线安装误切成 `--offline`；它会对本地 tarball执行在线安装，
由 npm 按当前 registry/proxy 获取缺失依赖。只有显式指定 `--offline` 时才使用 npm cache-only
模式；离线安装必须预先缓存完整的传递依赖，否则会返回明确的 `ENOTCACHED`。

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

已有 OMR 时，脚本会跳过覆盖和升级。

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

## 离线安装

离线包必须由发行流程先校验 SHA-256，再通过 `OMR_TARBALL` 传入：

```bash
OMR_INSTALL_MODE=offline OMR_TARBALL=./omr-package.tgz ./install.sh --offline
```

离线 npm tarball 仍可能需要本机已有依赖缓存；发行流程如果要做到完全断网，必须同时
交付依赖缓存，或将运行时依赖随物料打包。

离线物料打包和跨平台验证仍是发行前工作，不由本脚本临时下载。

## 备份与回滚

配置写入前会备份 `config.sqlite` 以及存在的 `-wal`/`-shm` sidecar：

```bash
./backup.sh
./rollback.sh
```

回滚和卸载都保留用户数据；如需彻底删除数据，必须由用户明确执行删除命令。
