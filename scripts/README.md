# scripts/ — OMR 发布与物料脚本

| 脚本 | 干什么 |
|---|---|
| `build-release-materials.sh` | 从一个 git ref 确定性地复现组件物料（`install.tar.gz` + 独立 `component.yaml` + 对照表） |
| `component-manifest.py` | 读写 `component.yaml` 的 artifacts 段（归档用的占位符版本 / 独立发布的真哈希版本） |
| `get-omr.sh` | 独立装机脚本（`curl -fsSL https://get.ohoooho.com/omr \| bash`） |
| `publish-omr.sh` | 把物料传到 dopple |

## 物料锚点

物料 = f(git ref)。同一个 ref 永远产出同一份物料。

```
scripts/build-release-materials.sh --ref <commit> --out release-materials/
```

产出：

- `install.tar.gz` — 组件脚本包
- `component.yaml` — 独立清单，声明 `install.tar.gz` 的真实 sha256 与大小
- `materials.sha256` — 物料对照表，写清每份物料来自哪个 commit

### 自哈希循环怎么破的

`install.tar.gz` 装着 `component.yaml`，而 `component.yaml` 又要声明
`install.tar.gz` 自己的 sha256 —— 直接写等于找 sha256 的不动点，算不出来。

所以**归档里**那份 `component.yaml` 把自己的 `sha256` / `size_bytes` 换成占位符
（`<self-hash-in-published-component.yaml>`），归档哈希因此与声明值无关；
真实哈希填在**独立发布**的那份里（dopple 上 `/omr/component.yaml`）。
两份只差那两行。

### 发布流程

1. `scripts/build-release-materials.sh --ref <commit> --out release-materials/`
2. 把 `install.tar.gz` 与 `component.yaml` 一起传到 dopple `/omr/`
3. 把生成的 `component.yaml` 提交回仓（它声明的就是刚发布那份归档的哈希）
4. 再跑一次步骤 1 —— 归档哈希不变（不动点），仓里的声明与已发布物料互相自洽

第 4 步能过，说明这份物料确实是从这个 commit 来的。

### 校验已发布物料来自哪个 commit

```
scripts/build-release-materials.sh --ref <commit> --out /tmp/m --verify <解开的目录>
```

逐文件比对，除 `component.yaml` 的自哈希两行外应完全一致。

## 物料源

dopple 是当前唯一物料源。github release 与 npm 公开包两路已删：

- `github.com/ohoooho/model-router` → 0 个 release
- `registry.npmjs.org/@ohoooho/model-router` → E404

留着这两路只会在 dopple 故障时把人带进必然失败的死路，掩盖真实故障点。
