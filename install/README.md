# OMR component installer

这些脚本是 OMR 组件自己的生命周期实现。桃仙 Installer 只提供受保护的
`TX_CONTEXT_FILE`，并依次调用 `install.sh`、`configure.sh` 和 `verify.sh`。

## 在线安装

```bash
./install.sh --online
./verify.sh
```

正式发布时 `component.yaml` 的 `release.default_version` 必须和
`packages/cli/package.json` 以及已发布 npm 包一致，不能使用 `latest`。

## 配置输入

组件从 `TX_CONTEXT_FILE` 读取输入；密钥文件应为 0600，不能放入命令行。
没有订单密钥时，脚本可以写入 fake 占位，但 doctor 必须把上游能力标为
`skipped`，不能把占位符当成真实成功。

## 离线安装

离线包必须由发行流程先校验 SHA-256，再通过 `OMR_TARBALL` 传入：

```bash
OMR_INSTALL_MODE=offline OMR_TARBALL=./omr-package.tgz ./install.sh --offline
```

离线物料打包和跨平台验证仍是发行前工作，不由本脚本临时下载。

## 备份与回滚

配置写入前会备份 `config.sqlite` 以及存在的 `-wal`/`-shm` sidecar：

```bash
./backup.sh
./rollback.sh
```

回滚和卸载都保留用户数据；如需彻底删除数据，必须由用户明确执行删除命令。
