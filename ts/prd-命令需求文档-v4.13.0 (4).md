# wallet-cli 命令需求文档 v4.13.0

`wallet-cli` 是一个多链 CLI 钱包，架构覆盖 TRON 与 EVM。**本版起 EVM 从「架构预留」变为「实际可用」**——同一套助记词、同一批命令，靠 `--network` 选链。

本文档为 **v4.13.0**，承接 [v4.12.0](../v4.12.0/prd-命令需求文档-v4.12.0.md)（90 条命令，治理 / SR 竞选 / 合约治理 / TRC10 / Bancor / keystore 互导已闭合）。本版两个主题：

1. **EVM 落地**——账户地址层 + 只读、转账与部署。**不新增任何命令**，而是给既有命令补 EVM family。
2. **Java 版 Standard CLI 移除**——TS 版已完整接管非交互命令行场景，**本版一次性删除**，不留弃用过渡版本（§12）。

**本版另有一次强制的启动迁移（§0）**：`ChainAddresses` 因加入 `evm` 而变为不兼容既有 `wallets.json`，注册文件必须一次迁移到齐。这是本版**唯一一处在任何命令执行之前就可能阻断**的机制，故单列为 §0。

本版新增的每一处 help 输出都必须满足统一的文案规范（§10.1）。

> **阅读方式**：先看「范围与命令一览」（本版主题 / 能力矩阵 / 命令树 / root help / 横切约定），再看 **§0（启动前置：强制迁移）** 与 §1–§2（账户模型、网络配置），然后是 §3–§9 的命令逐条规格，最后 §10–§12。
>
> **通用约定**（沿用 v4.12.0，此处只列与本版相关的）：
> - **命令文法**：`<必填>` ｜ `[可选]` ｜ `a | b`（互斥二选一）｜ `(… | …)`（互斥组必选其一）。
> - **图标**：🔒 需主密码 ｜ ✍️ 改链上状态（会广播交易）｜ ⚠️ 高风险 / 不可逆 ｜ 无图标 = 纯读 / 仅本地。
> - **输出**：text（人读，字段独占一行）与 json（envelope `wallet-cli.result.v1`）两种；text/json 对称，**输出字段必须是数据、静态说明进 help**。
> - **数量单位**：命令行与 text 用**人话单位**（TRX / ETH / gwei），json 给**链上原始值**（sun / wei）。**单位与小数位**由网络所属的 family 决定（TRX 6 位 / ETH 18 位）；**币种名称**（TRX / ETH / BNB）由**网络**决定，不由 family 决定（§2.2）。
> - **时间与时区**：一律 **UTC**、精确到秒（`YYYY-MM-DD HH:MM:SS UTC`）；键值块标签含 `time` 字样、值带 `UTC`，表格把 `(UTC)` 挂在列名上。
> - **stdout / stderr 分流**：stdout 只放结果（text 回执或 json envelope），提示、诊断、警告走 stderr。示例块中出现的 `? …` 提示行与 `password ✓ via pipe` 均来自 stderr，为还原真实终端观感而并列展示，**机器只读 stdout 即可**。
> - **「相对现状」注解**：每个 Help 输出块上方一行，说明该 help 相对现状改了什么、没改什么，便于逐条核对。
> - **示例省略**：地址、TxID、区块哈希写成 `TSRmq8kP...9dEf` / `0x7a3f...c19b` 只是排版省略，实际输出为完整值，json 亦然。

---

## 修订记录

| # | 日期 | 修订 | 依据 |
| :---: | --- | --- | --- |
| 1 | 2026-08-27 | **按实作同步全文**：§0 新增；§1–§2 / §3.2 / §3.6–§3.11 / §4.2 / §5 / §6 / §7 / §9.2–§9.3 / §10.1–§10.2 / §11 改写 | `spec-deviations-全量-v4.13.0.md` 的 A 档 26 项 + B 档 8 项（B 档均取推荐选项） |
| 2 | 2026-08-27 | **§12 改回一次性移除**：本版直接删除 Java Standard CLI，不设弃用过渡版本；头部主题与范围表同步 | PM 决策 |
| 3 | 2026-08-27 | **family 标注词表改为 `(TRON only)` / `(EVM only)`**：全文 132 处，词表规则写进 §10.1；原 v4.13.1 主题 1 整体折叠进本版 | PM 决策 |
| 4 | 2026-08-28 | **按 `e206c00a` 重新核实**：核实基准前移；修订 3 的标注改造与 §12 的 Java 移除**均已在实作落地**，两处 ⚠️ 注记删除；全局旗标文案回贴；命令数 90→91、§10 待办 46→38、§12.2 测试 2→24 / 文档 5→1 四个数字改正；help 区块示例的主网网络改回测试网 | `doc-verify-全量-v4.13.0-20260828.md` |

> **核实基准**：PR [#990](https://github.com/tronprotocol/wallet-cli/pull/990) head `feat/v4.13.0` @ `e206c00a`（2026-08-27 18:49 +0800）。
>
> **示例真实性**：§2.3 / §2.4 / §3.9 / §3.10 / §3.11 / §7.1 / §9.2 / §9.3 的示例与 help 区块为**实测输出**（`backup` 的绝对路径目录部分省略为 `<cwd>`）；§7.3 的 `Address` / `TxID` / `Fee` 已标注为设计稿；其余示例沿用原文。
> **family 标注列已追平**——修订 3 的 `(TRON only)` / `(EVM only)` 全大写词表实作已于 `e206c00a` 落地，全量 help 扫描小写残留为 0，该列现已是实测值。
>
> **本轮未做**：§10 的**命令层描述 / Args / Examples 重贴**（38 个命令层区块），见 §10 开头的待办说明。全局旗标文案（`--network` / `--timeout`）已于修订 4 回贴完毕。

---

## 范围与命令一览

### 本版主题与非目标

| 主题                       | 范围                                                                                                                                                                                                                   | 非目标（本版明确不做）                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EVM 第一档：账户地址层**        | EVM 地址编解码、family 派生、`create` / `import` 五路 / `list` / `current` / `derive` / `backup` 的 EVM 适配、**`contact` 的 family 感知改造**、EVM 网络与端点配置（§1–§3）                                                                        | ——                                                                                                                                                                          |
| **EVM 第二档：只读 + 转账 + 部署** | `account balance` / `portfolio` / `info`、`token` 全组、`tx send` / `sign` / `broadcast` / `status` / `info`、`contract call` / `send` / `deploy`、`message sign`、`typed-data sign`、`block`、`chain node` / `prices`（§4–§9） | `contract info`、`account history`、**ENS 域名解析**（后续版本支持，§1.3）、交易替换（同 nonce 提速 / 取消）、**GasFree 的 EVM 端**（后续跟进）、EVM 合约多签（Safe）、**Base / Arbitrum 等二层链**（费用模型不同，后续版本支持，§2.2）、NFT |
| **Java Standard CLI 移除** | 本版**一次性删除** 39 文件 / 6,773 行 + 入口挂钩 + 24 个测试文件 + 1 篇文档；配套命令映射表、Java 版 major 号跳跃、交互式 shell 的迁移提示、社区通知（§12） | 不动 Java 交互式 shell 本身 |
| **强制启动迁移** | `wallets.json` v1 → v2 的一次性阻断式迁移，在任何命令派发之前执行（§0） | **不做降版保护**；**未知 `source.type` 视为无秘密**（§0.4） |

### 能力矩阵（命令 × family）

**本版不新增命令，命令总数仍为 91**，变化的是「命令 × 网络」这个维度，故不再有「命令总数对照」表。

> **91 而非 90**：v4.12.0 起沿用的「90 条」是一处 off-by-one。实测 `e206c00a`：逐条抓 help 得 **91** 个命令层 help，`--json-schema` 的 `commands` 长度亦为 **91**，且**下方命令树枚举的正是这 91 条**（91 条全部能在树里找到，树里也无多余项）。本版据实改为 91，`v4.12.0` 侧的同一数字与根 `CLAUDE.md` 待 `baseline-merge` 时一并订正。矩阵与运行时的命令注册同源、不是手工维护的清单，但 **help 恒为全量**——命令树与 root help 是静态的，family 专属项靠 `(TRON only)` / `(EVM only)` 标注区分（§10.1）。

#### 本版交付（EVM）

| 档 | 组 | 命令 | EVM 侧要点 |
| :---: | --- | --- | --- |
| 一 | 本地钱包 | `create` / `import` 五路 / `list` / `current` / `derive` / `backup` | 一次产出两族地址（keystore 本就是 EVM 原生格式）；`import watch` 自动识别 `0x…`、`import ledger` 加 `--app ethereum`；地址列按网络 family；`backup --keystore` 导出私钥时按 `--network` 选族（§3.1–3.10） |
| 一 | 本地工具 | `contact add` / `list` / `remove` | **必须改造**：条目按地址格式识别 family 并持久化；**名称与地址均全局唯一，family 不对外呈现**，`--to <name>` 跨族报错（§3.11） |
| 一 | 本地工具 | `config` / `networks` | 端点可读可写；`networks` 新增 `Alias` 列、`Network` 列改放规范 id；新增 header 型 RPC 凭证（`apiKeyHeader` / `apiKey`）与只读的 `aliases` 键；`config` 展示改为完整树（§2.2–2.4） |
| 一 | —— | `use` / `rename` / `delete` / `change-password` / `encoding convert` / `address generate` / `backup --records` | **无改造**：与 family 无关，或已同时输出两族地址；仅在 `encoding convert` / `address generate` 的 help 补一句「这是编码工具、与账户模型无关」的边界说明（§3.12 给出两句原文与完整 help） |
| 二 | account | `balance` / `portfolio` / `info` | `info` 给 Balance / Nonce / Type（§4.1–4.3） |
| 二 | token | `balance` / `info` / `add` / `list` / `remove` | ERC20；`kind` 扩 `erc20`；探测兼容 bytes32（§5） |
| 二 | tx | `send` / `sign` / `broadcast` / `status` / `info` | gas 四选项、nonce、RLP raw tx（§6） |
| 二 | contract | `call` / `send` / `deploy` | 不依赖链上 ABI；deploy 地址确定性算出（§7） |
| 二 | 签名 · 链信息 | `message sign` / `typed-data sign` · `block` / `chain node` / `chain prices` | EIP-191 / EIP-712；`prices` 给 base / priority / gas price + 转账折算（§8–§9） |

#### 本版不做（EVM）

| 命令 | 结论 | 为什么 |
| --- | :---: | --- |
| `account history` | 后续 | JSON-RPC **没有**按账户查历史的接口；可用的三条路子（Etherscan 兼容 API / Blockscout / 服务商增强方法）**互不兼容**，且能力取决于用户配了哪个端点；前置＝新增 `explorer` port + `networks.<id>.explorerUrl`（key 可选）+ Requires 行（§4.4） |
| `contract info` | 后续 | 链上**不存 ABI**，只有字节码；同样依赖 explorer，或要求用户自带 ABI 文件 |
| ENS 域名解析（`--to <name>.eth`） | 后续 | 不是一条命令，是 `--to` / `--account` 的收款人形态；本版只接受 `0x` 地址。后续版本支持，解析结果必须回显、不静默替换（§1.3） |
| `gasfree` 3 条 | 后续 | **GasFree 本身正从 TRON 扩展到 Ethereum 及 EVM 兼容链**，届时它就不再是 TRON 专属服务，`info` / `transfer` / `trace` 三条的命令形状两族通用，我方跟进接入即可。增量在：开放平台端点与鉴权（是否与 TRON 端同一套 API Key）、签名结构由 TIP-712 换成 EIP-712、费用口径（TRON 端是一次性激活费 + 每笔服务费从 USDT 扣）。**前置＝GasFree 的 EVM 端正式可用**，具体档位待其上线时间明确后再定 |
| `permission` 2、`tx approvals` / `multisig`（4） | 未定档 | TRON 多签是**协议层**权限；EVM 多签是 **Safe 等合约**，属应用层，形态是 Safe 交易构造与协同签名，与现有多签命令不共用模型 |
| `account activate` / `set`（2） | 不做 | EVM 账户无需激活、链上无账户名 |
| `stake` 8、`chain params`（9） | 不做 | EVM 无质押换资源；协议参数由硬分叉决定，不可查询 |
| `proposal` 5、`witness` 3、`vote` 3、`reward` 2（13） | 不做 | EVM 无链上提案 / SR 选举 / 出块分红 |
| `asset` 6、`exchange` 6（12） | 不做 | TRC10 与 Bancor 池是 TRON 协议原生；EVM 对应物全在合约层（ERC20 已由 `token` 组覆盖，DEX 属应用） |
| `contract` 治理 4 条 | 不做 | EVM 无 origin energy limit / user resource percent / 链上 ABI 这些概念 |

### 命令树（v4.13.0）

命令集与 v4.12.0 **完全相同**（本版不增删命令），变的是标注口径：`(TRON only)` = TRON 专属，**无标注 = 两族通用**。因此 `account info`、`contract deploy`、`chain prices` 从 `(TRON only)` 行移到无标注行（本版 EVM 交付，§4.3 / §7.3 / §9.3）。

```
wallet-cli            多链 CLI 钱包(TRON + EVM,--network 选链)
│
├─ Common Commands ── 高频入口
│  ├── create         新建 HD 钱包(BIP39,一次产出两族地址)
│  ├── import         导入钱包(mnemonic/private-key/ledger/watch/keystore)
│  └── list           列出钱包 / 账号
│
├─ Management Commands ── 链上资源(--network 选链;(TRON only)=TRON 专属)
│  ├── account     balance | portfolio | info
│  │               history | activate | set                          (TRON only)
│  ├── permission  show | update                                     (TRON only)
│  ├── token       balance | info | add | list | remove
│  ├── tx          send | broadcast | status | info | sign
│  │               approvals | multisig                              (TRON only)
│  ├── gasfree     info | transfer | trace                           (TRON only)
│  ├── contract    call | send | deploy
│  │               info | clear-abi | set-origin-energy-limit
│  │               set-user-resource-percent | create2               (TRON only)
│  ├── proposal    list | show | create | approve | delete           (TRON only)
│  ├── witness     create | update | set-brokerage                   (TRON only)
│  ├── asset       issue | update | participate | unfreeze | info | list  (TRON only)
│  ├── exchange    create | inject | withdraw | trade | show | list   (TRON only)
│  ├── stake       freeze | unfreeze | withdraw | cancel-unfreeze     (TRON only)
│  │               delegate | undelegate | info | delegated
│  ├── vote        cast | list | status                              (TRON only)
│  ├── reward      balance | withdraw                                (TRON only)
│  ├── chain       node | prices
│  │               params                                            (TRON only)
│  ├── message     sign
│  ├── typed-data  sign
│  └── block <number>
│
└─ Commands ── 其余本机命令
   ├── use / current(--qr) / rename / derive / delete / config / networks
   ├── backup       <account> (--keystore) | --records                (本地)
   ├── change-password
   ├── encoding     convert               编码/地址互转(纯本地)
   ├── address      generate              随机密钥对(纯本地)
   └── contact      add | list | remove   收款人通讯录(纯本地)
```

### 横切约定（本版新增，全文有效）

- **一个账户、多链地址**：账户是链无关的身份。`--account` 选谁、`--network` 选哪条链，两者正交。
- **原生币单位由 family 决定，币种名称由网络决定**：**单位与小数位**归 family——TRX/sun（6 位）、ETH/wei（18 位）；**币种名称**（TRX / ETH / BNB）归**网络**——`eip155:1` 与 `eip155:56` 同族但币种是 ETH 与 BNB，族级 symbol 对其中一条链必然是错的。分界线是：**族拥有编码与算术规则，网络拥有那条链的身份**（§2.2 的内置网络表因此有「原生币」列）。json 字段随单位命名：TRON 侧 `feeSun` 不变，EVM 侧 `feeWei`。
- **gas 价格单位一律 gwei**：命令行接受 `--max-fee 25` 与 `--max-fee 25gwei` 两种写法（后缀大小写不敏感）；**`wei` / `ether` 等其他单位点名拒绝**并报 `invalid_value`，不静默改读——`--max-fee 0.01ether` 与 `--max-fee 25` 差十亿倍，打错的代价就是实付费用差十亿倍。text `21.0 gwei`，json 给 wei 整数字符串。**本条同时列入 §1.4 的规则表**，因为各命令引用的是那张表。
- **family 不匹配显式报错**：账户与网络不符、raw tx 与网络不符，统一 `family_mismatch`。
- **签名能力按账户类型分档，全部 ✍️ / 🔒 命令通用**：软件账户（seed / private-key / keystore）本地解密后签名；**观察账户没有私钥，一律拒绝签名，报 `watch_only_no_signer`**；Ledger 账户在设备上签名，需设备连接并解锁，少数交易类型 Ledger app 不支持时报 `ledger_unsupported`。各命令小节不再重复这条。
- **EVM 侧不为既有命令新增 family 专属字段**：EVM 沿用该命令在 TRON 下已有的字段集，只换值与单位；某个字段两族语义不同才按 family 取舍（如 `account info` 的 `Nonce` / `Type`）。**全文新增的输出字段限于下列各处，除此之外不得新增**：`list` 的 `derivationPath`（§3.7）、`networks` 的 `Alias` 与 `Endpoint` 列（§2.3）、`config` 的 `networks.<id>` 对象形状与 `aliases`（§2.4）、`tx status` / `tx info` 的 `Confirmations`（§6.4–6.5）、`portfolio` 代币条目的 `id` 与两个价格状态字段 `priceUnavailable` / `balanceUnavailable`（§4.2）、`account info` 的 `decimals`（§4.3）、`chain prices` 的 `feeModel`（§9.3）、`tx info` 透传的 `transaction` / `receipt` 两个原始对象（§6.5）、`tx broadcast --dry-run` 的 `checks`（§6.3）。**其中两族同时生效的是**：`derivationPath`、`Confirmations`、`id`、价格状态字段；`feeModel` / `decimals` / 透传对象 / `checks` 按各族既有形状对齐（TRON 侧 `tx info` 本就透传 `transaction` / `info` 两个原始对象）。既有的字段级不一致（如 `token info` 的 `totalSupply` 在 json 与 help 里有、text 没有）本版不处理，见 §5.2。
- **text 输出只有四种形状**：无标题的 `<字段>  <值>` 块 · `<标题>: <值>` + 缩进字段 · `<标记> <动词摘要>` + 缩进字段（标记 ✅/❌/⏳/⚠️/❓）· **Markdown 管道表格**（含 `| --- |` 分隔行）。本版全部 EVM 示例按此书写。
- **EVM 写命令继承既有横切**：`--dry-run` / `--sign-only` / `--build-only` / `--wait` / `--wait-timeout` 语义不变。
- **family 专属 flag 在 help 里全量展示、按族标注，不按网络裁剪**：help 是**静态**的——`--network` 不影响它，渲染层把各 family 的 flag 合并后一次列全。故 TRON 的 `--asset-id` / `--fee-limit` / `--permission-id` 与 EVM 的 `--gas-limit` / `--max-fee` / `--priority-fee` / `--nonce` **会同时出现在 `tx send --help` 里**，各自行尾标 `(TRON only)` / `(EVM only)`——沿用 root help 已在用的组级标注体例（`stake … (TRON only)`）。**运行时仍按 family 严格校验**：EVM 网络上传 `--fee-limit` 会被该网络拒绝，报 `invalid_option`。

---

## 0. 启动前置：强制迁移

> **本版新增的机制，先于一切命令发生。** 位置反映执行顺序：读者读到任何命令规格之前，就该知道有这道闸门。

### 0.1 为什么需要

`ChainAddresses` 是**完整类型**，加入 `evm` 之后，既有的 `wallets.json` 对自己的类型失效。两条路：

| 方案 | 代价 |
| --- | --- |
| 类型改成 `Partial` | **每一处读取**都要处理「这一族可能没有」 |
| **一次迁移到齐**（采用） | 一次阻断式启动迁移 |

选后者，也是 §1.2 拒绝 `derive --path` 的同一个理由——迁移之所以能保持 `ChainAddresses` 完整，正是因为每个账户都两族齐备。

### 0.2 闸门的位置与阻断范围

- 在 **`--help` / `--version` 短路之后**、**任何命令派发之前**执行。
- 只要有注册文件落后版本，**任何命令都不跑**。
- 升级完成后重跑为 **no-op**。

> ❌ **实作与本节相反，需改实作**（`e206c00a` 实测）：闸门跑在 help/meta **之前**——stale v1 文件下 `wallet-cli --help` **不打印 help**、`wallet-cli -V` **不打印版本**，两者都被闸门接管。源码自述亦然（`src/bootstrap/migration-gate.ts` 开头："Runs on every invocation **before help/meta handling**, argument validation, or command dispatch"）。
>
> **建议改实作、而非改本节**：文件落后时连 `--help` 都不给，等于把用户在故障现场唯一的自助工具也关掉；且 §0.5 只承诺「连 `list` 都不能跑」，实际比承诺的更狠。`--help` / `--version` 不读也不写钱包状态，没有必须挡的理由。

### 0.2.1 机器可读输出（`-o json`）

闸门在 json 模式下**不打印散文，而是产出一个正规信封**——这是 agent 侧唯一能可靠判读迁移发生过的途径：

```json
{ "schema":"wallet-cli.result.v1","success":true,"command":"migration","data":{ "upgraded":true,"files":[{ "path":"…/wallets.json","from":1,"to":2,"backup":"…/wallets.json.v1.bak" }],"originalCommandExecuted":false },"meta":{ "durationMs":20,"warnings":[] } }
```

> 以上为实测输出（`e206c00a`）。**退出码 0**，且 `success: true`——迁移本身办成了，故不是错误；**`originalCommandExecuted: false` 是关键字段**：它告诉调用方「你原本那条命令没跑，请重发」。text 模式下对应的是末行 `Upgrade complete. Please run your command again.`。
>
> 本信封的 `command:"migration"` 与 `data` 四个字段是本版新增的机器契约面，**不受「横切约定」那条输出字段封闭清单的约束**（该清单列的是既有命令的字段增量，闸门不是命令）。无法取得主密码时不走本信封，而是 `migration_required` + **退出码 2**（§0.4）——text 与 json 两模式的退出码一致，均实测。

> ❌ **text 形态需改实作**：闸门当前的 text 输出用的是 `==> …` 前缀段、`✓`、以及 `🎉 Upgrade complete. Please run your command again.`，**三者都不在「横切约定」允许的四种 text 形状之内**，`🎉` / `✓` 也不在标记词表（✅/❌/⏳/⚠️/❓）之内。
>
> 应改为既有的「**`<标记> <动词摘要>` + 缩进字段**」形状——完成回执用 `✅`，告知段（stderr）用无标题键值块。**这不是排版洁癖**：四种形状是 text 渲染层的封闭集合，多一种就多一处解析器与后续命令都对不上的地方，而闸门恰恰是**每个用户升级后见到的第一屏**。

### 0.3 成本不对称是设计的核心

| source 类型 | 是否持有本机秘密 | 迁移行为 |
| --- | :---: | --- |
| `seed` / `privateKey` | 是 | **需要主密码**，走同意流程 |
| `ledger` / `watch` | 否 | **不问主密码，自动升级**（仍照常打印告知段与完成回执） |

**只有 watch / ledger 的用户从未设过主密码**——若此处误问，他将无解。这条不对称不是优化，是可用性的下限。

> **「不提示」指的是不问主密码，不是无输出**（2026-08-28 PM 拍板，按实作）。原文「完全静默升级，不提示」有歧义，已改写。`e206c00a` 实测：watch-only 的 v1 文件迁移**跳过主密码那一步**，但仍在 stderr 打完整告知段（检测到旧格式 / 文件路径 / v1→v2 / 备份路径 / 只跑一次）、在 stdout 打完成回执。
>
> **告知段该留**——迁移会改写钱包文件并留下一个永不自动清除的 `.bak`，这件事对 watch / ledger 用户同样成立；省掉主密码是因为他没有秘密可解，不是因为这件事不值得告诉他。

### 0.4 同意流程与其余规则

**需要主密码时，闸门先说明、再要求答复，答完才问密码**：说清「哪个文件、v几到v几、备份留在哪、只跑一次」。

> 旧行为是直接跳一个没有前因后果的 `Master password (hidden):`——没有理由、没说要改写文件、除了 Ctrl+C 没有拒绝的方式。**说明走 stderr**，stdout 保留给命令输出。

| 规则 | 内容 |
| --- | --- |
| 原子性 | **全成或全不成**（同一个事务） |
| 备份 | 迁移前留 `<name>.v<N>.bak`，**永不自动清除**——既有的事务机制只防崩溃，不防「成功但写错」 |
| 无 TTY | 报 `migration_required`（**退出码 2**，text / json 两模式一致），但**接受 `--password-stdin`**，CI 可自愈 |
| 密码错误 | TTY 下最多三次然后 `auth_failed`；**失败不留 `.bak`** |
| 全新安装 | 文件不存在 → 回报为当前版本，闸门放行 |
| `version` 缺失或非法 | `encoding_error`，**绝不当成第 0 版**——对一个装着钱包状态的文件，跑一个针对未知结构的迁移比挡下来更危险 |
| 迁移产出 | **== 新建产出**：重跑 `create` / `import` 用的同一组 derive 函数，不由既有 TRON 地址反推。已实测迁移后的 `wallets.json` 地址表与本版全新建立的**逐字节相同** |
| 其余注册文件 | `contacts.json` 与 `tokens.json` **不需要迁移**——前者落盘格式本来就是 family 分键、每笔自带 `family`（只需放宽校验），后者以 network id 为键，EVM 只是多几个键 |

**两个「决定不做」的边界**（如实反映，不是待办）：

| 边界 | 内容 |
| --- | --- |
| **无降版保护** | 版本高于本体的文件不算落后，直接放行 |
| **未知 `source.type` 视为无秘密** | 不当成需要主密码的类型 |

两者是同一个形状：**未知的东西被当成安全的东西放过去**。决定不挡的理由是今日皆无实害（只有四种 source type，且 v2 是最新版），而挡下来要付出的是**把用户锁在自己文件外面**的风险。

### 0.5 锁死后果（必须写进 release note）

**忘记主密码且钥匙圈内有本机秘密者，连 `list` 都不能跑，且每次执行都会再挡一次。**

这是**刻意接受**的——该用户本来就已无法签名／备份／导出，闸门没有新增损失，只是让它更早、更明显。

> **用 `--password-stdin` 的用户看不到屏幕上的说明，release note 是唯一告知管道**；同时应点明迁移会留下 `wallets.json.v1.bak` 且永不自动清除。

### 0.6 验证

47 项非交互情境 + 6 项真实 TTY 情境（pty 驱动）全数通过。

---

## 1. EVM 账户与密钥模型

### 1.1 账户模型

**账户是链无关的身份，同一个账户在每条链上按该链的 BIP44 coin type 各派生一把 key。** 与 OKX、Trust Wallet 等主流多链钱包一致，也与既有的账户存储结构一致。

| 账户来源                               | TRON 地址             | EVM 地址             | 私钥关系             |
| ---------------------------------- | ------------------- | ------------------ | ---------------- |
| `create` / `import mnemonic`（seed） | `m/44'/195'/N'/0/0` | `m/44'/60'/0'/0/N` | 两族各一把，**不同**     |
| `import private-key`               | 该 key 的 TRON 编码     | 该 key 的 EVM 编码     | **同一把**          |
| `import watch`                     | 仅当地址是 `T...`        | 仅当地址是 `0x...`      | 无（单 family）      |
| `import ledger`                    | `--app tron`        | `--app ethereum`   | device（单 family） |

### 1.2 派生路径

**每族跟随各自生态惯例，账户序号挂的层级不同。**

```
TRON   m/44'/195'/<N>'/0/0     序号在 account 层（保持现状，不动存量）
EVM    m/44'/60'/0'/0/<N>      序号在 address_index 层
```

以太坊标准路径为 `m/44'/60'/0'/0/x`，MetaMask、Trezor、Rabby 及绝大多数 dApp 钱包递增 address_index；走 account 层的只有 Ledger Live 一支。**跟随生态优先于跨族形状对称**——同 §3.6 Ledger EVM 用 Live 模板。

**互导手段**（覆盖从 Ledger Live / Legacy 等别家钱包迁入）：

| 手段 | 命令 | 说明 |
| --- | --- | --- |
| 硬件账户显式路径 | `import ledger --path <bip32-path>` | 指定完整路径注册硬件账户，绕开默认模板（§3.6） |
| 事后核对 | `list -o json` 的 `derivationPath` | 看出账户用的哪套模板 |

> **软件账户本版只支持默认模板**：`derive` 不提供 `--path`。原因是显式路径会产生「单 family 的 seed 账户」——`Source.seed.addresses` 的 `ChainAddresses` 是完整类型，单族槽位表达不了，只能改成 `Partial` 或加槽位判别式；两者都会反噬本版的强制启动迁移（§0），而该迁移能保持 `ChainAddresses` 完整，正是因为每个账户都两族齐备。同时 `derivationPath` 会从「由 index 算出」变成「必须落盘」，等于在本版**第一次**强制迁移的同时再加一项 schema 变更。
>
> 被挡住的只有「只有助记词、且资产在 Ledger Live / MEW 模板上」的用户——属功能缺口，不是资产风险；硬件用户走 `import ledger --path` 不受影响。绕行手段是用外部工具按目标路径导出私钥后 `import private-key`。

### 1.3 地址表示

| 项 | 规则 |
| --- | --- |
| 输出 | EVM 地址一律按 **EIP-55 校验和大小写**输出（text 与 json 一致） |
| 输入·全小写 / 全大写 | 视为**未带校验和**，接受 |
| 输入·混合大小写 | **必须通过 EIP-55 校验**，不匹配一律报 `invalid_address`、拒绝执行 |
| 输入·其它 | 必须带 `0x`、长度与十六进制合法性校验失败报 `invalid_address` |
| family 识别 | 由地址编解码器自动识别（`T...` → tron、`0x...` → evm），`--account 0x...` 可直接定位账户 |

> **混合大小写必须校验**：协议层地址不区分大小写，但一个带校验和的地址被改动一位后校验必然失败——放行等于把「打错一位」和「剪贴板被替换」这两类事故直接变成资金损失。MetaMask、Trust Wallet 与硬件钱包均拒绝校验和不匹配的地址，ethers 的 `getAddress()` 同样抛错。我方对齐这一行为。
>
> **ENS 本版不解析，后续版本支持**：`--to vitalik.eth` 在本版报 `invalid_address`；需要的用户自行解析后传入 `0x` 地址。**这是排期问题、不是拒绝**——ENS 是 EVM 生态的默认收款人形态，长期缺席不合理。

### 1.4 金额与精度显示

原生币 18 位小数（TRON 6 位），全部 18 位铺在 text 里既不可读也无意义，故定：

| 场景 | 规则 |
| --- | --- |
| text 原生币 / 代币 | 最多保留 **6 位小数**，尾随零去除（`12.3456 ETH`、`0.25 ETH`） |
| text 非零但小于显示精度 | 显示 `<0.000001`，**绝不显示 `0`** |
| json | 恒给**最小单位整数字符串**（wei / sun / 代币基本单位），不做任何截断 |
| 命令行输入 | 按人话单位接受完整精度（`--amount 0.000000000000000001` 合法），超出该代币 decimals 才报 `invalid_amount` |
| USD 价格与估值 | **不适用上面的规则**：估值固定 2 位小数、单价 4 位，按 USD 惯例补零（`$2,500.00`、`$0.9998`） |
| gas 价格（`--max-fee` / `--priority-fee`） | 命令行**一律按 gwei 读**：`25` 与 `25gwei` 等价（后缀大小写不敏感）；**`wei` / `ether` 等其他单位点名拒绝**并报 `invalid_value`。text 按 gwei 显示，json 给 wei 整数字符串 |
| 千分位 | **text 里的整数部分一律加千分位**——金额（`$41,004.35`）、区块号（`#11,204,113`）、gas（`1,204,551 gas`）、字节数（`3,124 bytes`）同此一条规则。**json 一律不加**（`"valueUsd":"41004.35"`），那是给机器解析的 |

本规则适用于全文所有出现金额的输出：`account balance` / `portfolio`（§4.1–4.2）、`token balance`（§5.1）、`tx send` 的转账额与 Fee 行（§6.1）、`contract send` 的 `Allowance`（§7.2）、`chain prices` 的 `Transfer cost`（§9.3）。

> 「非零不显示 0」是关键：余额 1 wei 若显示成 `0 ETH`，用户会认定账户空了。截断只发生在 text，json 与实际转账金额始终是精确整数。
---

## 2. 网络与配置

### 2.1 网络 ID 与别名

**规范 id ＝ `<命名空间>:<链自身的 id>`，命名空间取 CAIP-2 的写法。** EVM 侧命名空间为 `eip155`，冒号后那一段就是 EIP-155 的数字 chain id（`eip155:1`、`eip155:11155111`、`eip155:56`、`eip155:97`）；TRON 侧同样取 CAIP-2 的写法——**本版将 TRON 规范 id 由网络名改为十进制 chain id**：

| 新规范 id | 旧形式（v4.12.0 及以前） | 别名 |
| --- | --- | --- |
| `tron:728126428` | `tron:mainnet` | `tron` |
| `tron:3448148188` | `tron:nile` | `nile` |
| `tron:2494104990` | `tron:shasta` | `shasta` |

chain id 取**创世块哈希末 4 字节**（TIP-474），十进制渲染——与 `eip155` 用十进制、与 TRON 在 `ethereum-lists/chains` / ChainList 的既有登记一致。

> **为什么改**：原口径「TRON 没有数字 chain id」是**事实错误**——它有（TIP-474）。规范 id 取网络名是历史遗留，而 `tron` 命名空间的 CAIP-2 规范已在立项，定十进制为规范形式并明确 **`0x` 十六进制不是合法 CAIP-2 引用**。两侧都用 CAIP-2 写法之后，「规范 id ＝ CAIP-2」这条规则才对全族成立，`--network` 的取值集合也不再分族记忆。

> **命名空间不是 family。** `eip155` 是链标识体系里的命名空间，而 family 是我方的适配层分组，值仍为 `evm`——json 的 `chain.family` 恒为 `evm`、`config.yaml` 自配网络的 `family` 字段也填 `evm`，只有 `chain.network` 这类**网络 id** 用 `eip155:` 前缀。两者不同名是有意的：将来若同一个 family 要覆盖非 EIP-155 的链，不必再改一次 id 形式。

这样定的理由是**可寻址性**：chain id 由链自己定义、全网唯一且永不变，于是**任何 EVM 链无需我方先起名字就能被指定**——用户配一个 Polygon 端点，直接 `--network eip155:137` 即可，不必等我方在代码里登记一个 `eip155:polygon`。**前缀直接取 `eip155` 而不是我方的 family 名，是为了让这个 id 与业内既有写法逐字相同**——CAIP-2 的 `eip155:1`、WalletConnect / SIWE 的链标识都是这个形式，用户与 agent 从别处拿到的 id 可以原样贴进 `--network`，我方不做一层翻译。EIP-3085 的 `chainId` 同样以数字为准。

**每条内置网络另给一个别名**，因为 `eip155:1` 不可读，而人要在命令行里天天敲它。**别名是不带命名空间前缀的简写**，与 hardhat（`--network sepolia`）、foundry（`--chain sepolia`）的习惯一致：

| 规范 id | 别名 | 兼容别名（历史 id） |
| --- | --- | --- |
| `tron:728126428` | `tron` | `tron:mainnet` |
| `tron:3448148188` | `nile` | `tron:nile` |
| `tron:2494104990` | `shasta` | `tron:shasta` |
| `eip155:1` | `ethereum` | —— |
| `eip155:11155111` | `sepolia` | —— |
| `eip155:56` | `bsc` | —— |
| `eip155:97` | `bsc-testnet` | —— |

> **「兼容别名」列不是新机制**，就是别名簿里的普通记录——上表内置全量因此为 **10 条**（7 条短别名 ＋ 3 条历史 id）。

#### 历史 id 的兼容

破坏面只在**输出侧**，输入侧零成本：

| 面 | 处置 |
| --- | --- |
| **`--network` 输入** | `tron:mainnet` / `tron:nile` / `tron:shasta` **永久保留为别名**，与 `tron` / `nile` / `shasta` 并列进别名簿。老脚本一个字不用改 |
| **`config.yaml`** | `networks.<id>.*` 的键与 `defaultNetwork` 的值由 **§0 的强制启动迁移**一并改写；`aliases` 里指向旧 id 的用户自定义别名同步重定向 |
| **json `chain.network`** | ⚠️ **这是唯一的破坏**——值由 `tron:nile` 变为 `tron:3448148188`。按旧值做分支的 agent 脚本必须改 |
| **触达** | 强制迁移是阻断式的、且在 json 模式产出正规信封（§0.2.1），是**唯一能保证被看见**的渠道。迁移信封的 `data` 须列出 `networkIdsRemapped: [{from, to}]`，让 agent 能程序化得知这次改名 |

> **别名簿容得下这三条**是因为它本就是 `别名 → 规范 id` 的扁平表（见下）：旧 id 降级为别名不需要新机制，只是多三条记录。§2.1 的「解析顺序先查规范 id、后查别名簿」不变，`tron:nile` 走别名簿命中同一张网络描述符。

**`--network` 接受两种写法**，运行时一律归一到规范 id：规范 id（`eip155:11155111`）与别名（`sepolia`）。**解析顺序固定为「先查规范 id、后查别名簿」**，由此得到一条比消歧更重要的保证——**别名永远不能遮蔽规范 id**：`--network eip155:1` 恒为以太坊主网，无论用户在 `config.yaml` 的别名簿里写了什么。

不设 **带命名空间前缀的别名**（`eip155:sepolia`）：它存在的理由是「别名重名时消歧」，而下面的别名簿让重名在结构上不可能发生。`eip155:sepolia` 两次查找都不中，报 `unsupported_network`。

别名是可读性糖、可能随生态改名而调整（如 BSC 官方已更名 BNB Smart Chain），**规范 id 永不变**——所以机器面（json 的 `network` 字段、`config` 的 `networks.<id>.*` 键）只认规范 id，agent 与脚本不要拿别名做匹配。

**别名以「别名簿」这一张扁平表实现**——`config.aliases` 是 `别名 → 规范 id` 的一层 map，别名**不是**挂在网络描述符上的字段。上表七条即其内置全量。

这个形状让三条原本要写死并校验的规则**结构上自动成立**，不需要任何校验代码：

| 原规则 | 在扁平表下为何自动成立 |
| --- | --- |
| 别名在全部 family 范围内唯一 | 一张 map 不可能有重复的键 |
| family 名是保留字（不设 `evm` 别名） | 表里没有 `evm` 这个键。`tron` 作为 `tron:728126428` 的别名是表里的一条普通记录 |
| 用户自配网络不自动获得别名 | 没写进表就没有别名 |

配套两点：

- **匹配只发生在 `--network` 解析这一步**，之后全流程只见规范 id。
- **别名指向未知网络时，错误同时点名别名与它的目标**——`alias "polygon" points at unknown network eip155:99999`，而不是只说 `unknown network: polygon`（后者会让用户去检查自己敲的字，而问题在别名簿里）。

### 2.2 内置网络与 RPC 端点

| 规范 id | 别名 | family | 原生币 | 测试网 | feeModel | 端点主机 |
| --- | --- | --- | --- | :---: | --- | --- |
| `tron:728126428` | `tron` | tron | TRX | | `tron-resource` | `api.trongrid.io` |
| `tron:3448148188` | `nile` | tron | TRX | ✅ | `tron-resource` | `nile.trongrid.io` |
| `tron:2494104990` | `shasta` | tron | TRX | ✅ | `tron-resource` | `api.shasta.trongrid.io` |
| `eip155:1` | `ethereum` | evm | ETH | | `evm-gas` | `ethereum-rpc.publicnode.com` |
| `eip155:11155111` | `sepolia` | evm | ETH | ✅ | `evm-gas` | `ethereum-sepolia-rpc.publicnode.com` |
| `eip155:56` | `bsc` | evm | BNB | | `evm-gas` | `bsc-dataseed.bnbchain.org` |
| `eip155:97` | `bsc-testnet` | evm | BNB | ✅ | `evm-gas` | `bsc-testnet-dataseed.bnbchain.org` |

> **「原生币」是网络级字段，不是 family 级**（§横切约定）：`eip155:1` 与 `eip155:56` 同族而币种是 ETH 与 BNB，从 family 表读会把 BSC 上的 0.5 BNB 显示成 `0.5 ETH`。本列的存在也让将来接入 Polygon 时类型会强制填写，不会默默继承 ETH。
>
> **「测试网」标记决定估值行为**（§4.2）：标记为测试网的四条网络，币价与代币价一律为 **0**，且**不发任何外部请求**。**未申报为测试网的用户自配网络维持 `null`**——不知道 ≠ 不值钱。
>
> **端点主机名随官方域名迁移更新**：BSC 的 dataseed 已由 `binance.org` 迁至 `bnbchain.org`，表中为迁移后的值。

> 本文档 §3–§9 的示例一律用**别名**书写（`--network sepolia`），与用户实际会敲的形式一致；json 示例里的 `network` 字段则一律是规范 id。

**本版内置的 EVM 网络限于一层链：Ethereum 与 BNB Smart Chain，各带一条测试网。** 每条主网都配测试网是硬要求——签名、nonce、gas 估算这些东西不该拿主网真钱去试，`bsc` 与 `bsc-testnet` 的关系等同 `ethereum` 与 `sepolia`。

**Base、Arbitrum、Optimism 等二层链后续版本支持**，本版不内置。原因是**费用模型不同，不是加个端点的事**：L2 上一笔交易的成本 ＝ L2 执行费 ＋ **把数据写回 L1 的 data fee**，后者由 L1 的 blob / calldata 价格决定，且各家 L2 的取值方式不一样（OP Stack 有 `GasPriceOracle` 预编译，Arbitrum 把它折进 gas 用量）。现有的 `evm-gas` 费用模型只算 `gasLimit × gasPrice`，**在 L2 上会系统性低估**——`tx send --dry-run` 报的费用比实际扣的少，这比不支持更糟。后续版本要新增 `evm-l2-gas` 费用模型并逐条对齐各 L2 的取数方式。

> **未内置的 EVM 链仍可指定，但费用估算不保证**：规范 id 的形式让任何 EVM 链开箱可寻址（`--network eip155:8453` + 自配端点即可查询与转账）。查询类命令与转账本身没有问题，**只有费用估算在 L2 上会偏低**。本版不阻止这种用法，也不为它背书。

**自配网络的必填字段**（写在 `config.yaml` 的 `networks.<id>` 下）：

| 字段 | 必填 | 说明 |
| --- | :---: | --- |
| `family` | 是 | 必须是受支持的 family（本版为 `tron` / `evm`） |
| `chainId` | 是 | EVM 侧为 EIP-155 数字 chain id，与规范 id 后半段一致 |
| `nativeSymbol` | 是 | 该链原生币名称；缺了没有可回退的正确值（见上表说明） |
| `httpEndpoint` | 实务上必填 | 未内置的网络没有默认端点 |
| `capabilities` | 否 | 缺则视为空——没有额外特性是正常情况，不是错误 |
| `testnet` | 否 | 缺则视为主网，估值走真实价格源 |

**校验发生在载入 `config.yaml` 的当下**：缺 `family` / `chainId` / `nativeSymbol`，或 family 不受支持，一律报 `invalid_value` 并**点名是哪条网络的哪个字段**。这条规则的意义在于错误的形态——config 的错误必须以 config 错误的形式、在读文件的当下报出；先前写错的后果是 bootstrap 崩溃，任何命令都回一个没有线索的 `internal_error`。

**四条 EVM 网络都内置可用端点，装完即可查询与转账**，不必先做配置。与 TRON 的差别不在有没有默认，而在谁运营：TronGrid 是链方第一方端点，EVM 侧没有单一权威运营方，内置的是第三方公共 RPC——**有限流、无 SLA、可能下线**，且默认会把查询地址暴露给该服务商。因此生产环境与高频调用建议换成自建节点或商用网关：

```bash
wallet-cli config set networks.ethereum.httpEndpoint https://<your-rpc-host>/<key>
```

`sepolia`（`eip155:11155111`）是本版冒烟测试网（等同 TRON 侧 Nile 地位），示例一律用它。

### 2.3 `networks`

```bash
$ wallet-cli networks
| Network         | Alias       | Family | Chain id | Fee model     | Endpoint                            |
| --------------- | ----------- | ------ | -------- | ------------- | ----------------------------------- |
| tron:728126428  | tron        | tron   | 728126428  | tron-resource | api.trongrid.io                   |
| tron:3448148188 | nile        | tron   | 3448148188 | tron-resource | nile.trongrid.io                  |
| tron:2494104990 | shasta      | tron   | 2494104990 | tron-resource | api.shasta.trongrid.io            |
| eip155:1        | ethereum    | evm    | 1        | evm-gas       | ethereum-rpc.publicnode.com         |
| eip155:11155111 | sepolia     | evm    | 11155111 | evm-gas       | ethereum-sepolia-rpc.publicnode.com |
| eip155:56       | bsc         | evm    | 56       | evm-gas       | bsc-dataseed.bnbchain.org           |
| eip155:97       | bsc-testnet | evm    | 97       | evm-gas       | bsc-testnet-dataseed.bnbchain.org   |
```

> **六列，`Network` 放规范 id、`Alias` 单列一列。** 取舍是「一列还是两列」：只显示别名的话，用户看得到自己要敲什么，却无从得知机器面该用什么；而**规范 id 是稳定值，别名是可读性糖、会随生态改名而调整**（§2.1）。两列则两者都看得到，原本「用户要看到自己该敲什么」的顾虑没有损失。没有别名的用户自配网络，`Alias` 列为空。
>
> **`Chain id` 是本版由 `Chain` 改名**，以对应规范 id 的后半段——那个值就是规范 id 冒号后的部分。
>
> **`Endpoint` 是本版新增列，且只输出主机名，不输出完整 URL。** 理由是**端点路径常夹带 API key**（`…/v2/<key>`、`…?apikey=<key>`），而 `networks` 是列表输出、不是机密接口——它的结果会被贴进 issue 与 CI log。裁到主机名是唯一不需要猜「哪一段是密钥」的切法。要看完整 URL 走指名读取：`config networks.<id>.httpEndpoint`（§2.4）。

**Help 输出**

> **相对现状**：描述行由 `List known networks` 扩写为含 family / chain id / fee model / endpoint host，并说明 `Network` / `Alias` 两列的分工与「端点只给主机名」。

```text
$ wallet-cli networks --help

Usage:
  wallet-cli networks [options]

List known networks with their family, chain id, fee model and endpoint host.
Network is the canonical id (family:chain-id); Alias is the short name --network
also accepts. Endpoints are shown as hosts only.

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli networks
```

### 2.4 `config` 新增项

| key | 读 | 写 | 默认 | 说明 |
| --- | :---: | :---: | --- | --- |
| `networks.<id>.httpEndpoint` | **本版新增** | **本版新增** | 内置值 | 该网络的 RPC 端点；此前只能手工编辑 `config.yaml`。`<id>` **别名与规范 id 都接受**，写入时归一为规范 id。**指名读取回完整 URL**（列表输出裁成主机名，见下） |
| `networks.<id>.apiKeyHeader` | **本版新增** | **本版新增** | 无 | header 型 RPC 凭证的 **header 名称**（如 `TRON-PRO-API-KEY`）。写入时校验必须是 RFC 9110 的 header token——不含空白、`:`、CR/LF |
| `networks.<id>.apiKey` | **本版新增**（**只写不读**） | **本版新增** | 无 | 该 header 的凭证值，限 1–256 字符且不含控制字符。**任何读取面一律回 `********`** |
| `networks.<id>` | **本版新增** | —— | —— | 整条读取该网络的可配置字段（中间粒度）；未配置的字段**不出现**，不是空行 |
| `aliases` | **本版新增** | ❌ **无写入通道** | 内置 7 条 | 别名簿（§2.1）。可读，维护靠手工编辑 `config.yaml` |
| `defaultNetwork` | 既有 | 既有 | `tron:728126428` | 可设为任一 EVM 网络，无需改动；别名与规范 id 都接受，存储时归一为规范 id |

**`aliases` 为什么只读不可写**：别名簿在 CLI 上**没有其他可见面**——不给读，用户要知道 `sepolia` 指向哪里就只能打开 `config.yaml`，而那正是我们希望他不必做的事。不给写，是因为别名簿的维护频率极低（七条内置值），而一个写入通道要处理的校验（目标存在吗、会不会遮蔽规范 id、会不会撞名）比它省下的手工编辑多得多。**别名目标的合法性改为在解析时报错**（§2.1 的 `alias "polygon" points at unknown network eip155:99999`），不在写入时拦。

#### `apiKeyHeader` / `apiKey`：走 header 的商用 RPC 凭证

`Endpoint` 只印主机名那条规则（§2.3）隐含一个假设：**API key 夹在端点 URL 里**。**这个假设对主流商用 RPC 不成立**——TronGrid 用 `TRON-PRO-API-KEY` header，其他家也多半走 header。没有这两个字段，用了配额端点的用户**根本无法在 CLI 里配置**，只能退回未认证的公共端点吃限流。

```bash
wallet-cli config networks.tron:3448148188.apiKeyHeader TRON-PRO-API-KEY
wallet-cli config networks.tron:3448148188.apiKey <key>
```

- **拆成两个字段而不是一个 `apiKey`**：header 名称各家不同，写死任何一个名字都只服务一家。
- **两者都挂在网络上而非全局**：一把 key 只对一家 provider 的一条链有效，全局字段在多网络下必然是错的。
- **两者要成对配置才生效**，缺一则不带 header。

`apiKey` 从一开始就按**秘密**处理，三道约束：

| 约束 | 内容 |
| --- | --- |
| **只写不读** | 任何 config 读取面（整份 config、`config networks`、`config networks.<id>`、指名读 leaf、`-o json`）一律回 `********`；连 `config set` 的回执与回显的 `input` 都是遮蔽值 |
| **落盘即受 0600 检核** | `config.yaml` 只要有任一网络带着非空 `apiKey`，就与 `tronlinkSecretKey` / `gasfreeApiSecret` 同级，权限不合就拒绝载入。它**嵌套在 `networks` 底下**，只看顶层键的旧 gate 发不出这个检核 |
| **带 header 的请求禁止跟随转址** | 否则节点回一个 302，fetch 会把凭证原封不动送到转址目的地 |

> `apiKeyHeader` 的 header token 校验不是形式主义：这个值会被逐字写进请求的 header 列表，允许换行等于让一个手工编辑的 `config.yaml` 夹带第二个 header，是 header injection。
>
> **两种 key 的保护方式对照**：URL 型的 key 靠**裁剪**保护（§2.3 的 `Endpoint` 只印主机名），header 型的 key 靠**遮蔽**保护（一律 `********`）。

**`<id>` 段接受别名**，与 `--network` 同一套解析：`config set networks.sepolia.httpEndpoint <url>` 与 `config set networks.eip155:11155111.httpEndpoint <url>` 等价。三条规则配套：

| 规则 | 说明 |
| --- | --- |
| **写入归一** | 无论用户敲的是别名还是规范 id，落到 `config.yaml` 的键**一律是规范 id**。否则同一条网络可能同时存在 `networks.sepolia` 与 `networks.eip155:11155111` 两个键，合并顺序决定谁生效——用户改了端点却不生效，且看不出原因 |
| **读取也归一** | 手工编辑 `config.yaml` 写成别名（TRON 时代就是这么改端点的）同样生效。**不认别名就等于静默失效**：配了跟没配一样，是最难排查的一类故障 |
| **重复键报错** | 若 `config.yaml` 里同一条网络既有别名键又有规范 id 键，**启动即报 `invalid_value` 并点名这两个键**，不静默取其一 |

#### `config` 的展示形状

`config get networks` 现状只返回网络 id 列表，看不到各网络的端点——用户配完无从确认生效没有。本版两处改动：

**① `networks` 的值由字符串变成对象**：`{ httpEndpoint, apiKeyHeader, apiKey }`，未配置的字段**不出现**（不是空行）。列表输出（整份 config、`config networks`）的 `httpEndpoint` 仍**裁成主机名**，`apiKey` 仍是 `********`。

这不是独立的美化，是 `apiKey` 两个字段的直接后果：一条网络现在有三个可配置字段，而旧的 `id → 端点字符串` 形状**只装得下一个**。要在旧形状下呈现另外两个，就得在整份 config、`config networks`、单条读取、json 四个展示面各加一段代码，下一个字段再重复一次。改成「网络的值就是它的可配置字段」之后，字段清单是唯一的一份，新增一个字段同时出现在四个面上。

**② `config networks.<id>` 可整条读**，补上先前缺失的**中间粒度**——此前只有「整份」与「单一 leaf」，要确认一条网络配好了没（端点、header 名、key 有没有设）得敲三次。该读法给**完整端点 URL**（与 leaf 读取同一条分界线：**指名即意图**）。别名照样解析为规范 id。

**text 渲染同步改为树状**：纯量 `key  value`；嵌套 map 印**裸键**后缩进一层，对齐只在同一层内计算。**不加 `key:` 的冒号**——这一层的键本身就含冒号（`tron:mainnet`），加了分隔符反而看不出 id 到哪里结束，而 id 正是用户要原样复制到 `--network` / `config networks.<id>` 的那个字符串；缩进已经表明层级。旧版把 map 值摘要成「键的列表」，于是 `config` 告诉用户 `networks.tron:3448148188` 存在、却从不说它装了什么。

```bash
$ wallet-cli config
defaultNetwork     tron:728126428
defaultOutput      text
timeoutMs          60000
waitTimeoutMs      60000
networks
  tron:728126428
    httpEndpoint  api.trongrid.io
  tron:3448148188
    httpEndpoint  nile.trongrid.io
  tron:2494104990
    httpEndpoint  api.shasta.trongrid.io
  eip155:1
    httpEndpoint  ethereum-rpc.publicnode.com
  eip155:11155111
    httpEndpoint  ethereum-sepolia-rpc.publicnode.com
  eip155:56
    httpEndpoint  bsc-dataseed.bnbchain.org
  eip155:97
    httpEndpoint  bsc-testnet-dataseed.bnbchain.org
aliases
  tron         tron:728126428
  nile         tron:3448148188
  shasta       tron:2494104990
  ethereum     eip155:1
  sepolia      eip155:11155111
  bsc          eip155:56
  bsc-testnet  eip155:97
```

```bash
# 指名读取：给完整 URL（列表输出里是 nile.trongrid.io）
$ wallet-cli config networks.tron:3448148188
networks.tron:3448148188
  httpEndpoint  https://nile.trongrid.io
```

```bash
$ wallet-cli config aliases -o json
{ "schema":"wallet-cli.result.v1","success":true,"command":"config","data":{ "key":"aliases","value":{ "tron":"tron:728126428","nile":"tron:3448148188","shasta":"tron:2494104990","ethereum":"eip155:1","sepolia":"eip155:11155111","bsc":"eip155:56","bsc-testnet":"eip155:97" } },"meta":{ "durationMs":14,"warnings":[] } }
```

**Help 输出**

> **相对现状**：`key` 的 Args 文案**列出全部合法键名**（agent 读得到，散文里读不到）；Examples 换为「整份 / 读 leaf / 写 leaf / 读整条网络 / 写 header 名」五例。

```text
$ wallet-cli config --help

Usage:
  wallet-cli config [<key>] [<value>] [options]

Show / get / set configuration values

Args:
  key    config key to read or set (defaultNetwork, defaultOutput, timeoutMs, waitTimeoutMs, networks, aliases, tronlinkSecretId, tronlinkSecretKey, tronlinkChannel, gasfreeApiKey, gasfreeApiSecret, or networks.<id> / networks.<id>.{httpEndpoint | apiKeyHeader | apiKey}); omit to show the whole effective config
  value  new value; omit to read the key

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli config
  wallet-cli config defaultNetwork
  wallet-cli config defaultNetwork nile
  wallet-cli config networks.tron:728126428
  wallet-cli config networks.tron:728126428.apiKeyHeader TRON-PRO-API-KEY
```

---

## 3. 本地钱包组（EVM 适配）

### 3.1 `create` —— 新建 HD 钱包 🔒

> **本版改动**：回执多一行 EVM 地址；助记词一次产出两族地址。

**用法**

```
wallet-cli create [--label <name>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 生成 BIP39 助记词并落库，**一次产出两族地址** |
| EVM 增量 | 回执地址行由一行变两行（TRON / EVM） |
| 错误 | `account_exists`、`tty_required` |

**示例与输出**

```bash
$ wallet-cli create --label main
# 首次创建：设置主密码两步（keystore 已存在时只提示一行 Master password）；助记词加密落库、不打印到任何输出
? Set master password (hidden):
? Confirm master password:
✅ Created wallet "main"
  Account ID    wlt_ab12cd34.0
  Type          HD
  TRON address  TSRmq8kP...9dEf
  EVM address   0x7a3f...c19b
  Active        yes

⚠️ Recovery phrase is encrypted locally and was not printed.
⚠️ Run `backup` soon and store the file offline.
```

```bash
$ wallet-cli create --label main --password-stdin -o json
{ "schema":"wallet-cli.result.v1","success":true,"command":"create","data":{ "status":"created","accountId":"wlt_ab12cd34.0","label":"main","type":"seed","index":0,"active":true,"addresses":{ "tron":"TSRmq8kP...9dEf","evm":"0x7a3f...c19b" },"seedId":"wlt_ab12cd34" },"meta":{ "durationMs":1088,"warnings":[] } }
```

> **EVM 增量只有 `addresses.evm` 一个键**——`status` / `accountId`（带 `.0` 后缀）/ `type`（`seed`，非 text 里的 `HD`）/ `seedId` 全部沿用既有结构。

**Help 输出**

> **相对现状**：描述补两句（每族各派生一个地址、助记词本地加密不打印）；Requires 主密码文案按 §10.1 统一。

```text
$ wallet-cli create --help

Usage:
  wallet-cli create [options]

Create a new HD wallet (BIP39 seed). Derives one address per chain family
from the same seed; the recovery phrase is encrypted locally and never printed.

Requires:
  the master password — pass --password-stdin, or enter it interactively in a TTY

Options:
  --label <string>  human-friendly unique account label, 1-64 chars; omit to auto-generate  [optional]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli create --label main
```

### 3.2 `import mnemonic` —— 导入助记词 🔒

> **本版改动**：一次导入产出两族地址。

**用法**

```
wallet-cli import mnemonic [--label <name>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 导入 BIP39 助记词；助记词与主密码经隐藏 TTY 读取 |
| EVM 增量 | 两族地址（一次导入两族齐备） |
| 错误 | `invalid_mnemonic`、`account_exists`、`tty_required` |

**Options**

| Option | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--label <name>` | 否 | 自动 | 账户标签 |

**示例与输出**

```bash
$ wallet-cli import mnemonic --label cold
# 提示顺序固定：先主密码、后助记词（密码在 dispatch 阶段 prime）
? Master password (hidden):
? Paste recovery phrase (hidden):
✅ Imported wallet "cold"
  Account ID    wlt_9f7e21aa.0
  Type          HD
  TRON address  TKq3xW7v...2bNc
  EVM address   0x91b2...4d0e
  Active        yes

⚠️ Recovery phrase was read from hidden input and was not printed.
```

> 一次导入两族地址齐备，无需为 EVM 再导一次。
>
> **软件账户本版只支持默认模板**（§1.2）：`derive` 不提供 `--path`。迁自 Ledger Live / MEW 等非默认模板的用户，硬件账户走 `import ledger --path`（§3.6）；纯助记词用户需用外部工具按目标路径导出私钥后 `import private-key`。

**Help 输出**

> **相对现状**：仅 `--label` 去掉重复的「助记词交互输入」尾注（该信息已在描述段）。

```text
$ wallet-cli import mnemonic --help

Usage:
  wallet-cli import mnemonic [options]

Import a BIP39 mnemonic phrase. The recovery phrase and master password are read
interactively from the TTY (hidden input); they never touch argv or stdin.

Requires:
  the master password — entered interactively in a TTY

Options:
  --label <string>  human-friendly unique account label, 1-64 chars; omit to auto-generate  [optional]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli import mnemonic --label main
```

### 3.3 `import private-key` —— 导入裸私钥 🔒

> **本版改动**：同一把 key 输出两族地址（与 seed 账户不同，私钥相同）。

**用法**

```
wallet-cli import private-key [--label <name>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 导入一把 secp256k1 私钥；私钥与主密码经隐藏 TTY 读取，**不接受 argv / stdin** |
| EVM 增量 | 同一把 key 输出两族地址（**私钥相同**，与 seed 账户不同） |
| 错误 | `invalid_private_key`、`account_exists`、`tty_required` |

**示例与输出**

```bash
$ wallet-cli import private-key --label hot
? Master password (hidden):
? Paste private key (hidden):
✅ Imported wallet "hot"
  Account ID    wlt_5c0d88b1
  Type          private key
  TRON address  TBhCfAyt...3TCUp
  EVM address   0x12E9...6D29
  Active        yes

⚠️ Private key was read from hidden input and was not printed.
```

> 两个地址是同一把 key 的两种编码——与 `encoding convert` 的输出一致。
>
> 导入即设为活跃账户，与 `create` / `import mnemonic` 一致，故有 `Active yes` 行。`import watch` 是例外（观察账户不自动激活）。

**Help 输出**

> **相对现状**：描述补一句「一把 key 每族各一个地址」；`--label` 去掉重复尾注。

```text
$ wallet-cli import private-key --help

Usage:
  wallet-cli import private-key [options]

Import a raw private key. The private key and master password are read
interactively from the TTY (hidden input); they never touch argv or stdin.
One key yields an address on every chain family.

Requires:
  the master password — entered interactively in a TTY

Options:
  --label <string>  human-friendly unique account label, 1-64 chars; omit to auto-generate  [optional]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli import private-key --label hot
```

### 3.4 `import keystore` —— 导入 keystore 文件 🔒

> **本版改动**：keystore 本就是 EVM 原生格式；导入后为 private-key 类型、不可再派生。

**用法**

```
wallet-cli import keystore <path> [--label <name>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 导入 Web3 标准 keystore JSON（scrypt/aes），装的是**一把私钥**、非种子 |
| EVM 增量 | 两族地址（同 `import private-key`：一把 key 两种编码）；keystore 本就是 EVM 原生格式，TRON 侧属借用 |
| 秘密输入 | keystore 文件密码经隐藏 TTY 读取，**仅交互式**，无 TTY 报 `tty_required` |
| 错误 | `invalid_keystore`、`wrong_keystore_password`、`account_exists`、`tty_required` |

**示例与输出**

```bash
$ wallet-cli import keystore ./UTC--2026-08-06--0x7a3f.json --label from-mm
? Master password (hidden):
? Keystore password (hidden):
✅ Imported wallet "from-mm"
  Account ID    wlt_3d81f0aa
  Type          private key
  TRON address  TDq7mW4x...8sVnP
  EVM address   0x6Ae4...b1F7
  Active        yes

⚠️ Private key was read from the keystore file and was not printed.
```

> keystore 装单条私钥，**不可再派生**——导入后是 private-key 类型账户，没有 `index`，`derive` 对它不适用。这与 MetaMask / Geth 导出的 keystore 语义一致。
>
> 同地址重复导入报 `account_exists`（不静默覆盖，先 `delete`）。

**Help 输出**

> **相对现状**：描述精简改写，并补一句「一把 key 每族各一个地址」（与 `import private-key` 同一句）；**flag 集合无变化**。

```text
$ wallet-cli import keystore --help

Usage:
  wallet-cli import keystore <path> [options]

Import a Web3 keystore JSON file. It holds a single private key, not a seed:
the account cannot be derived from. One key yields an address on every chain
family. The keystore password is read interactively from the TTY (hidden input).

Args:
  path  path to the keystore JSON file

Requires:
  the master password — entered interactively in a TTY

Options:
  --label <string>  human-friendly unique account label, 1-64 chars; omit to auto-generate  [optional]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli import keystore ./keystore.json --label from-mm
```

### 3.5 `import watch` —— 注册观察地址

> **本版改动**：接受 `0x…`，建出 EVM 单 family 账户；地址行标签改为 family 标签。

**用法**

```
wallet-cli import watch --address <T…|0x…> [--label <name>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 注册只读地址（无秘密），family 由地址格式自动识别 |
| EVM 增量 | 接受 `0x…`；建出的账户为 **EVM 单 family** |
| 错误 | `invalid_address`、`account_exists` |

**Options**

| Option | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--address <addr>` | 是 | —— | TRON base58 `T…` 或 EVM `0x…`；family 自动识别。混合大小写的 EVM 地址必须通过 EIP-55 校验（§1.3） |
| `--label <name>` | 否 | 自动 | 账户标签 |

**示例与输出**

```bash
$ wallet-cli import watch --address 0xC4d9...30ab --label team-vault
✅ Added watch-only account "team-vault"
  EVM address  0xC4d9...30ab
  Note         read-only; signing operations will be rejected
```

> **本版把地址行标签从通用的 `Address` 改为 family 标签**（`TRON address` / `EVM address`，与其它 import 回执一致）：两族并存后，`Address` 不告诉用户这是哪条链的地址。单 family 账户在另一族网络下使用报 `family_mismatch`（§11）。

**Help 输出**

> **相对现状**：描述补 family 自动识别与单族可用；`--address` 由「TRON base58」改为两族；Examples 补 EVM 一条。

```text
$ wallet-cli import watch --help

Usage:
  wallet-cli import watch [options]

Register a watch-only address (no secret). The chain family is detected from the
address format; the account is usable only on networks of that family.

Options:
  --address <string>  address to track: TRON base58 T... or EVM 0x...  [required]
  --label <string>    human-friendly unique account label, 1-64 chars; omit to auto-generate  [optional]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli import watch --address TKq3xW7v...2bNc --label team-vault
  wallet-cli import watch --address 0xC4d9...30ab --label team-evm
```

### 3.6 `import ledger` —— 注册 Ledger 账户

> **本版改动**：新增 `--app ethereum`，EVM 路径默认跟随 Ledger Live 模板。

**用法**

```
wallet-cli import ledger --app (tron | ethereum) [--index <n> | --path <bip32> | --address <addr> [--scan-limit <n>]]
                        [--label <name>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 注册硬件账户（本地不存私钥，签名在设备上完成） |
| EVM 增量 | `--app ethereum`；EVM 路径**默认用 Ledger Live 模板** `m/44'/60'/N'/0/0` |
| app 取值 | 只有 `tron` 与 `ethereum` 两个。**Ethereum app 覆盖全部 EVM 网络**（`ethereum` / `sepolia` / `bsc` / `bsc-testnet` 四条网络共用一个账户），不按链单列 `--app` |
| 错误 | `device_not_found`、`device_locked`、`ledger_unsupported`（**规格里的 `app_not_open` 并入此码**，§11.1）、`ledger_setting_required`、`invalid_path`、`account_exists` |

> Ledger 的 EVM 默认模板与 §1.2 软件账户的默认模板不同——**各自跟随所属生态的默认**：软件账户跟随 MetaMask，硬件账户跟随 Ledger Live。Legacy / MEW 用户走 `--path`。
>
> **EVM 侧本版不做 clear-signing——设备屏幕上是盲签。** 签名时传给 `hw-app-eth` 的 resolution 为 `null`：传入 resolution 会让它在**签名过程中**向 Ledger 的 CDN 抓取 clear-signing 描述子，好让设备显示「转 100 USDT 给 0xabc」而非一串原始哈希。
>
> **由项目负责人决定采用 `null`：wallet-cli 在签名时不对任何第三方发出请求。**
>
> | | |
> | --- | --- |
> | **得到** | 签名流程无网络请求，不外泄合约地址与交易意图；离线 / 受限环境可用 |
> | **失去** | **设备上显示的是原始哈希**，用户无法在硬件上核对收款人与金额 |
>
> 这是**用户可见**的行为差异，而硬件钱包用户尤其在意——clear-signing 正是他们买硬件钱包的理由之一。后续是否开放待定。
>
> **`--app` 不按链细分**：设备上的 Ethereum app 能为任意 EVM 链签名（chain id 在交易里，由 app 读取），且各 EVM 链共用 coinType 60 的同一把 key，所以一次 `--app ethereum` 注册出的账户在四条 EVM 网络上通用。Ledger 的 clone app（BSC、Polygon 等）是给想要自有品牌界面的链做的可选项，不是签名前提；新 EVM 网络接入 Ledger 走的是 Crypto Asset List 登记，不是新增一个 app。`--app` 的取值是**设备上要打开的 app 名**（故为 `ethereum` 而非 `evm`），账户 family 仍记为 `evm`。

**示例与输出**

```bash
$ wallet-cli import ledger --app ethereum --index 0 --label cold-evm
✅ Registered Ledger account "cold-evm"
  Account ID   wlt_e18b45c0
  App          evm
  Path         m/44'/60'/0'/0/0
  EVM address  0x3c8d...77a1

⚠️ No private key is stored locally. Signing requires device confirmation.
```

> `App` 行的值取自账户 family（`evm`），不是 `--app` 的输入值（`ethereum`）——现状如此，本版不改：family 才是后续所有命令的匹配依据。

**Help 输出**

> **相对现状**：描述与 Requires 与现状一致，只动 Options 与 Examples——`--app` 由 `<tron>` 扩为 `<tron|ethereum>`；**`--scan-limit` 的默认值由描述移入 `[optional, default: …]` tag**；`--path` 去掉 TRON 专属的路径举例；`--app` 描述去掉「address-derivation scheme」改为「选定 chain family」；Examples 补 ethereum 一条。
>
> **`--index` 是这条规则的例外，默认值留在描述文字里。** 那个 tag 由 schema 的 `.default()` 推导——要显示 `default: 0`，字段就必须真的有默认值。而 `--index` 参与「`--index` / `--path` / `--address` 三个定位器只能给一个」的互斥规则，**该规则数的是「有没有给」**：加上默认值后 `index` 恒为已给，`--path` 单独使用会被判成两个定位器而被拒（实测确认会发生）。
>
> （`--scan-limit` 之所以能做，是因为它不参与互斥；实作直接引用服务层的 `DEFAULT_SCAN_LIMIT` 作 `.default()`，既消掉重复的默认值副本，也让 `--json-schema` 的 `inputSchema` 有 `"default": 20`——散文里的默认值 agent 读不到。）

```text
$ wallet-cli import ledger --help

Usage:
  wallet-cli import ledger [options]

Register a Ledger account (watch-only; signs on device)

Requires:
  a connected, unlocked Ledger with the selected app (--app) open

Options:
  --app <tron|ethereum>  Ledger app to open on the device; selects the chain family  [required]
  --index <number>       account index under the app's default path; mutually exclusive with --path and --address  [optional, default: 0]
  --path <string>        explicit derivation path; mutually exclusive with --index and --address  [optional]
  --address <string>     locate this address by scanning indexes; mutually exclusive with --index and --path  [optional]
  --scan-limit <number>  how many indexes to scan when using --address  [optional, default: 20]
  --label <string>       human-friendly unique account label, 1-64 chars; omit to auto-generate  [optional]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli import ledger --app tron --index 0 --label cold
  wallet-cli import ledger --app ethereum --index 0 --label cold-evm
```

### 3.7 `list` —— 列出钱包 / 账户

> **本版改动**：地址列按当前网络 family 显示；json 恒给两族全量 + 新增 `derivationPath`。

**用法**

```
wallet-cli list [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 列出全部本地账户，按 HD 种子 / 类型分组 |
| EVM 增量 | 地址列**按当前网络的 family 显示**；json 恒给两族全量 |
| 网络 | 可选，仅用于决定显示哪族地址（不访问节点） |

**示例与输出**

```bash
$ wallet-cli list --network sepolia
HD  wlt_ab12cd34
├─ [0] main    0x7a3f...c19b  (active)
└─ [1] main-1  0x91b2...4d0e

private key
└─ hot         0x12E9...6D29

watch
└─ team-vault  0xC4d9...30ab
```

```bash
$ wallet-cli list --network nile
# 同一批账户，地址列切到 TRON 族；watch 账户因是 EVM 单 family，不在此网络下展示
HD  wlt_ab12cd34
├─ [0] main    TSRmq8kP...9dEf  (active)
└─ [1] main-1  TKq3xW7v...2bNc

private key
└─ hot         TBhCfAyt...3TCUp
```

```bash
$ wallet-cli list -o json
{ "schema":"wallet-cli.result.v1","success":true,"command":"list","data":[ { "accountId":"wlt_ab12cd34.0","label":"main","type":"seed","index":0,"active":true,"addresses":{ "tron":"TSRmq8kP...9dEf","evm":"0x7a3f...c19b" },"seedId":"wlt_ab12cd34","derivationPath":{ "tron":"m/44'/195'/0'/0/0","evm":"m/44'/60'/0'/0/0" } },{ "accountId":"wlt_c4a70e93","label":"team-vault","type":"watch","index":null,"active":false,"family":"evm","addresses":{ "evm":"0xC4d9...30ab" },"derivationPath":null } ],"meta":{ "durationMs":13,"warnings":[] } }
```

> **被网络过滤掉的账户会在 stderr 补一行提示**（不进 stdout）：
>
> ```text
> warning: 2 account(s) have no tron address and are not shown; use --network to switch, or --output json to see every family
> ```
>
> 理由是 **Ledger 账户与 watch 一样是单族，而 Ledger 是能签名的真实账户**：一个只有 EVM Ledger 的用户，在默认 TRON 网络下跑 `list` 会**什么硬件账户都看不到**，且没有任何线索告诉他 `--network` 的存在。走 stderr 而不是 stdout，是为了让 stdout 保持干净（机器只读 stdout），json 不受影响。
>
> text 不并排两族地址：表会宽一倍，且用户当下只关心在用的链。json 给全量。**`derivationPath` 是本版新增字段**（按 family 的 map，watch / private-key 账户为 `null`）——现状 json 只有 `accountId` / `label` / `type` / `index` / `active` / `addresses` / `seedId`，没有路径，用户无从判断账户用的哪套派生模板（§1.2）。
>
> **两个按账户类型出现/消失的字段，规则本版写死**：`seedId` **只在 seed 账户出现**——观察、private-key、keystore、Ledger 账户没有种子，不能拿 `accountId` 顶上（现状 watch 条目的 `seedId` 与 `accountId` 同值，是个伪字段，本版去掉）；`family` **只在单族账户出现**（watch / Ledger），两族齐备的账户不给该字段，哪族看 `addresses` 的键即可。判定「这个账户能不能派生」一律看 `seedId` 在不在，不看 `type` 的字符串。

**Help 输出**

> **相对现状**：描述补两句；**新增全局 `--network`**（现状 `list` 无此项）；Examples 由 `--output json` 一条换为两族三条。

```text
$ wallet-cli list --help

Usage:
  wallet-cli list [options]

List wallets/accounts (no unlock needed). The address column shows the family of
the selected network; JSON output always carries every family's address.

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli list
  wallet-cli list --network sepolia
  wallet-cli list --output json
```

### 3.8 `current` —— 当前活跃账户

> **本版改动**：账户有哪族地址就显示哪族，各一行；`--qr` 出当前网络 family 的地址。

**用法**

```
wallet-cli current [--qr] [--account <ref>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 显示**选定账户**（默认为活跃账户） |
| EVM 增量 | **账户有哪族地址就显示哪族，各一行**；`--qr` 生成**当前网络 family** 的地址二维码 |
| 账户 | 支持全局 `--account`；省略则为活跃账户 |
| 错误 | `family_mismatch`（`--qr` 时账户在选定网络 family 下没有地址；**text 与 json 一致**） |

**示例与输出**

```bash
$ wallet-cli current
Active account: main
  TRON address  TSRmq8kP...9dEf
  EVM address   0x7a3f...c19b
```

```bash
# 单 family 账户只有一行地址
$ wallet-cli use team-vault && wallet-cli current
Active account: team-vault
  EVM address  0xC4d9...30ab
```

> **地址行按账户实际拥有的 family 出**：`create` / `import mnemonic` / `import private-key` / `import keystore` 建出的账户两族齐备，出两行；`import watch` / `import ledger` 是单 family，只出一行——空值行被渲染层丢弃，不存在 `EVM address` 留空这种输出。
>
> `--qr` 取**当前网络 family** 的地址：选定账户在该 family 下没有地址时（如 EVM 单族账户配 `--network nile`）报 `family_mismatch`，而不是回退到它拥有的那一族——回退会让用户拿到一个另一条链的收款码。
>
> **该检核与输出格式无关**：`-o json` 同样拒绝并报 `family_mismatch` / exit 2，通过时回 `receiveAddress`。**QR 图是这条命令唯一属于 text 的部分，也是唯一由输出格式决定的部分。**
>
> **本版支持全局 `--account`**：`current` 先前是唯一一条「显示某个账户」却不接受它的命令。支持它让「看一眼另一个账户的地址」不必先 `use` 过去再 `use` 回来——后者会改动活跃账户这个全局状态，只为读一次。
>
> **单族账户的 family 检核时机本版后移**：先前在**解析网络**的当下就用账户的 family 去比对，现在移到「真的要这一族的地址」那一刻。旧时机让 `current` 这种**纯本地查看**命令，在账户与默认网络不同族时**完全无法查看自己的账户**；而那道提前的检核并没有防住任何事——没有它，真正需要地址的命令一样会在任何 RPC 之前失败。连带效果：`list`、`backup --records` 与 `current` 得以支持 `--network`（先前该旗标被静默忽略且不出现在 help）。
>
> **后果需写进 release note**：`config.defaultNetwork` 无法解析时，`list` 与 `backup --records` 会**失败**——这是把它们改为 network-aware 的代价，决定维持硬失败（行为一致、早点报错更清楚），release note 应点明「先修 defaultNetwork」。

**Help 输出**

> **相对现状**：**新增全局 `--network`**（决定 `--qr` 出哪族地址）**与全局 `--account`**（并带对应的 Requires 段）；描述补「按账户拥有的 family 每族一行」；`--qr` 描述补「该族无地址时失败」；Examples 补两条。

```text
$ wallet-cli current --help

Usage:
  wallet-cli current [options]

Show the current active account, with one address line per chain family it has

Options:
  --qr  print a receive QR code for the selected network's address; fails when the account has none for that family  [optional, default: false]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli current
  wallet-cli current --qr
  wallet-cli current --qr --account main
  wallet-cli current --qr --network sepolia
```

### 3.9 `derive` —— 派生下一个 HD 账户 🔒

> **本版改动**：一次派生两族地址。**不新增 `--path`**——见 §1.2「软件账户本版只支持默认模板」。

**用法**

```
wallet-cli derive --seed-id <wlt_…> [--index <n>] [--label <name>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 从种子钱包派生新账户 |
| EVM 增量 | 一次产出两族地址 |
| 错误 | `seed_not_found`、`account_exists` |

**Options**

| Option | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--seed-id <id>` | 是 | —— | 种子钱包 id（`list` 的 HD 组头） |
| `--index <n>` | 否 | 下一个空闲 | 账户序号，按各族默认模板套用 |
| `--label <name>` | 否 | `<钱包名>-<index>` | 账户标签 |

**示例与输出**

```bash
$ wallet-cli derive --seed-id wlt_baezdw0b --password-stdin
✅ Derived sub-account "main-1"
  Account ID    wlt_baezdw0b.1
  Index         1
  TRON address  TFtFc27ig1NKYLkmapdFmhHgrUS1YWMdha
  EVM address   0x1486AbC087a7442d44C43d802b2637560fADf895
  Active        yes
  Note          shares master mnemonic; no separate backup needed
```

> 一次派生两族地址，两行并出。
>
> **`--path` 在本版不存在**，敲了会得到 `invalid_option: unknown option(s): --path`。理由与取舍见 §1.2；`invalid_path` 这个错误码**仍然保留**，由 `import ledger --path` 在路径格式非法时产生（§11）。

**Help 输出**

> **相对现状**：描述补一句「每族一套 BIP44 模板，一次 derive 产出每族一个地址」；`--index` / `--label` 描述精简并补字数上限；Requires 冠词按 §10.1 统一。

```text
$ wallet-cli derive --help

Usage:
  wallet-cli derive [options]

Derive the next HD account from a seed wallet (by --seed-id). Each family uses
its own BIP44 template, so one derive yields an address per family.

Requires:
  the master password — pass --password-stdin; this command never prompts

Options:
  --seed-id <string>  seed id (wlt_…) of the HD wallet to derive from — shown as the HD group header in `list`  [required]
  --index <number>    explicit HD account index, in account index; omit to use the next free index  [optional]
  --label <string>    label for the new derived account, 1-64 chars; omit to auto-generate <wallet-name>-<index>  [optional]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli derive --seed-id wlt_ab12cd34
```

### 3.10 `backup` —— 导出账户机密 🔒⚠️

> **本版改动**：seed 账户导出**私钥**时，由**既有的全局 `--network`** 决定导哪一族；助记词导出无歧义。**不新增 `--family`。**

**用法**

```
wallet-cli backup <account> [--keystore] [--network <net>] [--out <path>] [--password-stdin]
wallet-cli backup [<account>] --records [--from <t>] [--to <t>] [--limit <n>] [--offset <n>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 把助记词 / 私钥导出到 0600 文件（**从不写 stdout**） |
| EVM 增量 | 导出**私钥**时由 `--network` 选定链（seed 账户两族私钥不同）；未给则用 `config.defaultNetwork` |
| 错误 | `account_not_found`、`not_exportable`（观察 / Ledger 账户）、`output_exists` |

**Options（增量）**

| Option | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--network <net>` | 否 | `config.defaultNetwork` | **全局旗标**。导出私钥时决定导哪一族的钥匙；助记词导出与 private-key 账户不受影响 |

**为什么用 `--network` 而不是新增 `--family`**

**family 是系统内部概念，不对外暴露成选项。** 全 CLI 目前没有任何一个旗标让用户直接打 family 名——`import ledger` 用 `--app tron|ethereum`、`contact` 从地址推断（§3.11）、`list` / `current --qr` 用 `--network`。`--family` 会是唯一的例外，等于为同一个概念引入第二套词汇。「网络作为显示／选择哪一族的选择器」是本版已经确立的模式，`backup` 沿用它。

**但问题本身仍然必须修**（换旗标不会让它消失）：seed 账户两族是**两把不同的私钥**（§1.2：coin 195 vs coin 60），而 V3 keystore 结构上只装一把。修前写死导出 TRON 那把，实测后果是——钱包显示 EVM 地址，导出的钥匙导入 MetaMask 得到另一个地址。**导入完全成功、地址看起来正常，只是不是用户的**，而且没有任何错误信息。

**补偿**：因为没给 `--network` 会静默吃默认值，回执与 json 都带 `Family` 栏，让用户一眼看到拿到的是哪一把。

**示例与输出**

```bash
# 默认网络为 tron:728126428，故导出 TRON 那把
$ wallet-cli backup main --keystore --password-stdin
⚠️ Keystore written <cwd>/wlt_baezdw0b.0-1787825194541.keystore.json
  Account ID  wlt_baezdw0b.0
  Family      tron
  Secret      private key
  File mode   0600
  Bytes       608

⚠️ Secret material was written only to the keystore file, never to stdout.
```

```bash
# 同一个账户，切到 EVM 网络导出的是另一把钥匙
$ wallet-cli backup main --keystore --network sepolia --out ./main-evm.keystore.json --password-stdin
⚠️ Keystore written <cwd>/main-evm.keystore.json
  Account ID  wlt_baezdw0b.0
  Family      evm
  Secret      private key
  File mode   0600
  Bytes       608

⚠️ Secret material was written only to the keystore file, never to stdout.
```

> 以上为实测输出，仅把绝对路径的目录部分省略为 `<cwd>`。
>
> **文件默认落在当前工作目录**，不是 `~/.wallet-cli/backup/`（这是既有行为，与 EVM 无关，此前文档写错）。默认文件名为 `./<accountId>-<timestamp>.json`（`--keystore` 时为 `.keystore.json`），以 0600 创建且**从不覆盖**已存在的文件。因此**不要在共享目录或 git 仓库里跑这条命令**——help 描述里有对应的一行警告。
>
> 助记词导出无歧义（一句助记词覆盖两族），不受 `--network` 影响。

**Help 输出**

> **相对现状**：描述改写（keystore 语义、「只写文件不写 stdout」、**默认写当前目录的警告**、`--records` 段）；**不新增 `--family`**；`--out` 描述补默认文件名与「从不覆盖」；`--records` 全套沿用现状；新增全局 `--network`（§3.8 的检核时机后移使其可用）。

```text
$ wallet-cli backup --help

Usage:
  wallet-cli backup [<account>] [options]

Export an account's secret to a 0600 file — the native backup format, or a standard Web3
keystore JSON with --keystore (importable by TronLink and others, encrypted with your master
password). A keystore holds a single private key, so an HD account exports only its current
derived key; use the native backup to move a whole seed.

The secret is written only to the file, never to stdout; watch-only and Ledger accounts have
none to export. Files default to the CURRENT DIRECTORY — do not run this in a shared directory
or a git repository.

With --records and no account, nothing is exported: it shows the local audit log of past
exports instead — one row per 'backup' and 'backup --keystore', newest first, with the file
each secret went to. Imports are not logged. The log keeps the most recent 1000 entries.

Args:
  account  account or wallet to export, addressed by accountId, label, or address; with --records, the account whose exports to list

Requires:
  the master password — pass --password-stdin, or enter it interactively in a TTY

Options:
  --keystore         export as a standard Web3 keystore JSON (importable by TronLink and others, encrypted with your master password) instead of the native format  [optional, default: false]
  --out <string>     output file path; omit to write ./<accountId>-<timestamp>.json in the current directory (.keystore.json with --keystore); file is created with mode 0600 and never overwritten  [optional]
  --records          list past secret exports instead of exporting anything  [optional, default: false]
  --from <string>    with --records: only records at or after this UTC time; format YYYY-MM-DD or 'YYYY-MM-DD HH:mm:ss', parsed as UTC  [optional]
  --to <string>      with --records: only records at or before this UTC time; format YYYY-MM-DD or 'YYYY-MM-DD HH:mm:ss', parsed as UTC  [optional]
  --limit <number>   with --records: maximum records to return; omit for all  [optional]
  --offset <number>  with --records: pagination offset  [optional]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli backup main --out ~/main-backup.json --password-stdin
  wallet-cli backup main --keystore --password-stdin
  wallet-cli backup --records --limit 20
  wallet-cli backup --records --account main --from 2026-08-01
```

### 3.11 `contact` 组 —— 收款人通讯录（family 感知改造）

> **本版改动**：**必须改造**——条目按地址格式识别并持久化 family，`--to <name>` 跨族报错，否则会把 EVM 地址拿去 TRON 网络发交易。**定案本版修订**：名称与地址均**全局唯一**，family 不出现在任何用户可见的表面。

**用法**

```
wallet-cli contact add <name> <address> [--note <text>]
wallet-cli contact list
wallet-cli contact remove <name>
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 本地收款人通讯录；`tx send --to <name>` 可直接用联系人名代替地址 |
| EVM 增量 | **条目内部记录 family**（按地址格式识别），`--to <name>` 解析时校验 family 与当前网络一致 |
| 错误 | `already_exists`（**同名或同址**）、`invalid_address`、**`family_mismatch`**（联系人地址与当前网络不同族）、`contact_not_found` |

> **这是本版必须改造的一条，否则会转错链**：通讯录现状只存「名字 → 地址」、不分网络，而 `--to` 接受联系人名。加入 EVM 后，`tx send --to exchange --network nile` 若 `exchange` 存的是 `0x…`，就会拿一个 EVM 地址去 TRON 网络发交易。地址格式校验能挡住这一例（TRON 侧 base58 解码失败），但**依赖下游校验兜底不是设计**——通讯录自己就该知道每条记录属于哪条链。

#### 定案（本版修订：推翻「同名可在两族各存一条」）

**对外是一张扁平的 `name ↔ address` 表，两者各自全局唯一。** family 只是内部存储分桶与 `--to` 路由的细节，**任何用户可见的表面都不出现它**——没有 `Family` 列、没有 `family` json 字段、没有 `--family` 旗标。

**为什么推翻**：原定案写的是「同名允许在不同 family 下各存一条」。但**「同名允许」不是谁决定的，是存储结构的副产物**——`contacts.json` 是 `entries: { tron: […], evm: […] }` 按 family 分桶，实作把「名称唯一性」也继承了桶的范围。没有人问过唯一性的范围**该**是什么，文档后来为这个既有行为补了理由。

改成全局唯一之后，三件事同时消失：

| 原问题 | 全局唯一之后 |
| --- | --- |
| `remove <name>` 跨族同名该删哪一条 | **问题不存在**——不需要 `--family`，也不需要第二个位置参数 |
| 「`--to <name>` 跨族报 `family_mismatch`」 | **才真正有用**。允许同名时，这个错误对「两族都有的名字」永远不会触发 |
| `--family` 与「family 不对外暴露」原则冲突（§3.10） | 一并消失 |

**代价**：想要两条就得叫 `exchange-tron` 与 `exchange-evm`——明确、不会搞错，成本仅止于多打几个字。

`contact list` 保持纯本地、**无 `--network`**、不按网络过滤：条目数通常个位数，过滤省不下多少噪声，却会让刚 `contact add` 完的用户在默认网络下看不到自己刚加的条目（`add` 按地址格式定 family，不看 `--network`）。`--to` 选哪条由名称直接决定，不依赖列表怎么显示。

**示例与输出**

```bash
$ wallet-cli contact add exchange TKyeCYyEtgNs5X2srhKcjLiimVmWFy1q61 --note "CEX deposit"
✅ Contact added
  Name     exchange
  Address  TKyeCYyEtgNs5X2srhKcjLiimVmWFy1q61
  Note     CEX deposit
```

```bash
# 同名不再允许——即使属于另一族
$ wallet-cli contact add exchange 0x1486AbC087a7442d44C43d802b2637560fADf895
error [already_exists]: a contact named exchange already exists
```

```bash
$ wallet-cli contact add exchange-evm 0x1486AbC087a7442d44C43d802b2637560fADf895 --note "CEX deposit"
✅ Contact added
  Name     exchange-evm
  Address  0x1486AbC087a7442d44C43d802b2637560fADf895
  Note     CEX deposit
```

```bash
$ wallet-cli contact list
| Name         | Address                                    | Note        |
| ------------ | ------------------------------------------ | ----------- |
| exchange     | TKyeCYyEtgNs5X2srhKcjLiimVmWFy1q61         | CEX deposit |
| exchange-evm | 0x1486AbC087a7442d44C43d802b2637560fADf895 | CEX deposit |
```

```bash
$ wallet-cli contact list -o json
{ "schema":"wallet-cli.result.v1","success":true,"command":"contact.list","data":{ "contacts":[ { "name":"exchange","address":"TKyeCYyEtgNs5X2srhKcjLiimVmWFy1q61","note":"CEX deposit" },{ "name":"exchange-evm","address":"0x1486AbC087a7442d44C43d802b2637560fADf895","note":"CEX deposit" } ] },"meta":{ "durationMs":16,"warnings":[] } }
```

```bash
$ wallet-cli contact remove exchange-evm
✅ Contact removed
  Name     exchange-evm
  Address  0x1486AbC087a7442d44C43d802b2637560fADf895
```

> 以上均为实测输出。**没有 `Family` 列，json 也没有 `family` 字段**——地址本身 `T…` / `0x…` 已经表明是哪条链。
>
> **`--to <name>` 跨族的错误措辞描述地址，不描述 family**，用户不必学会那个词：`contact exchange holds the address T…, which the selected network cannot pay`。
>
> **破坏性后果**（release note）：`contact list` 的 text 少了 `Family` 列，json 少了 `family` 字段。

**Help 输出**

> **相对现状**：`add` 的描述与 `name` / `address` 参数补 family 说明（按地址格式校验、名称可在任何接受地址的地方使用）；`name` 补「1-64 字符、不得形似地址」的上限；**`remove` 不新增 `--family`**；三条命令的 flag 集合与现状一致。

```text
$ wallet-cli contact add --help

Usage:
  wallet-cli contact add <name> <address> [options]

Add a locally stored recipient. The address is validated against the family it belongs to (T… = TRON, 0x… = EVM), and the name can then be used anywhere an address is accepted.

Args:
  name     local name for this recipient; 1-64 safe characters and must not look like a chain address. Usable anywhere an address is accepted
  address  recipient address to store under this name

Options:
  --note <string>  free-form note, up to 128 safe characters  [optional]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli contact add alice TBy6... --note 'Alice mainnet'
```

```text
$ wallet-cli contact list --help

Usage:
  wallet-cli contact list [options]

List every recipient in the local plaintext address book.

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli contact list
```

```text
$ wallet-cli contact remove --help

Usage:
  wallet-cli contact remove <name> [options]

Remove one recipient from the local address book without changing any on-chain state.

Args:
  name  name of the contact to delete

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli contact remove alice
```

### 3.12 `encoding convert` / `address generate` —— 编码工具的边界说明

> **本版改动**：**行为零改造**，只在两条 help 的描述里各补一句边界说明。

这两条纯本地命令一直同时输出 TRON 与 EVM 两种地址，容易被读成「账户模型」的一部分——**它们是编码工具**：给的是同一把 key 的两种编码，与 §1.1 账户模型里「seed 账户两族私钥不同」是两回事。不补这句，用户会拿 `encoding convert` 的输出去对 `create` 的两行地址，然后发现对不上。

| 命令 | 补的那句（英文原文） |
| --- | --- |
| `encoding convert` | `The two address forms are encodings of one 20-byte key hash, not two derived accounts.` |
| `address generate` | `The TRON and EVM addresses shown are two encodings of the same generated key.` |

**Help 输出**

> **相对现状**：描述末尾各加一句边界说明；**flag 集合、Args、Examples 全部不变**。

```text
$ wallet-cli encoding convert --help

Usage:
  wallet-cli encoding convert <input> [options]

Auto-detect the input and print every equivalent representation, validating
checksums. Two families: ADDRESS (TRON base58 / TRON 41-hex / EVM 0x / public
key hex -> address forms) and ENCODING (arbitrary hex <-> Base64 <->
Base58Check). Routing is automatic by whether the input is address-shaped.
Purely local. Private keys and mnemonics are NOT accepted (secrets must never
appear on the command line). The two address forms are encodings of one 20-byte
key hash, not two derived accounts.

Args:
  input  value to convert: an address, a public key hex, or any hex/Base64/Base58Check string

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli encoding convert TBhCfAyt...3TCUp
  wallet-cli encoding convert 0x12E9...6D29
  wallet-cli encoding convert deadbeef0102
```

```text
$ wallet-cli address generate --help

Usage:
  wallet-cli address generate [options]

Generate a random keypair locally (works offline). The private key is written to
a 0600 file by default and is NOT stored in the wallet — import it with
`import private-key` to sign with it. The TRON and EVM addresses shown are two
encodings of the same generated key.

Options:
  --out <string>    file to write the keypair to (0600); refuses to overwrite  [optional, default: <wallet-cli-root>/generated/keypair-<address>]
  --print-secret    print the private key to stdout instead of writing a file (use offline)  [optional, default: false]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli address generate
  wallet-cli address generate --out /secure/usb/key.json
```

---

## 4. account 组

### 4.1 `account balance` —— 原生币余额

> **本版改动**：走 `eth_getBalance`，单位 ETH / wei；json 结构与 TRON 侧完全一致。

**用法**

```
wallet-cli account balance [--account <ref>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 查询账户原生币余额 |
| EVM 增量 | 走 `eth_getBalance`；单位 ETH / wei（18 位） |
| 网络 | 可选（缺省 `config.defaultNetwork`） |
| 错误 | `family_mismatch`、`rpc_error`（含端点限流 429） |

**示例与输出**

```bash
$ wallet-cli account balance --network sepolia
Label    main
Balance  12.3456 ETH
```

```bash
$ wallet-cli account balance --network sepolia -o json
{ "schema":"wallet-cli.result.v1","success":true,"command":"account.balance","data":{ "address":"0x7a3f...c19b","balance":"12345600000000000000","decimals":18,"symbol":"ETH" },"meta":{ "durationMs":180,"warnings":[] },"chain":{ "family":"evm","network":"eip155:11155111","chainId":"11155111" } }
```

> json 结构与 TRON 侧**完全一致**（`address` / `balance` / `decimals` / `symbol`），只是值与单位不同：`balance` 恒为最小单位整数字符串（TRON 给 sun、EVM 给 wei），人话单位只在 text 出现。

**Help 输出**

> **相对现状**：描述由 `Show native balance (TRX/SUN)` 改为族中立；全局 `--network` 示例值改为跨两族；Examples 改为两族对称。

```text
$ wallet-cli account balance --help

Usage:
  wallet-cli account balance [options]

Show the native coin balance for the selected network

Requires:
  an account — defaults to active; override with --account <accountId|label> (or run `wallet-cli use <account>` to change the active account)

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account set by use  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli account balance --network nile
  wallet-cli account balance --network sepolia
```

### 4.2 `account portfolio` —— 持仓与估值

> **本版改动**：代币为 ERC20；价格源需补 EVM 链与代币的 id 映射。

**用法**

```
wallet-cli account portfolio [--account <ref>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 原生币 + 地址簿内代币的余额与 USD 估值 |
| EVM 增量 | 代币为 ERC20；价格源需补 EVM 链与代币的 id 映射 |
| 错误 | 同 §4.1；价格源不可用时估值列留空、进 `meta.warnings`，并给 `priceUnavailable` / `priceReason` 两个可程序判断的字段 |

**示例与输出**

```bash
$ wallet-cli account portfolio --network ethereum
| Token | Balance | Price (USD) | Value (USD) |
| ----- | ------- | ----------- | ----------- |
| ETH   | 12.3456 | $3,321.40   | $41,004.35  |
| USDC  | 2500    | $1.0000     | $2,500.00   |
| USDT  | 1000    | $0.9998     | $999.80     |

Total ≈ $44,504.15
```

```bash
$ wallet-cli account portfolio --network ethereum -o json
{ "schema":"wallet-cli.result.v1","success":true,"command":"account.portfolio","data":{ "network":"eip155:1","account":"wlt_ab12cd34.0","address":"0x7a3f...c19b","priceSource":"coingecko","holdings":[ { "kind":"native","symbol":"ETH","decimals":18,"rawBalance":"12345600000000000000","balance":"12.3456","priceUsd":"3321.40","valueUsd":"41004.35" },{ "kind":"erc20","id":"0xA0b8...eB48","symbol":"USDC","decimals":6,"rawBalance":"2500000000","balance":"2500","priceUsd":"1.0000","valueUsd":"2500.00" },{ "kind":"erc20","id":"0xdAC1...1ec7","symbol":"USDT","decimals":6,"rawBalance":"1000000000","balance":"1000","priceUsd":"0.9998","valueUsd":"999.80" } ],"totalValueUsd":"44504.15" },"meta":{ "durationMs":642,"warnings":[] },"chain":{ "family":"evm","network":"eip155:1","chainId":"1" } }
```

> 结构沿用既有：`rawBalance`（最小单位）与 `balance`（人话单位）并存，价格不可用时 `priceUsd` / `valueUsd` / `totalValueUsd` 为 `null`、text 显示 `-`。代币条目的合约地址走 `id` 字段（与 token 地址簿同名）。

#### 降级语义（本版新增两组字段）

| 情况 | 字段 | 语义 |
| --- | --- | --- |
| 价格源整体失败 | `priceUnavailable: true` + `priceReason` | 全表估值列为 `null`；同时进 `meta.warnings` |
| 单个代币余额读不到 | 该条目 `balanceUnavailable: true` + `reason` | **该行仍在**，余额与估值为 `null` |

**为什么要布尔字段而不只是 `meta.warnings`**：`warnings` 是给人看的字符串，**agent 要分支就得比对字符串**。两个布尔字段让「为什么没有估值」可程序判断。

**为什么逐币降级**：一个下市合约、一次 `balanceOf` revert 或一次 RPC 抖动，**不该让整张持仓表消失**；而该行报 0 会是一个假的事实——**「读不到」与「是零」是两件事**。

> EVM 端逐币并行读取，**刻意不用 multicall**：那要引入合约依赖与每条链一个待验证的地址，只为省下几次往返。

#### 测试网估值规则（本版新增）

**标记为测试网的网络（§2.2）一律不估值，币价与代币价固定为 `0`，且不发任何外部请求。**

- **取 `0` 而不是 `null`**：`null` 的意思是「我们查不到」，而测试网不是查不到——**是确定没有价值**。说出后者比留白诚实，`totalValueUsd` 也会有一个明确的 0 而不是一片 `-`。
- **TRON 侧同步变更**：`nile` / `shasta` 先前显示**真实 TRX 币价**，本版起为 0。这是刻意一并改的——**两族在同一条命令上给相反的答案，比任何一种答案都糟**。（破坏性后果，进 release note。）
- **顺带关掉一个真实曝险**：测试网代币先前用**主网平台**查价，而确定性部署可能让同一个地址同时存在于两条链——那会让测试代币拿到真币的价格。
- **未申报为测试网的自配网络维持 `null`**：不知道 ≠ 不值钱。
- **币种名称维持该链的正式名称**（ETH / BNB / TRX），不改成 `SepoliaETH` / `tBNB`——「这不是真钱」由估值规则表达，比改币种名更直接，也不必偏离链本身的称呼。
>
> **余额列按 §1.4 的精度规则**：最多 6 位小数、尾随零去除，故 `2500` 不写成 `2500.00`。**价格与估值列不适用该规则**——它们是法币金额，按 USD 惯例固定 2 位（价格因单价可能极小，保留 4 位），补零是可读性所需，不是精度损失。

**Help 输出**

> **相对现状**：描述补一句「代币取自所选网络的地址簿」；`--network` 示例值改为跨两族；Examples 两族对称。

```text
$ wallet-cli account portfolio --help

Usage:
  wallet-cli account portfolio [options]

Show native + token balances with best-effort USD value. Tokens come from the
address book of the selected network.

Requires:
  an account — defaults to active; override with --account <accountId|label> (or run `wallet-cli use <account>` to change the active account)

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account set by use  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli account portfolio --network nile
  wallet-cli account portfolio --network sepolia
```

### 4.3 `account info` —— 账户状态摘要

> **本版改动**：EVM 侧给 Balance / Nonce / Type / Code size——**Nonce 是排查卡单的唯一入口**。

**用法**

```
wallet-cli account info [--account <ref>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 该账户在当前链上的关键状态摘要 |
| EVM 增量 | `eth_getBalance` + `eth_getTransactionCount` + `eth_getCode`；字段按 EVM 账户模型取舍 |
| 错误 | `account_not_found`（`--account` 传了非本地账户）、`family_mismatch`、`rpc_error`（含端点限流 429） |

**示例与输出**

```bash
$ wallet-cli account info --network sepolia
Label    main
Address  0x7a3f...c19b
Balance  12.3456 ETH
Nonce    42
Type     EOA
```

```bash
# 账户地址上有字节码时：Type 变为 contract，附字节码大小
# team-vault 是 `import watch` 注册的团队多签合约地址（§3.5）
$ wallet-cli account info --account team-vault --network ethereum
Label      team-vault
Address    0xC4d9...30ab
Balance    18.42 ETH
Nonce      1
Type       contract
Code size  3,124 bytes
```

> **`--account` 只解析本地账户**（accountId / 标签 / 该账户自己的地址，§1.3），不是「查任意链上地址」的入口——传一个不在本地的地址报 `account_not_found`。要看别人的合约，先 `import watch --address <addr>` 注册成观察账户再查；这与 `account balance` / `portfolio` 的口径一致，全组不为 EVM 破例。

```bash
$ wallet-cli account info --network sepolia -o json
{ "schema":"wallet-cli.result.v1","success":true,"command":"account.info","data":{ "label":"main","address":"0x7a3f...c19b","balance":"12345600000000000000","decimals":18,"symbol":"ETH","nonce":42,"type":"eoa" },"meta":{ "durationMs":260,"warnings":[] },"chain":{ "family":"evm","network":"eip155:11155111","chainId":"11155111" } }
```

> 合约地址的 json 多 `codeSize`（字节数整数）、`type` 为 `contract`；EOA 不给 `codeSize` 而非给 `0`——空值行被丢弃是渲染层规则，json 同样不塞无意义的零。`type` 的取值只有 `eoa` / `contract` 两种，全小写（与 `Status` 的收敛口径一致，§6.5）。

> **字段按 family 取舍，不是「TRON 有什么 EVM 也要有什么」**：TRON 侧给 `Staked` / `Energy` / `Bandwidth` / `Permissions` / `Created`（资源与多签模型），EVM 一个都没有；EVM 给 `Nonce` 与 `Type`，TRON 没有。两族共有的只有 `Label` / `Address` / `Balance`。
>
> **`Nonce` 是这条命令在 EVM 上存在的主要理由**：它是 `--nonce` 手动指定、nonce gap 排查、`--wait` 超时后判断交易是否还挂在内存池的唯一查询入口（§6.1）。业内对应 `cast nonce`；`Type` 对应 `cast code` 的有无判断，转账前确认收款方是不是合约。

**Help 输出**

> **相对现状**：描述由 `Show raw account data (getAccount; …)` 改写为按 family 说差异、TRON 在前（去 RPC 方法名，§10.1 规则 3）；`--network` 示例值；Examples 两族对称。

```text
$ wallet-cli account info --help

Usage:
  wallet-cli account info [options]

Show the account's on-chain state for the selected network. Fields differ by
family: TRON reports staked amounts, resources and permissions; EVM reports the
transaction nonce and whether the address holds code.

Requires:
  an account — defaults to active; override with --account <accountId|label> (or run `wallet-cli use <account>` to change the active account)

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account set by use  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli account info --network nile
  wallet-cli account info --network sepolia
```

### 4.4 关于 `account history`（EVM 后续版本，本节无命令规格）

**本版 EVM 不做**，但理由不是「做不了」，写清楚以免下一版重新论证：

| 项 | 说明 |
| --- | --- |
| TRON 现状 | 靠 TronGrid 的账户交易接口，公共端点即可用、无需 key |
| EVM 所需 | 节点 JSON-RPC **不提供**按账户查历史的接口——`eth_*` 里没有这个能力，`eth_getLogs` 只能按 topic 捞 ERC20 的 Transfer 事件，**捞不到原生币转账**（它不产生 log）。可用的路子有三条，**互不兼容**：① **Etherscan 兼容 API**——要 key，且免费档在收紧（2026-07 起单次返回上限由 10,000 降至 1,000）；② **Blockscout**——公共实例**无需 key**，key 只用于提高限额，但按链覆盖不齐；③ **服务商增强方法**（如 `alchemy_getAssetTransfers`）——**不需要额外 key**，走用户已配的 `httpEndpoint` 即可，但只有部分服务商提供 |
| 本版不做的原因 | 不是「必须有 key」，而是**没有标准接口**：三条路子的请求与响应结构完全不同，各要一个适配器；更棘手的是**能力取决于用户碰巧配了哪个端点**——同一条命令在不同机器上有无历史可查，这对确定性 CLI 是硬伤，得先定「运行时探测还是要求显式声明」。这是独立一块工作，塞进本版会稀释 EVM 转账主线 |
| 后续方案 | 新增 `explorer` 类 port，配置为 `networks.<id>.explorerUrl`（选哪个浏览器）+ **可选**的 `networks.<id>.explorerApiKey`（Etherscan 必填、Blockscout 可空）；沿用 §10.1「help 文案规范」的 Requires 规则 6，把「一个 Etherscan 兼容或 Blockscout 端点」写进该命令的 Requires 段（与 TRON 侧 `account history` 的 TronGrid Requires 对称） |

---

## 5. token 组

代币条目的 `kind` 增加 `erc20` 一档（既有 `trc20` / `trc10` 不变）。地址簿按 network id 分区存储，跨链天然隔离。

### 5.1 `token balance` —— 单个代币余额

> **本版改动**：走 ERC20 `balanceOf`；`--asset-id`（TRC10）在 EVM 网络下被拒。

**用法**

```
wallet-cli token balance (--contract <addr> | --asset-id <id>) [--account <ref>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 查询单个代币余额 |
| EVM 增量 | 走 ERC20 `balanceOf(address)`；`--asset-id`（TRC10）**降为 TRON 专属旗标**，help 中标 `(TRON only)`，在 EVM 网络下传入报 `invalid_option` |
| 错误 | `token_metadata_unavailable`、`token_not_in_book`、`family_mismatch` |

**示例与输出**

```bash
$ wallet-cli token balance --contract 0xA0b8...eB48 --network ethereum
Label    main
Name     USD Coin
Symbol   USDC
Balance  2500 USDC
```

```bash
$ wallet-cli token balance --contract 0xA0b8...eB48 --network ethereum -o json
{ "schema":"wallet-cli.result.v1","success":true,"command":"token.balance","data":{ "address":"0x7a3f...c19b","kind":"erc20","id":"0xA0b8...eB48","name":"USD Coin","symbol":"USDC","decimals":6,"balance":"2500000000" },"meta":{ "durationMs":210,"warnings":[] },"chain":{ "family":"evm","network":"eip155:1","chainId":"1" } }
```

**Help 输出**

> **`--contract` 与 `--asset-id` 的分层（§5 全组适用）**：`--contract` 留在**共用层**并降为不做格式检查的字符串——地址格式改由各族 binding 的 refine 验证；`--asset-id` **与那条「二选一」规则一起移进 TRON binding**。
>
> 理由是 **TRC10 是 TRON 专属概念，EVM 没有对应物**——那条「二选一」的 refine 在 EVM 上恒为错误规则；只标注 `(TRON only)` 是文字，规则本身还是会跑。
>
> **为何不让两族各自声明 `--contract`**：help 与 `--catalog` 合并同名的 family 字段时是**后盖前**，两族都声明会让说明文字只剩最后注册那族的版本。（验证本身不受影响——`z.toJSONSchema` 不序列化 refinement——受害的只有描述文字。）
>
> **TRON 用户看到的东西没变**：错误信息与 issue path 与先前完全相同（`invalid tron address`）。

> **相对现状**：描述去掉 `(--contract / --asset-id)`；**`--contract` 降为族中立的「token contract address」，不再带「二选一」叙述**（那条规则连同 `--asset-id` 一起移入 TRON binding，见下）；`--asset-id` 标 `(TRON only)`；`--network` 示例值；Examples 两族对称。

```text
$ wallet-cli token balance --help

Usage:
  wallet-cli token balance [options]

Show a single token balance

Requires:
  an account — defaults to active; override with --account <accountId|label> (or run `wallet-cli use <account>` to change the active account)

Options:
  --contract <string>  token contract address  [optional]
  --asset-id <string>  TRC10 numeric asset id; provide exactly one of --asset-id or --contract  [optional]  (TRON only)

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account set by use  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli token balance --contract TR7... --network nile
  wallet-cli token balance --contract 0xA0b8... --network sepolia
```

### 5.2 `token info` —— 代币元数据

> **本版改动**：走标准 ERC20 只读方法，输出字段与 TRON 侧完全一致。

**用法**

```
wallet-cli token info (--contract <addr> | --asset-id <id>) [--network <net>]
```

**概览**

| 项        | 内容                                                                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 功能 | 查询代币名称 / 符号 / 精度 |
| EVM 增量 | 走标准 ERC20 只读方法（`name` / `symbol` / `decimals` / `totalSupply`），json 与 TRC20 对称；**text 同样只显三行**，不新增输出字段 |
| 错误 | `token_metadata_unavailable`（目标地址的链上元数据读不到，含「不是可探测的 ERC20」这一情形） |

**示例与输出**

```bash
$ wallet-cli token info --contract 0xA0b8...eB48 --network ethereum
Name      USD Coin
Symbol    USDC
Decimals  6
```

> text 三行与 TRON 侧完全一致（实测现状即为 `Name` / `Symbol` / `Decimals`）。
>
> **`totalSupply` 的 text / json 不一致是既有缺陷，本版有意不动**：数据在查（4 次 constant call）、json 里有，唯独 text 不显示。它与 EVM 无关，两族一样，本版不趁改造顺手动它——修的时候要连带处理另一个同源问题：**单个字段调用失败会静默丢行**（`name()` 失败时 `Name` 整行消失且 `meta.warnings` 为空，「该代币没有此字段」与「这次没取到」无法区分）。两者一并修：补 text 行或从 json 去掉，以及把失败写进 warnings。
>
> **help 的描述已不再宣称 `totalSupply`**（2026-08-28 PM 拍板，按实作）：组 help 与命令 help 的一行描述均为 `Show token metadata`。这是对的——**help 不该替一个 text 里看不到的字段背书**；等上面那条缺陷修完，要不要把字段列举加回描述再议。

**Help 输出**

> **相对现状**：描述去掉 `(name/symbol/decimals/totalSupply)` 字段列举；**`--contract` 降为族中立、不带「二选一」叙述**；`--asset-id` 标 `(TRON only)`；`--network` 示例值；Examples 两族对称。

```text
$ wallet-cli token info --help

Usage:
  wallet-cli token info [options]

Show token metadata

Options:
  --contract <string>  token contract address  [optional]
  --asset-id <string>  TRC10 numeric asset id; provide exactly one of --asset-id or --contract  [optional]  (TRON only)

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli token info --contract TR7... --network nile
  wallet-cli token info --contract 0xA0b8... --network sepolia
```

### 5.3 `token add` —— 加入地址簿

> **本版改动**：探测走 ERC20 只读调用，**兼容 bytes32 元数据**；`kind` 记为 `erc20`。

**用法**

```
wallet-cli token add (--contract <addr> | --asset-id <id>) [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 把代币加入当前网络的地址簿，自动探测符号 / 精度 / 名称 |
| EVM 增量 | 探测走 ERC20 只读调用；`kind` 记为 `erc20` |
| 错误 | `token_metadata_unavailable`、`token_already_listed` |

> **探测要兼容 bytes32 元数据**：ERC20 定稿前的老代币（MKR 等）把 `name()` / `symbol()` 返回成 `bytes32` 而非 `string`，按 string 解码会失败。业内库（ethers / web3）均做双解码回退，我方同样：先按 `string` 解，失败再按 `bytes32` 解并去除尾部零字节；两者都失败才报 `token_metadata_unavailable`。`decimals()` 缺失时不猜默认值，直接报 `token_metadata_unavailable`——猜错精度会让后续每一笔转账金额都错。

**示例与输出**

```bash
$ wallet-cli token add --contract 0xA0b8...eB48 --network ethereum
✅ Added to token book
  Name      USD Coin
  Symbol    USDC
  Decimals  6
```

**Help 输出**

> **相对现状**：描述改写为「加入所选网络的地址簿」；**`--contract` 降为族中立、不带「二选一」叙述**；`--asset-id` 标 `(TRON only)`；`--network` 示例值；Examples 两族对称。

```text
$ wallet-cli token add --help

Usage:
  wallet-cli token add [options]

Add a token to the address book of the selected network, fetching its name,
symbol and decimals from the contract

Requires:
  an account — defaults to active; override with --account <accountId|label> (or run `wallet-cli use <account>` to change the active account)

Options:
  --contract <string>  token contract address  [optional]
  --asset-id <string>  TRC10 numeric asset id; provide exactly one of --asset-id or --contract  [optional]  (TRON only)

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account set by use  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli token add --contract TR7... --network nile
  wallet-cli token add --contract 0xA0b8... --network sepolia
```

### 5.4 `token list` —— 列出地址簿

> **本版改动**：条目 `kind` 扩 `erc20`；分区方式沿用现状（按 network id），EVM 网络各自一本。

**用法**

```
wallet-cli token list [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 列出当前网络地址簿的全部条目（内置 + 用户自加） |
| EVM 增量 | 条目 `kind` 为 `erc20`；地址簿**按 network id 分区**（沿用现状），`eip155:1` 与 `eip155:56` 是两本，`tron:mainnet` 与 `tron:nile` 也是两本（分区键是**规范 id**，不是别名）——不按 family、不跨网络合并 |
| 错误 | `family_mismatch`（账户与网络 family 不符） |

**示例与输出**

```bash
$ wallet-cli token list --network ethereum
| Symbol | Name       | Source   | Contract / ID |
| ------ | ---------- | -------- | ------------- |
| USDT   | Tether USD | official | 0xdAC1...1ec7 |
| USDC   | USD Coin   | official | 0xA0b8...eB48 |
| MYTK   | My Token   | user     | 0x4f2a...9b03 |
```

> `official` 条目按规范 id 内置（`eip155:1` 填 USDT / USDC；测试网留空，同 `nile` 的处理），用户不可删除。

**Help 输出**

> **相对现状**：描述补「所选网络的」；`--network` 示例值；Examples 两族对称。

```text
$ wallet-cli token list --help

Usage:
  wallet-cli token list [options]

List the address book of the selected network (official + user entries)

Requires:
  an account — defaults to active; override with --account <accountId|label> (or run `wallet-cli use <account>` to change the active account)

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account set by use  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli token list --network nile
  wallet-cli token list --network sepolia
```

### 5.5 `token remove` —— 移出地址簿

> **本版改动**：无 EVM 特有行为，仅 `kind` 扩 `erc20`。

**用法**

```
wallet-cli token remove (--contract <addr> | --asset-id <id>) [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 移除用户自加的代币条目 |
| 错误 | `token_not_in_book`、`token_is_official`（内置条目不可删） |

**示例与输出**

```bash
$ wallet-cli token remove --contract 0x4f2a...9b03 --network ethereum
✅ Removed from token book
  Name    My Token
  Symbol  MYTK
```

**Help 输出**

> **相对现状**：描述补一句「内置条目不可删」；**`--contract` 降为族中立、不带「二选一」叙述**；`--asset-id` 标 `(TRON only)`；`--network` 示例值；Examples 两族对称。

```text
$ wallet-cli token remove --help

Usage:
  wallet-cli token remove [options]

Remove a user-added token from the address book. Official entries cannot be
removed.

Requires:
  an account — defaults to active; override with --account <accountId|label> (or run `wallet-cli use <account>` to change the active account)

Options:
  --contract <string>  token contract address  [optional]
  --asset-id <string>  TRC10 numeric asset id; provide exactly one of --asset-id or --contract  [optional]  (TRON only)

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account set by use  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli token remove --contract TR7... --network nile
  wallet-cli token remove --contract 0xA0b8... --network sepolia
```

---

## 6. tx 组

### 6.1 `tx send` —— 转账 ✍️🔒

> **本版改动**：新增 gas 四选项与 `--nonce`；回执含 `Nonce`；Fee 行改为 gas 构成。

**用法**

```
wallet-cli tx send --to <addr|contact> (--amount <n> | --raw-amount <n>) [--token <sym> | --contract <addr>]
                   [--gas-limit <n>] [--max-fee <gwei>] [--priority-fee <gwei>] [--nonce <n>]
                   [--dry-run | --sign-only | --build-only] [--wait]
                   [--account <ref>] [--network <net>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 转出原生币或 ERC20 代币 |
| EVM 增量 | gas 四项选项；回执含 `Nonce`；Fee 行为 gas 构成 |
| gas 模型 | **由链上偵测：`baseFeePerGas` 字段存在即 EIP-1559，即使值为零**；`NetworkDescriptor.feeModel: "legacy"` 为覆盖用逃生口。**不写 `meta.warnings`** |
| nonce | 默认取 `eth_getTransactionCount(address, "pending")` |
| 错误 | `insufficient_balance`、`execution_reverted`、`nonce_too_low`、`family_mismatch` |

**Options（EVM 增量；help 中全量列出并标 `(EVM only)`，在 TRON 网络下传入报 `invalid_option`）**

| Option | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--gas-limit <n>` | 否 | 链上估算值 | gas 上限；省略则取节点估算值，**不乘任何倍数**。估算失败时**不回退 21000**，见下 |
| `--max-fee <gwei>` | 否 | `base×2 + 建议 tip` | EIP-1559 maxFeePerGas。**低于当前 base fee 时在 `meta.warnings` 给出警告**（与 `--nonce` 同一先例：异常但仍可执行 → warnings，不是错误） |
| `--priority-fee <gwei>` | 否 | 节点建议值 | EIP-1559 maxPriorityFeePerGas |
| `--nonce <n>` | 否 | 链上 pending 值 | 显式指定 nonce；**大于链上 pending 值时交易会一直挂起**（nonce gap），此时在 `meta.warnings` 给出警告 |

#### 费率旗标：只接受 `gwei` 后缀

**`--max-fee 25` 与 `--max-fee 25gwei` 等价**（后缀大小写不敏感）；**`wei` / `ether` 等其他单位点名拒绝**，报 `invalid_value` 并说明本旗标读 gwei。两半分开看：

- **`gwei` 后缀收**——它命名的就是这个旗标本来的单位，不可能改变数值；拒收它只惩罚了从 `cast` 那行复制过来的人，换不到任何安全。
- **其他单位不收**——九个数量级的风险完全落在 `wei` 与 `ether`：`--max-fee 0.01ether` 与 `--max-fee 25` 差十亿倍，而打错的代价就是实付费用差十亿倍。**点名拒绝而不是默默改读**，让用户知道发生了什么。

#### gas 模型判定与费率推导

**判定规则：`baseFeePerGas` 字段存在即 EIP-1559，即使值为零。**

**零基准费仍是 1559**：BSC 的 base fee 恒为 `0x0`——存在但为零。把零当成「没有 1559」会误判整条链，并逼出第二条代码路径；而 1559 的算式在 base=0 时**本来就退化成** legacy 的语义，那条路径没有存在的必要。**侦测结果是事实，不是降级，所以不写 `meta.warnings`。**（`NetworkDescriptor.feeModel` 保留为逃生口：设 `"legacy"` 可强制覆盖，供「回报 baseFee 却拒收 type-2 交易」的链使用。）

**只给一半费率旗标时的推导**：

| 给了什么 | 推导 |
| --- | --- |
| 都不给 | `maxFee = base×2 + 建议 tip` |
| 只给 `--max-fee` | tip 取建议值并夹到 `≤ maxFee`；**夹住时发 `meta.warnings`** |
| 只给 `--priority-fee` | `maxFee = base×2 + 该值` |
| legacy 链上给任一个 | `invalid_option` 拒绝，**不默默忽略**（否则回报的内容与实际签出的不符） |

**两条 `meta.warnings`**（都产生「签得出来也送得出去、但不是用户以为的那样」的交易，而没有任何错误会报这件事）：

| 情况 | 为什么要警告 |
| --- | --- |
| 建议 tip 被夹到 `--max-fee` | 我们替用户改了他给的费率（节点会拒绝 tip > fee cap，所以必须夹），但他不会知道 |
| `--max-fee` 低于当前 base fee | 节点接受，交易就一直躺在那里，直到 base fee 跌下来为止 |

> **明确给了 `--priority-fee` 就不警告**——那是用户自己的决定，不是替他做的。

#### `--gas-limit` 省略时的估算

**默认就是估算值，不乘任何倍数。** 乘 1.2 会让 `--dry-run` 显示的最高成本失真，而那个数字的意义就是「真相」。估算真的太紧时，`--gas-limit` 就是明确的手动出口。

**估算失败不猜**：不回退 21000——那会签出一笔**注定失败**的 ERC-20 转账并报告一切正常。节点拒绝估算时说的话（余额不足、会 revert）比我们猜的数字有用得多。

**估算失败的错误码是节点侧的码，不是 `invalid_option`**：这个 catch 盖住的是节点侧的事实，连端点连不上、HTTP 503、超时都算在内。报 `invalid_option`（**exit 2 —— 「你的命令行有问题」**）会让「重试 exit 1、放弃 exit 2」的调用者对一次暂时性网络故障直接放弃。规则是——本来就有类型的错误**保留自己的码与 exit 类别**（`rpc_error` / `timeout` / …），只在信息后面接上 `--gas-limit` 这条出路；没有类型的异常转成 `rpc_error`（否则会在最上层被 redact 成 `internal_error`，把节点原话一起丢掉，而那句原话正是这个函数不猜的理由）。**破坏性后果，进 release note。**

**示例与输出**

```bash
$ wallet-cli tx send --to 0x91b2...4d0e --amount 0.25 --network sepolia --wait
# text 输出（沿用「动词摘要 + 字段独占一行」体例）
✅ Sent 0.25 ETH
  To      0x91b2...4d0e
  Nonce   42
  TxID    0x9c4e...81af
  Block   #11,204,113
  Fee     0.000441 ETH  (21,000 gas × 21.0 gwei)
  Status  success
```

> **Fee 行格式**：`Fee <数额> <符号>  (<gas used> gas × <effective price> gwei)`——TRON 侧 `Fee 1.1 TRX (285 bandwidth)` 的同构写法，**金额是纯数字、括号里放消耗构成**。

```bash
# ERC20 转账：gas 消耗显著高于原生转账
$ wallet-cli tx send --to 0x91b2...4d0e --amount 100 --token USDC --network ethereum --wait
✅ Sent 100 USDC
  To      0x91b2...4d0e
  Token   USDC (0xA0b8...eB48)
  Nonce   43
  TxID    0x2f7b...05dc
  Block   #25,118,904
  Fee     0.001209 ETH  (65,000 gas × 18.6 gwei)
  Status  success
```

```bash
$ wallet-cli tx send --to 0x91b2...4d0e --amount 0.25 --network sepolia --dry-run
⏳ Dry run tx send
  Fee  ≤ 0.00048 ETH  (21,000 gas × 22.9 gwei max)
  Tx   0x02f86e83aa...57352fc8
```

> **dry-run 回执固定 `Fee` + `Tx` 两行**（沿用现状），不因 EVM 增字段——nonce 要到回执阶段才看。估算与实际共用 `Fee` 这一个字段名，靠 **`≤`** 与 `max` 区分。
>
> **前缀是 `≤` 而不是 `~`**：`~` 的意思是「大约」——它同时允许实际值**高于**这个数字。而这个数字不是估计值，是**上限**（`gasLimit × 每单位 gas 的上限`），交易签出去之后实际费用不可能超过它。用 `~` 会让一个确定的保证读起来像一个可能失准的猜测，而 dry-run 存在的理由正是「我最多会花多少」。括号里保留 `max`：那修饰的是 gas **单价**——实际结算的单价通常低于它。
>
> **只有两处例外，且都是「不看就没法判断这笔该不该发」的信息**：`contract send` 在 `approve` 时多出 `Spender` / `Allowance`（§7.2），`contract deploy` 多出 `Address`（§7.3，由 sender + nonce 算出，不需上链）。除这两项外，任何命令都不得往 dry-run 加字段。

```bash
$ wallet-cli tx send --to 0x91b2...4d0e --amount 0.25 --network sepolia --wait -o json
{ "schema":"wallet-cli.result.v1","success":true,"command":"tx.send","data":{ "kind":"native","stage":"confirmed","txId":"0x9c4e...81af","to":"0x91b2...4d0e","rawAmount":"250000000000000000","nonce":42,"blockNumber":11204113,"confirmed":true,"failed":false,"feeWei":"441000000000000","gasUsed":21000,"effectiveGasPriceWei":"21000000000","maxFeePerGasWei":"22900000000","maxPriorityFeePerGasWei":"1500000000" },"meta":{ "durationMs":14820,"warnings":[] },"chain":{ "family":"evm","network":"eip155:11155111","chainId":"11155111" } }
```

> **`confirmed` 与 `failed` 是两个独立的布尔字段，不是一个状态旗标。** `status: "0x0"` 是「上链、付了 gas、但 revert」——合并成一个旗标，会让一笔 revert 的转账报告成成功。实付费用 `feeWei` 两种情况都回报：**revert 的交易不是免费的**。
>
> **交易 id 由我们签的内容导出，不是节点指派的**：签名策略回传 `{raw, hash}`，`hash` 是 `keccak256(签名后的字节)`。既有的 `authoritativeTxId` 刻意优先采用本地导出的 id，否则节点回报错误的哈希后，`--wait` 会去轮询别人的交易、再把别人的成功当成你的回执。用 `hash` 这个键让两族共用同一条路径、零分支。

**Help 输出**

> **相对现状**：改动最大：描述族中立并说明 `(TRON only)` / `(EVM only)` 标注含义；Requires 段改为**「只有签名的模式才需要主密码」**（`--dry-run` / `--build-only` 确实不需要）；`--to` / `--amount` / `--contract` 描述去 TRON 化；**新增 EVM 四项**（`--gas-limit` / `--max-fee` / `--priority-fee` / `--nonce`）；`--build-only` / `--permission-id` / `--expiration` 沿用现状；`--asset-id` / `--fee-limit` / `--permission-id` / `--expiration` 加 `(TRON only)` 标注；`--network` 示例值；Examples 两族对称。

```text
$ wallet-cli tx send --help

Usage:
  wallet-cli tx send [options]

Send the native coin or a token. Flags marked (TRON only) or (EVM only) are accepted
only on networks of that family; using one on the other family is rejected.

Requires:
  the master password only when the selected mode signs — pass --password-stdin then; other modes need no password
  an account — defaults to active; override with --account <accountId|label> (or run `wallet-cli use <account>` to change the active account)

Options:
  --to <string>             recipient address, or a contact name from the address book  [required]
  --amount <decimal>        amount in whole coins/tokens; mutually exclusive with --raw-amount  [optional]
  --raw-amount <string>     amount in the smallest unit (wei / sun / token base unit)  [optional]
  --token <string>          send this token instead of the native coin, by symbol  [optional]
  --contract <string>       token contract address; alternative to --token  [optional]
  --asset-id <string>       TRC10 numeric asset id; omit with --contract for the native coin  [optional]  (TRON only)
  --fee-limit <string>      maximum energy fee to burn, in SUN  [optional, default: 100000000]  (TRON only)
  --permission-id <number>  permission group to sign with, for multi-sig accounts  [optional]  (TRON only)
  --expiration <number>     transaction expiration window, in milliseconds  [optional]  (TRON only)
  --gas-limit <number>      gas cap; estimated from the chain when omitted  [optional]  (EVM only)
  --max-fee <gwei>          EIP-1559 max fee per gas; accepts a unit suffix (25 or 25gwei)  [optional]  (EVM only)
  --priority-fee <gwei>     EIP-1559 max priority fee per gas; accepts a unit suffix  [optional]  (EVM only)
  --nonce <number>          transaction nonce; taken from the chain (pending) when omitted  [optional]  (EVM only)
  --dry-run                 estimate only; do not sign or broadcast  [optional, default: false]
  --sign-only               sign and print the raw transaction; do not broadcast  [optional, default: false]
  --build-only              build an unsigned transaction; do not sign  [optional, default: false]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account set by use  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]
  --wait                     after broadcast, poll until the tx is confirmed/failed before returning; default returns the submitted txid without blocking  [optional, default: false]
  --wait-timeout <number>    --wait polling cap, in milliseconds; on timeout return the submitted receipt  [optional, default: config.waitTimeoutMs (built-in: 60000)]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tx send --to T... --amount 1 --network nile
  wallet-cli tx send --to 0x742d... --amount 1 --network sepolia
  wallet-cli tx send --to T... --token USDT --amount 5 --network nile
  wallet-cli tx send --to 0x742d... --token USDC --amount 5 --network sepolia
  wallet-cli tx send --to T... --asset-id 1002000 --raw-amount 1000000 --network nile
```

> help 一次列全两族的 flag，靠行尾 `(TRON only)` / `(EVM only)` 区分——它不随 `--network` 变化（横切约定）。

### 6.2 `tx sign` —— 签名离线交易 🔒

> **本版改动**：`--hex` / `--file` 除 TRON protobuf hex 外，也接受 EVM 的 RLP raw tx；新增 chain id 校验。输入形态沿用现状，不改名。

**用法**

```
wallet-cli tx sign (--hex <hex> | --file <path> | --transaction <json>) [--offline] [--out <path>]
                   [--account <ref>] [--network <net>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 对本 CLI 之外构造的交易签名，输出可广播的结果 |
| EVM 增量 | `--hex` / `--file` 的内容多一种可接受形态：**RLP 编码 raw tx**（1559 交易以 `0x02` 开头）。`--transaction <json>` 是 TRON 专属的兼容路径，不接 EVM |
| 校验 | 交易的 family 与网络一致；**EVM 侧另校验交易里携带的 EIP-155 chain id 与目标网络一致** |
| 错误 | `family_mismatch`（交易与网络不同族）、`chain_id_mismatch`（同族但不是同一条链）、`invalid_value` |

**示例与输出**

```bash
$ wallet-cli tx sign --hex 0x02f86e83aa36a72a... --network sepolia
✅ Signed send
  Address  0x7a3f...c19b
  TxID     0x9c4e...81af
  Raw tx   0x02f8b1...6f2a41
```

> **EVM 侧这一行是 `Raw tx`，不是 `Signature`**：签名已经嵌在 RLP 里，输出的是一整笔可直接广播的 typed transaction（`0x02…`），下一步原样贴给 `tx broadcast --hex`。TRON 侧的签名交易是 protobuf hex，字段名同样按 family 分派。**`0x` 前缀带在输出里**，与 `--hex` 的输入形式一致，复制即可用；长 hex 走 `--out` 写文件、再用 `--file` 接力。
>
> 贴入另一族的交易报 `family_mismatch`——EVM RLP 与 TRON protobuf hex 外观相近，误贴概率高，不落到通用的 `invalid_value`。
>
> **交易里携带的 chain id 必须与目标网络一致**：EIP-155 的 chainId 就编码在 RLP 里，签名前解出来与 `--network` 的 `chainId` 比对，不符报 `chain_id_mismatch`。这一条挡的是同族跨链——贴一笔 `chainId=1` 的主网交易、却选了 `sepolia`，`family_mismatch` 不会触发，而签出来的是一笔真实的主网交易。业内（`cast`、ethers）一律以交易自带的 chainId 为准并做校验。

**Help 输出**

> **相对现状**：描述改为一句人话的「必须是为所选网络构建的交易，否则签名前就拒绝」；**输入形态沿用现状**（`--hex` / `--file` / `--transaction` 三选一，`--offline` / `--out` 不变），仅给 `--hex` / `--file` 的说明加上 EVM 形态、`--transaction` 标 `(TRON only)`；`--network` 示例值；Examples 两族对称。

```text
$ wallet-cli tx sign --help

Usage:
  wallet-cli tx sign [options]

Sign a transaction that was built elsewhere and output the signed result;
broadcast it later with `tx broadcast`. The transaction must have been built for
the network you select — one built for another chain is rejected before it is
signed, so you cannot sign a mainnet transaction by mistake.

Requires:
  the master password — pass --password-stdin; this command never prompts
  an account — defaults to active; override with --account <accountId|label> (or run `wallet-cli use <account>` to change the active account)

Options:
  Exactly one of these — the transaction to sign:
  --hex <string>          transaction hex: protobuf hex for TRON, RLP for EVM
  --file <string>         file containing the transaction hex
  --transaction <string>  unsigned transaction JSON; compatibility path, never checked online  (TRON only)

  --offline               sign locally without contacting the node; only with --hex/--file  [optional, default: false]
  --out <string>          write the signed hex to a file instead of stdout  [optional]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account set by use  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tx sign --transaction '{"txID":"...","raw_data":{...},"raw_data_hex":"..."}'
  wallet-cli tx sign --file unsigned.hex --out signed.hex --network nile --password-stdin
  wallet-cli tx sign --file unsigned.hex --out signed.hex --network sepolia --password-stdin
  wallet-cli tx sign --file partially-signed.hex --offline --password-stdin
```

> **`tx sign` 拒收已签名的交易**：EVM 一笔交易只吃一个签名，重签会产出「换了签名的另一笔交易」——回一个 `invalid_transaction` 比默默产出一个不同的东西诚实。
>
> **`--transaction` / `--tx-stdin` 是 TRON 专属路径**，在 EVM 网络上明确拒绝而非静默忽略：`--transaction` 报「本命令的 tron 选项」，把 payload 灌进 `--tx-stdin` 也由「静默忽略」变成明确拒绝。

### 6.3 `tx broadcast` —— 广播已签名交易 ✍️

> **本版改动**：走 `eth_sendRawTransaction`；`--hex` / `--file` 多接受 RLP raw tx，新增 chain id 校验。输入形态沿用现状，不改名。

**用法**

```
wallet-cli tx broadcast (--hex <hex> | --file <path> | --transaction <json> | --tx-stdin)
                        [--dry-run] [--wait] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 广播已签名交易 |
| EVM 增量 | 走 `eth_sendRawTransaction`；`--hex` / `--file` 的内容多一种可接受形态：RLP raw tx。`--transaction` / `--tx-stdin`（JSON）是 TRON 专属 |
| 校验 | 同 §6.2：family 一致 + **EIP-155 chain id 与目标网络一致**，两道都在发出请求前做 |
| `--dry-run` | **本版新增**，两族语义不同（见下）；`--dry-run --wait` 报 `invalid_option`（与 TRON 一致） |
| 错误 | `family_mismatch`、`chain_id_mismatch`、`nonce_too_low`、`insufficient_balance`、`rpc_error`，以及下列**广播拒绝码** |

#### 广播的接受判断是白名单

**只有 32 字节哈希算成功，其余一律拒绝。** 这直接沿用 TRON 侧的教训：先前 `res.result === false` 的黑名单判断从未触发，因为被拒绝的回应根本没有 `result` 字段——结果**每一笔被拒交易都被报成 submitted**。

**例外：`already known` 判为成功**——交易已在 mempool，用户的意图已达成，重跑同一个指令不该把既成事实报成失败（回应带 `alreadyKnown: true`）。

节点的拒绝信息经映射表转成**稳定的错误码**——`nonce_too_high` / `replacement_underpriced` / `gas_too_low` / `fee_too_low` / `gas_limit_exceeded`；认不出来的才保留节点原话于 `transaction_rejected`。没有这组码，调用者只能比对节点的英文句子，而各家客户端的措辞不同。

#### `--dry-run`（本版新增）

「这笔已签名的交易送得出去吗」是一个**在送出去之前**该能问的问题，而 TRON 侧早就能问（多签门槛是否凑齐）。EVM 没有多签，但有三件事会挡下一笔已签名的交易：链不对、nonce 用过了、余额不够——所以做的是同一件事的 EVM 版本。

| family | 检查项 |
| --- | --- |
| TRON | 签名、门槛、过期、动态多签费 |
| EVM | 回报 `checks` 四项：`signature`（回推签名者）、`chainId`、`nonce`（太低直接失败；有 gap 给警告）、`balance`（不足直接失败） |

**节点读取是 best-effort**：端点不可达时把 `nonce` / `balance` 两项降级为 `skipped` 并发 warning，而**不是**让命令失败——跑不到节点的 dry run 仍比没有 dry run 有价值，而报「不能广播」会是一个这段代码**并未建立**的宣称。

**示例与输出**

```bash
$ wallet-cli tx broadcast --hex 0x02f8b183aa36a72a... --network sepolia --wait
✅ Broadcast
  TxID    0x9c4e...81af
  Block   #11,204,113
  Fee     0.000441 ETH  (21,000 gas × 21.0 gwei)
  Status  success
```

**Help 输出**

> **相对现状**：描述改为一句人话的「必须是为所选网络构建的交易，否则发送前就拒绝」；**输入形态沿用现状**（`--hex` / `--file` / `--transaction` / `--tx-stdin` 四选一），仅给 `--hex` / `--file` 的说明加上 EVM 形态、JSON 两项标 `(TRON only)`；**新增 `--dry-run`**；`--network` 示例值；Examples 两族对称。
>
> ⚠️ **实作的 `--dry-run` 描述目前只写了 TRON 语义**（`validate signatures, threshold, expiration, and dynamic multi-sign fee`），未涵盖 EVM 的四项 `checks`——该文案需补，属 help 文案层待办。

```text
$ wallet-cli tx broadcast --help

Usage:
  wallet-cli tx broadcast [options]

Broadcast an already-signed transaction. It must have been built for the network
you select — one built for another chain is rejected before it is sent.

Options:
  Exactly one of these — the signed transaction to broadcast:
  --hex <string>          signed transaction hex: protobuf hex for TRON, RLP for EVM
  --file <string>         file containing the signed transaction hex
  --transaction <string>  signed transaction JSON  (TRON only)
  --tx-stdin              read the signed transaction JSON from stdin (fd 0)  (TRON only)

  --dry-run               validate signatures, threshold, expiration, and dynamic multi-sign fee without broadcasting  [optional, default: false]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]
  --wait                     after broadcast, poll until the tx is confirmed/failed before returning; default returns the submitted txid without blocking  [optional, default: false]
  --wait-timeout <number>    --wait polling cap, in milliseconds; on timeout return the submitted receipt  [optional, default: config.waitTimeoutMs (built-in: 60000)]

Examples:
  wallet-cli tx broadcast --file signed.hex --network nile
  wallet-cli tx broadcast --file signed.hex --network sepolia
  wallet-cli tx broadcast --tx-stdin < signed.json --network nile
```

### 6.4 `tx status` —— 交易状态

> **本版改动**：收到 receipt 即判终态；四态枚举与 TRON 侧一致，不新增状态词；新增 `Confirmations` 行（两族同时生效）。

**用法**

```
wallet-cli tx status --txid <0x…> [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 查询交易确认状态 |
| EVM 增量 | 收到 receipt 即判定终态：`status=1` → confirmed、`status=0` → failed；无 receipt → pending；查不到 → not_found |
| 状态枚举 | 与 TRON 侧同为四态，不新增状态词 |
| 新增字段 | `Confirmations`（head block − 该交易所在区块），confirmed 时才出现；两族同时生效，非 EVM 专属。`--wait` 只等到 receipt，等几个确认由用户读这个数自己判断（§6.5） |
| 错误 | `rpc_error`（含端点限流 429）——**查不到交易不是错误**，是 `not_found` 这个状态，退出码仍为 0 |
| `not_found` 的警告 | **该状态一律附一条 `meta.warnings`**：公开节点常剪枝，这可能表示节点没有记录，而非交易不存在；建议改用归档节点 |

> **为什么 `not_found` 必须带警告**：它是这条命令**唯一可能说错过去**的答案。一笔真的上链过的交易，在一个剪枝过的公开端点上一样回 null——而一句光秃秃的「not found」会让读者得出「它从没发生过」的结论。
>
> 实作上并用 `eth_getTransactionByHash` 与 `eth_getTransactionReceipt` 才能分辨「在 mempool」与「从不存在」——收据对两者都回 null。与 TRON 并用 `getTransactionById` 的模式相同。

**示例与输出**

```bash
$ wallet-cli tx status --txid 0x9c4e...81af --network sepolia
TxID           0x9c4e...81af
Status         confirmed ✅
Block          #11,204,113
Confirmations  36
```

```bash
$ wallet-cli tx status --txid 0x9c4e...81af --network sepolia -o json
{ "schema":"wallet-cli.result.v1","success":true,"command":"tx.status","data":{ "txid":"0x9c4e...81af","state":"confirmed","blockNumber":11204113,"confirmations":36 },"meta":{ "durationMs":190,"warnings":[] },"chain":{ "family":"evm","network":"eip155:11155111","chainId":"11155111" } }
```

**Help 输出**

> **相对现状**：`--txid` 描述去掉 `TRON`；`--network` 示例值；Examples 两族对称。

```text
$ wallet-cli tx status --help

Usage:
  wallet-cli tx status [options]

Show confirmation status of a transaction

Options:
  --txid <string>  transaction id/hash  [required]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli tx status --txid abc123 --network nile
  wallet-cli tx status --txid 0x9c4e... --network sepolia
```

### 6.5 `tx info` —— 交易详情

> **本版改动**：新增 `Confirmations` 行；Fee 行为 gas 构成，无 TRON 的资源分项。

**用法**

```
wallet-cli tx info --txid <0x…> [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 交易详情与回执 |
| EVM 增量 | 增 `Confirmations` 行；Fee 行为 gas 构成；无 TRON 的资源分项 |
| 查不到 txid | 与 `tx status` 不同——`tx info` 要给的是**详情**，无详情可给时报 `not_found`（退出码 1），不返回空壳。想区分「尚未上链」与「不存在」用 `tx status` |
| 错误 | `not_found`（该 txid 无交易详情）、`rpc_error`（含端点限流 429） |

**示例与输出**

```bash
$ wallet-cli tx info --txid 0x9c4e...81af --network sepolia
TxID           0x9c4e...81af
Type           transfer
From           0x7a3f...c19b
To             0x91b2...4d0e
Amount         0.25 ETH
Nonce          42
Block          #11,204,113
Block time     2026-08-06 09:14:32 UTC
Confirmations  36
Fee            0.000441 ETH  (21,000 gas × 21.0 gwei)
Status         success
```

```bash
$ wallet-cli tx info --txid 0x9c4e...81af --network sepolia -o json
{ "schema":"wallet-cli.result.v1","success":true,"command":"tx.info","data":{ "txid":"0x9c4e...81af","type":"transfer","from":"0x7a3f...c19b","to":"0x91b2...4d0e","rawAmount":"250000000000000000","nonce":42,"blockNumber":11204113,"blockTime":1786007672,"confirmations":36,"feeWei":"441000000000000","gasUsed":21000,"effectiveGasPriceWei":"21000000000","status":"success" },"meta":{ "durationMs":240,"warnings":[] },"chain":{ "family":"evm","network":"eip155:11155111","chainId":"11155111" } }
```

> `blockTime` 是 Unix 秒（与 `chain node` 的 `headBlock.timestamp` 同口径），text 才格式化为 `YYYY-MM-DD HH:MM:SS UTC`；费用三项（`feeWei` / `gasUsed` / `effectiveGasPriceWei`）与 `tx send` 回执同名同义，text 的 Fee 行由它们合成。

#### json 另带两个透传的原始对象

上面十三个扁平键**都在**，另外多带 **`transaction` 与 `receipt`** 两个对象，**节点原话全带**。

`tx info` 是**排查用**的命令，而我们挑出来的十几个字段不可能涵盖每一次排查需要的东西——access list、logs、`v/r/s`、`type` 的原始值、`maxFeePerGas`……透传让用户不必为了一个字段改用 `cast`；扁平键则让常见的九成不必自己从原始对象里挖。两者不互斥，代价只是 payload 大一些。

> **TRON 侧早就这么做**——`tx info` 一直带 `transaction` 与 `info` 两个原始对象。EVM 沿用同一个形状，而不是自创一个。

#### `type` 的取值（本版定义为三个）

| 值 | 含义 |
| --- | --- |
| `transfer` | 原生转账，**或解得出的 ERC-20 `transfer`** |
| `contract-creation` | `to` 为 null |
| `contract-call` | 其余 |

**三个取值刻意粗**：再细就得去读 calldata 的方法名，而那正是下面决定不做的事。`contract-creation` 不是猜的——`to` 为 null 就是它成为部署的定义。

#### calldata：只解 ERC-20 `transfer`，其余照实回报

**只解 `transfer(address,uint256)` 这一个选择器**，输出对齐 TRON 对 TRC20 的既有字段（`contract` + `symbol` + 以该代币 decimals 换算的 `amount`）；代币 metadata 读不到时退回 base unit 数量。**其余 calldata 一律不解。**

**为什么必须解这一个**：一笔 ERC-20 转账的原始交易里，`to` 是**合约**、`value` 是 **0**，真正的收款人与金额在 calldata。照实回报等于**指错收款人**——而这正是 TRON 侧对 TRC20 早已避免的事。

**为什么只解这一个**：猜测未知调用的语义，等于发明签名没有承载的意义。`transfer` 之所以例外，是因为它的形状是 ERC-20 标准的一部分，不是猜的。

> **与 `contract send` 的 `approve` 回执（§7.2）不冲突**：那里**没有在解码**——调用者自己打了 `--method "approve(address,uint256)"` 与参数，意义是他说出来的。这里面对的是一串没人交代过形状的 calldata。**同一条界线的两侧。**

> **`Status` 一律小写**：`tx info` 现状输出大写 `SUCCESS`，而 `tx status`（§6.4）与各写命令回执给的是小写 `success` / `confirmed`。同一个字段名在同一 CLI 里出现两种大小写，agent 侧要写两套匹配。本版一并收敛为小写，TRON 侧同步。

> `--wait` 只等到 receipt，不额外等 N 个确认——等多少个是场景决定，交由用户读 `Confirmations` 自行判断。重组风险的静态说明进 help，不进输出。`--wait` 超时的语义见 §6.1。

**Help 输出**

> **相对现状**：`--txid` 描述去掉 `TRON`；`--network` 示例值；Examples 两族对称。

```text
$ wallet-cli tx info --help

Usage:
  wallet-cli tx info [options]

Show full transaction detail + receipt

Options:
  --txid <string>  transaction id/hash  [required]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli tx info --txid abc123 --network nile
  wallet-cli tx info --txid 0x9c4e... --network sepolia
```

---

## 7. contract 组

既有实现显式传函数签名与参数，**不读链上 ABI**，EVM 侧直接复用。

### 7.1 `contract call` —— 只读调用

> **本版改动**：走 `eth_call`；**不依赖链上 ABI**，函数签名与参数类型显式传。

**用法**

```
wallet-cli contract call --contract <0x…> --method <sig> [--params <json>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 只读调用（不上链、不花费） |
| EVM 增量 | 走 `eth_call`；合约地址收 `0x…` |
| 错误 | `execution_reverted`、`invalid_address`、`invalid_value` |

**示例与输出**

```bash
$ wallet-cli contract call --contract 0xA0b8...eB48 --method "balanceOf(address)" \
    --params '[{"type":"address","value":"0x7a3f...c19b"}]' --network sepolia
Method  balanceOf(address)
Result  0x00000000000000000000000000000000000000000000000000000000950f9ac0  (raw)
```

> **`Result` 是原始 hex，不解码**，渲染层在值后标 `(raw)`。
>
> **为什么不解码**：`--method "balanceOf(address)"` 只声明**入参**类型，**不带返回类型**——没有 ABI 就无从解码。要解就得猜，而猜错的方式很多：`uint256` 与 `int256`、`address` 与 `bytes20`、多返回值的边界。TRON 侧现状就是回原始 hex，**两族一致而不是各自为政**。要解码就得先有一个声明返回类型的旗标（`--returns` 之类），而本版不提供那个旗标，所以也不解码。
>
> **没有 `Contract` 列**：合约地址是命令行**刚敲过的输入**，回显它不增加信息（与 dry-run 不放 `Contract` 是同一个理由）。text 只有 `Method` / `Result` 两行。

**Help 输出**

> **相对现状**：描述去掉 `triggerConstantContract`（§10.1 规则 3）并说明不查 ABI；`--contract` 去 TRON 化；`--network` 示例值；Examples 两族对称。

```text
$ wallet-cli contract call --help

Usage:
  wallet-cli contract call [options]

Read-only contract call. The function signature and parameter types are supplied
explicitly; no ABI lookup is performed.

Options:
  --contract <string>  contract address  [required]
  --method <string>    function signature, e.g. balanceOf(address)  [required]
  --params <string>    JSON array of ABI parameters as {type,value}; omit to pass no parameters  [optional]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli contract call --contract TR7... --method "balanceOf(address)" --params '[{"type":"address","value":"T..."}]' --network nile
  wallet-cli contract call --contract 0xA0b8... --method "balanceOf(address)" --params '[{"type":"address","value":"0x742d..."}]' --network sepolia
```

### 7.2 `contract send` —— 状态变更调用 ✍️🔒

> **本版改动**：gas 选项同 `tx send`；**`approve` 特例显示授权额度**，无限授权标 `unlimited`——**该特例本版起两族通用，不再是 EVM 增量**。

**用法**

```
wallet-cli contract send --contract <addr> --method <sig> [--params <json>] [--value <n>]
                         [--gas-limit <n>] [--max-fee <gwei>] [--priority-fee <gwei>] [--nonce <n>]
                         [--dry-run | --sign-only | --build-only] [--wait]
                         [--account <ref>] [--network <net>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 发起会改变链上状态的合约调用 |
| EVM 增量 | gas 选项同 §6.1 |
| `--value` 取代 `--call-value-sun` | 随调用附带的原生币改用**族中立、人话单位**的 `--value`（TRX / ETH）。现状的 `--call-value-sun`（最小单位 SUN）名字里带 TRON 单位，EVM 上不成立，**本版保留为 TRON 兼容别名并标弃用、下一版删**；两者同时传报 `invalid_option` |
| `approve` 特例 | **两族通用**。`--method` 为 `approve(address,uint256)` 时，回执与 `--dry-run` 额外给 `Spender` / `Allowance` 两行；额度按代币 decimals 换算为人话单位，`2^256-1` 显示为 `unlimited` |

> **`approve` 回执两族都有，不是 EVM 增量。** TRC20 与 ERC-20 **共用这个方法、共用这个危险、也共用那个没人读得懂的参数**——一个 `uint256`，按代币 decimals 缩放，最大值 78 位数。而 approve 是这两条链上最常让人损失资金的一次签名。只在 EVM 上把它翻译成人话，等于认定 TRON 用户比较不需要看懂自己批准了多少。
>
> 解码逻辑为两族共用，差别只有两处：**spender 地址怎么写**（TRON 的 41-hex 转 base58，故 TRON 侧示例用 base58）、**decimals 从哪来**（`getTokenInfo` vs `getErc20Metadata`）。
>
> **这不违反 §6.5「不猜 calldata」那条界线**：那里拒绝的是**猜别人交易的意义**；这里调用者自己打了 `--method "approve(address,uint256)"` 与参数，**意义是他说出来的**，我们只做单位换算。同一条界线的两侧。
>
> **`unlimited` 在读 metadata 之前就短路**：78 位数的形式只告诉读者「这个数字很长」，再多的 decimals 也救不了它，没有必要为此向合约发一次请求。decimals 读不到则退回原始整数——我们标不出单位，不影响这笔授权本身。
| 差异 | TRON 的 `--fee-limit`（能量模型）对应 EVM 的 `--gas-limit`；两者在 help 中并列、各标 `(TRON only)` / `(EVM only)`，用错族报 `invalid_option` |
| 错误 | `execution_reverted`（含节点返回的 revert reason）、`insufficient_balance`、`nonce_too_low` |

**示例与输出**

```bash
$ wallet-cli contract send --contract 0xA0b8...eB48 --method "approve(address,uint256)" \
    --params '[{"type":"address","value":"0x4f2a...9b03"},{"type":"uint256","value":"1000000"}]' \
    --network ethereum --wait
✅ Called approve
  Contract   0xA0b8...eB48
  Spender    0x4f2a...9b03
  Allowance  1 USDC
  Nonce      44
  TxID       0x81de...92c7
  Block      #25,118,940
  Fee        0.000892 ETH  (46,200 gas × 19.3 gwei)
  Status     success
```

```bash
# 无限授权：额度显示为 unlimited，不显示那串 78 位数字
$ wallet-cli contract send --contract 0xA0b8...eB48 --method "approve(address,uint256)" \
    --params '[{"type":"address","value":"0x4f2a...9b03"},{"type":"uint256","value":"115792089237316195423570985008687907853269984665640564039457584007913129639935"}]' \
    --network ethereum --dry-run
⏳ Dry run contract send
  Spender    0x4f2a...9b03
  Allowance  unlimited
  Fee        ≤ 0.00091 ETH  (46,200 gas × 19.7 gwei max)
  Tx         0x02f8b183aa...4c91e7a0
```

> dry-run 沿用 `Fee` + `Tx` 两行，只为 `approve` 多出 `Spender` / `Allowance`——**`Contract` 与 `Nonce` 不进 dry-run**：合约地址是命令行刚敲过的输入，nonce 到回执阶段再看不迟（§6.1）。`Allowance` 必须进，因为它是命令行传的那串 `uint256` 按 decimals 换算后的结果，用户没法心算，而这正是 dry-run 要替他确认的东西。

**Help 输出**

> **相对现状**：描述改写，补 `(TRON only)` / `(EVM only)` 标注含义与 `approve` 特例说明；Requires 冠词统一；**新增族中立的 `--value`（人话单位），`--call-value-sun` 保留为标了弃用的 TRON 别名**；新增 EVM 四项；`--build-only` / `--permission-id` 沿用现状；`--fee-limit` 等加 `(TRON only)` 标注；`--network` 示例值；Examples 两族对称。

```text
$ wallet-cli contract send --help

Usage:
  wallet-cli contract send [options]

State-changing contract call. Flags marked (TRON only) or (EVM only) are accepted only
on networks of that family; using one on the other family is rejected. For
approve(address,uint256) the receipt also reports the spender and the allowance in
human units; an allowance of 2^256-1 is shown as unlimited.

Requires:
  the master password only when the selected mode signs — pass --password-stdin then; other modes need no password
  an account — defaults to active; override with --account <accountId|label> (or run `wallet-cli use <account>` to change the active account)

Options:
  --contract <string>        contract address  [required]
  --method <string>          function signature, e.g. transfer(address,uint256)  [required]
  --params <string>          JSON array of ABI parameters as {type,value}  [optional]
  --value <decimal>          native coin sent with the call, in whole coins  [optional, default: 0]
  --call-value-sun <string>  deprecated alias for --value, in SUN; removed next release  [optional]  (TRON only)
  --fee-limit <string>       maximum energy fee to burn, in SUN  [optional, default: 100000000]  (TRON only)
  --permission-id <number>   permission group to sign with, for multi-sig accounts  [optional]  (TRON only)
  --gas-limit <number>       gas cap; estimated from the chain when omitted  [optional]  (EVM only)
  --max-fee <gwei>           EIP-1559 max fee per gas; accepts a unit suffix (25 or 25gwei)  [optional]  (EVM only)
  --priority-fee <gwei>      EIP-1559 max priority fee per gas; accepts a unit suffix  [optional]  (EVM only)
  --nonce <number>           transaction nonce; taken from the chain (pending) when omitted  [optional]  (EVM only)
  --dry-run                  estimate only; do not sign or broadcast  [optional, default: false]
  --sign-only                sign and print the raw transaction; do not broadcast  [optional, default: false]
  --build-only               build an unsigned transaction; do not sign  [optional, default: false]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account set by use  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]
  --wait                     after broadcast, poll until the tx is confirmed/failed before returning; default returns the submitted txid without blocking  [optional, default: false]
  --wait-timeout <number>    --wait polling cap, in milliseconds; on timeout return the submitted receipt  [optional, default: config.waitTimeoutMs (built-in: 60000)]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli contract send --contract TR7... --method "transfer(address,uint256)" --params '[...]' --network nile
  wallet-cli contract send --contract 0xA0b8... --method "transfer(address,uint256)" --params '[...]' --network sepolia
```

### 7.3 `contract deploy` —— 部署合约 ✍️🔒

> **本版改动**：EVM 侧合约地址由 sender + nonce 确定性算出，构建期即给出，不必等上链；**构造参数改为三来源，旗标改名且不保留旧别名**。

**用法**

```
wallet-cli contract deploy (--artifact <path> | --code <hex> | --code-file <path>)
                           [--constructor-args <json> | --constructor-params <json>]
                           [--constructor-signature <sig>] [--abi <json>]
                           [--gas-limit <n>] [--max-fee <gwei>] [--priority-fee <gwei>] [--nonce <n>]
                           [--fee-limit <sun>] [--permission-id <n>] [--expiration <ms>]
                           [--dry-run | --sign-only | --build-only] [--wait]
                           [--account <ref>] [--network <net>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 部署合约字节码，回执给出新合约地址 |
| EVM 增量 | 地址由 `keccak(rlp([sender, nonce]))` 取后 20 字节**确定性算出**，构建期即可给出、不必等上链 |
| 差异 | TRON 的 `--fee-limit`（能量）对应 EVM 的 `--gas-limit`，两者在 help 中并列、各标 family；**EVM 不需要 ABI，类型由构造函数参数的来源提供** |
| 错误 | `execution_reverted`（构造函数回滚）、`insufficient_balance`、`invalid_value`（字节码非法 hex / 在 TRON 上传 `--constructor-signature`）、`invalid_option`（在 EVM 上传 `--permission-id` / `--expiration`） |

> **deploy 属第二档**：`contract call` / `send` 已把 ABI 参数编码与 gas 估算做完，deploy 的净增量只有「构造参数编码 + 地址推算 + 字节码输入通道」；EVM 是合约生态、部署是基本诉求（`forge create` / `cast send --create` 都是标配），TRON 侧 `contract deploy` 亦早已存在。
>
> `--code-file` 沿用 TRON 侧的既有理由：字节码常达上万字符，塞不进命令行。

#### 旗标改名（破坏性变更，不保留旧别名）

| 旧名 | 新名 | 备注 |
| --- | --- | --- |
| `--bytecode` | `--code` | 旧名**直接消失**，无别名 |
| `--params` | `--constructor-params` | 旧名**直接消失**，无别名 |
| `--abi` | `--abi` | **保留**，标 `(TRON only)`，`[required]` **unless `--artifact`** |

**不保留旧别名是明确的决定**：旧名字留着会让两套词汇并存，且 help 里必须同时出现两套；deploy 的调用量本身很低，脚本改一行的成本远小于长期双词汇。**破坏性后果进 release note。**

**另两项连带决定**：

- **deploy 不提供 `--call-value`**（用法行本来就没列）。提供一个实作会忽略的旗标，比不提供更糟——调用者会以为值生效了。
- **`--permission-id` / `--expiration` 移进 TRON binding**，因此在 EVM 上由「静默接受并忽略」变成 `invalid_option` / exit 2。

#### 构造函数参数的三种类型来源

> **设计原则：类型来自签名或编译器产物，永不来自值。**

`constructor(uint128)` 误写成 `uint256`，两族都会编码成功、部署出一个参数错误的合约——而**部署不可逆**。

| 来源 | 适用 | 说明 |
| --- | --- | --- |
| `--artifact <path>` | **两族** | 编译器产物（Foundry / Hardhat / sunhat / TronBox），同时含 `abi` 与 `bytecode`。**首选** |
| `--constructor-signature <sig>` | **仅 EVM** | 只有 bytecode 时用签名字符串，如 `constructor(uint256,string)`。在 TRON 上**明确拒绝**（`invalid_value`，信息说明 TronWeb 需要完整 ABI），不静默忽略 |
| `--abi <json>` | **仅 TRON** | 完整 ABI JSON。`--artifact` 已供 ABI 时可省 |

参数值本身走 `--constructor-args`（**裸值 JSON 数组**，如 `["18","MyToken"]`）；`--constructor-params`（`{type,value}` 形式）**保留可用**，help 中降为次选。

**为什么 TRON 必须有 ABI**：TronWeb 的 `createSmartContract` 靠 ABI 推导 constructor 类型，`parameters` 只吃裸值；ethers 不需要 ABI。要让 `--abi` 在 TRON 上也可省略，唯一的做法是从 `{type,value}` 的内嵌类型**合成**一份 ABI 喂给 TronWeb——而合成出来的 ABI **没有任何东西可以校验**：用户把类型打错时 TronWeb 会照着错的类型编码成功，事前无从发现。

**`--artifact` 是更强的来源，不是放宽**：`--abi` 因 `--artifact` 而变成「required unless `--artifact`」，看似放宽了上一段的要求，实则相反——上一段反对的是「从内嵌类型**合成**一份无法校验的 ABI」，而 `--artifact` 提供的是**编译器输出的真 ABI**，比人手贴上的更可信（连手写 ABI 的打字错误都排除了）。等于换一个更强的来源满足同一个要求。

**业界形状**：`forge create --constructor-args`（类型来自编译产物）、`cast send --create <CODE> <SIG> <ARGS>`（只有 bytecode 时用签名字符串）。**没有任何主流工具要求用户写 `[{"type":"uint256","value":"42"}]`**——那是 TronWeb `triggerSmartContract` 的内部 JSON 形状漏到了 CLI 表面。

**`--artifact` 对 TRON 用户收益最大**：`--abi` 必填逼他们自己从那份 JSON 里挖出动辄数 KB 的 ABI 贴到命令行，那是**转抄，不是输入**。Foundry / Hardhat / sunhat / TronBox 的产物都同时含 `abi` 与 `bytecode`，只有 bytecode 的包装差一层（Foundry 是 `{object}`，其余是字符串），两种都收。

> **实测**：五种输入形式产生的 calldata **逐字节相同**，且与 `cast abi-encode` 的输出一致（独立实现，非自我一致性检查）；Sepolia 与 Nile 各实际部署并回读成功，预测的 CREATE 地址与回执逐字符相同。

**示例与输出**

```bash
$ wallet-cli contract deploy --artifact ./out/Token.sol/Token.json \
    --constructor-args '["18","MyToken"]' --network sepolia --wait
✅ Contract deployed
  Address  0x5d71...a3f4
  Nonce    45
  TxID     0xb2c8...71fe
  Block    #11,204,301
  Fee      0.008408 ETH  (1,204,551 gas × 6.98 gwei)
  Status   success
```

```bash
$ wallet-cli contract deploy --artifact ./out/Token.sol/Token.json --network sepolia --wait -o json
{ "schema":"wallet-cli.result.v1","success":true,"command":"contract.deploy","data":{ "stage":"confirmed","contractAddress":"0x5d71...a3f4","txId":"0xb2c8...71fe","nonce":45,"blockNumber":11204301,"confirmed":true,"failed":false,"feeWei":"8407765980000000","gasUsed":1204551,"effectiveGasPriceWei":"6980000000" },"meta":{ "durationMs":16420,"warnings":[] },"chain":{ "family":"evm","network":"eip155:11155111","chainId":"11155111" } }
```

> `contractAddress` 在 `--dry-run` / `--sign-only` / submitted 三个阶段都给，值不变（由 sender + nonce 算出）；`stage` 随阶段取 `estimated` / `signed` / `submitted` / `confirmed`，与 `tx send` 同一枚举。

```bash
$ wallet-cli contract deploy --code-file ./Token.bin --network sepolia --dry-run
⏳ Dry run contract deploy
  Address  0x5d71...a3f4
  Fee      ≤ 0.008926 ETH  (1,204,551 gas × 7.41 gwei max)
  Tx       0x02f9049a83aa...b7c0e215
```

> `Address` 在 `--dry-run` / `--sign-only` 阶段同样给出——它只取决于发送方与 nonce，不需要上链。这与 TRON 侧「build 期确定性算出、submitted 就带」的处理一致；它是 dry-run 的两个例外之一（另一个是 `approve` 的额度，§7.2）。**但前提是 nonce 不变**：若该 nonce 被另一笔交易抢先占用，实际地址会不同，这句说明进 help、不进字段。
>
> 以上 `Address` / `TxID` / `Fee` 等示例值为**设计稿，未实测**（本节的实测结论见上文「实测」一段）。

**Help 输出**

> **相对现状**：描述改写，补 family 标注含义并说明地址在上链前即可给出；**`--bytecode` / `--params` 改名为 `--code` / `--code-file` / `--constructor-params`，不保留旧别名**；**新增 `--artifact` / `--constructor-args` / `--constructor-signature` 三个来源旗标**；`--abi` 保留、标 `(TRON only)`、`required unless --artifact`；`--fee-limit` 由 `[required]` 变 `[optional]` 并标 family；新增 EVM 四项；Requires 段改为「只有签名的模式才需要主密码」；Examples 两族对称，且首选形式用 `--artifact`。

```text
$ wallet-cli contract deploy --help

Usage:
  wallet-cli contract deploy [options]

Deploy contract creation bytecode and report the new contract's address.
Flags marked (TRON only) or (EVM only) are accepted only on networks of that family; using one on the other family is rejected.

Requires:
  the master password only when the selected mode signs — pass --password-stdin then; other modes need no password
  an account — defaults to active; override with --account <accountId|label> (or run `wallet-cli use <account>` to change the active account)

Options:
  --artifact <string>               path to a compiler artifact (Foundry, Hardhat/sunhat, TronBox) holding both the bytecode and the ABI; the preferred source, because the constructor's types then come from the compiler  [optional]
  --code <string>                   contract creation bytecode, hex-encoded; provide exactly one of --artifact, --code or --code-file  [optional]
  --code-file <string>              path to a file holding the creation bytecode; bytecode often exceeds the shell's argument limit  [optional]
  --constructor-signature <string>  the constructor's types when there is no ABI, e.g. "constructor(uint256,string)"; not needed with --artifact, and not accepted on TRON, which needs the full ABI  [optional]
  --constructor-args <string>       constructor arguments as a JSON array of bare values, e.g. ["18","MyToken"]; the types come from --artifact, --constructor-signature, or --abi on TRON  [optional]
  --constructor-params <string>     constructor arguments as a JSON array of {type,value} entries, e.g. [{"type":"uint8","value":"18"}]; prefer --constructor-args with --artifact  [optional]
  --dry-run                         build and estimate only, with no signature and no broadcast  [optional, default: false]
  --sign-only                       sign and output complete transaction hex without broadcasting  [optional, default: false]
  --build-only                      build an unsigned transaction without signing or broadcasting; mutually exclusive with --dry-run/--sign-only  [optional, default: false]
  --abi <string>                    contract ABI as a JSON array string; required unless --artifact supplies one  [optional]  (TRON only)
  --fee-limit <string>              maximum energy fee to burn, in SUN  [optional, default: 100000000]  (TRON only)
  --permission-id <number>          TRON permission group to sign with (0=owner, 1=witness, 2-9=active)  [optional, default: 0]  (TRON only)
  --expiration <number>             transaction expiration in ms, up to 86400000 (24h); only with --sign-only or --build-only; omitted = node default (~60s)  [optional]  (TRON only)
  --gas-limit <string>              gas units to authorise; defaults to the node's estimate, unpadded  [optional]  (EVM only)
  --max-fee <string>                maximum total fee per gas, in gwei — 25 or 25gwei (EIP-1559 only)  [optional]  (EVM only)
  --priority-fee <string>           tip per gas, in gwei — 25 or 25gwei (EIP-1559 only)  [optional]  (EVM only)
  --nonce <number>                  transaction nonce; defaults to the account's pending nonce  [optional]  (EVM only)

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account set by use  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]
  --wait                     after submitting, poll until the transaction is confirmed/failed before returning; default returns the submitted receipt without blocking  [optional, default: false]
  --wait-timeout <number>    --wait polling cap, in milliseconds; on timeout return the submitted receipt  [optional, default: config.waitTimeoutMs (built-in: 60000)]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli contract deploy --artifact ./build/contracts/Token.json --constructor-args '["18","MyToken"]' --network nile
  wallet-cli contract deploy --artifact ./out/Token.sol/Token.json --constructor-args '["18","MyToken"]' --network sepolia
  wallet-cli contract deploy --code-file ./Token.bin --constructor-signature 'constructor(uint8,string)' --constructor-args '["18","MyToken"]' --network sepolia
```

---

## 8. 签名组

两条命令的服务层已是 family 无关的，哈希算法在 signer 层按 family 分派。

### 8.1 `message sign` —— 签名任意消息 🔒

> **本版改动**：算法按 family 分派：EVM 用 EIP-191 前缀，TRON 用 TIP-191。

**用法**

```
wallet-cli message sign (--message <text> | --message-stdin) [--account <ref>] [--network <net>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 对任意消息签名 |
| 算法 | TRON = TIP-191（前缀 `\x19TRON Signed Message:\n`）；EVM = EIP-191（前缀 `\x19Ethereum Signed Message:\n`） |
| 输出契约 | 不变（地址、摘要、签名） |
| stdin 通道 | `--message-stdin` 与 `--password-stdin` **不能同时用**——一次运行只有一个 `*-stdin` 能占用 fd 0；用 `--message-stdin` 时主密码须走 TTY |

**示例与输出**

```bash
$ wallet-cli message sign --message "hello" --network sepolia
Address    0x7a3f...c19b
Digest     0x50b2...ce31
Signature  0x4c8f...1b1c
```

**Help 输出**

> **相对现状**：描述改写为按 family 说前缀、TRON 在前；Requires 冠词统一；`--message-stdin` 沿用现状；`--network` 示例值；Examples 两族对称。

```text
$ wallet-cli message sign --help

Usage:
  wallet-cli message sign [options]

Sign an arbitrary message. The prefix follows the selected network's family:
TIP-191 for TRON, EIP-191 for EVM.

Requires:
  the master password — pass --password-stdin; this command never prompts
  an account — defaults to active; override with --account <accountId|label> (or run `wallet-cli use <account>` to change the active account)

Options:
  --message <string>  message to sign; provide this OR --message-stdin  [optional]
  --message-stdin     read the message from stdin (fd 0)  [optional]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account set by use  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli message sign --message "hello" --network nile
  wallet-cli message sign --message "hello" --network sepolia
```

### 8.2 `typed-data sign` —— 签名结构化数据 🔒

> **本版改动**：EVM 用 EIP-712，TRON 用 TIP-712；输出契约与 flag 集合均不变。

**用法**

```
wallet-cli typed-data sign --typed-data <json> [--account <ref>] [--network <net>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 对结构化数据签名 |
| 算法 | TRON = TIP-712；EVM = EIP-712 |
| 错误 | `invalid_payload`（domain / types / primaryType 不完整） |

**示例与输出**

```bash
$ wallet-cli typed-data sign --typed-data '{"domain":{...},"types":{...},"message":{...}}' --network ethereum
Address       0x7a3f...c19b
Primary type  Permit
Digest        0xa71c...4e08
Signature     0x9d3b...77ea
```

**Help 输出**

> **相对现状**：描述由「讲输出」改为「讲动作」（§10.1 规则 1）；Requires 冠词统一；**flag 集合无变化**；`--network` 示例值；Examples 两族对称。

```text
$ wallet-cli typed-data sign --help

Usage:
  wallet-cli typed-data sign [options]

Sign an EIP-712 / TIP-712 typed-data payload

Requires:
  the master password — pass --password-stdin; this command never prompts
  an account — defaults to active; override with --account <accountId|label> (or run `wallet-cli use <account>` to change the active account)

Options:
  --typed-data <string>  EIP-712/TIP-712 JSON: {"domain":…,"types":…,"primaryType"?:…,"message":…}  [required]

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account set by use  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli typed-data sign --typed-data '{"domain":{...},"types":{...},"message":{...}}' --network nile
  wallet-cli typed-data sign --typed-data '{"domain":{...},"types":{...},"message":{...}}' --network sepolia
```

---

## 9. 链信息组

### 9.1 `block` —— 查询区块

> **本版改动**：走 `eth_getBlockByNumber`；**json 原样透传节点返回**，text 才是格式化层。

**用法**

```
wallet-cli block [<number>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 查询区块（省略号数则取最新） |
| EVM 增量 | 走 `eth_getBlockByNumber`；字段按 EVM 区块结构 |
| 错误 | `not_found`（指定号数的区块不存在）、`rpc_error`（含端点限流 429） |

**示例与输出**

```bash
$ wallet-cli block --network sepolia
Number        #11,204,149
Hash          0x6b2f...d40a
Parent hash   0x1e83...77bc
Time          2026-08-06 09:21:47 UTC
Transactions  142
Gas used      12,840,221 / 30,000,000
Base fee      18.4 gwei
```

```bash
$ wallet-cli block --network sepolia -o json
{ "schema":"wallet-cli.result.v1","success":true,"command":"block","data":{ "number":"0xaaf635","hash":"0x6b2f...d40a","parentHash":"0x1e83...77bc","timestamp":"0x6a74522b","gasUsed":"0xc3ed1d","gasLimit":"0x1c9c380","baseFeePerGas":"0x448b9b800","transactions":[ "0x9c4e...81af", "…共 142 项…" ] },"meta":{ "durationMs":310,"warnings":[] },"chain":{ "family":"evm","network":"eip155:11155111","chainId":"11155111" } }
```

> **注意 json 里全是 `0x` 十六进制字符串**——这正是「原样透传」的含义：`eth_getBlockByNumber` 的返回不做任何数值转换、字段不重命名、`transactions` 不裁剪。想要十进制与 UTC 时间读 text。这与 TRON 侧透传 protobuf JSON 是同一条规则，因此**本命令是全文唯一不遵守「json 给最小单位十进制整数字符串」（§1.4）的地方**：透传优先。

> **json 原样透传节点返回**：TRON 侧 `block` 的 json 就是链上 protobuf JSON 原样（`{block:{blockID, block_header:{…}, transactions:[…]}}`），不做字段重塑；EVM 侧同理给 `eth_getBlockByNumber` 的原始返回。text 才是我方格式化的那一层，两族各按自己的区块结构取字段。

**Help 输出**

> **相对现状**：描述补一句「json 为节点响应原样」；`--network` 示例值；Examples 两族对称。

```text
$ wallet-cli block --help

Usage:
  wallet-cli block [<number>] [options]

Get a block (latest if omitted). JSON output is the node's response verbatim.

Args:
  number  block number to fetch, in block height; omit to fetch the latest block

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli block
  wallet-cli block 12345 --network nile
  wallet-cli block 12345 --network sepolia
```

### 9.2 `chain node` —— 节点状态

> **本版改动**：EVM 新增 `Chain id` 与 `Syncing` 两行；**`Solid block` 与 `Peers` 两行照样出现**——EVM 的不可逆区块就是 `finalized`。

**用法**

```
wallet-cli chain node [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 显示所连节点的状态 |
| EVM 增量 | 新增 `Chain id` 与 `Syncing` 两行；`Solid block` 取 **finalized 区块**标签，`Peers` 取 `net_peerCount`；`p2pVersion` 在 EVM 恒为 `null` |
| 错误 | `rpc_error`（含端点限流 429）——端点不可达时这条命令本身就是探测手段，失败即结论 |

**示例与输出**

```bash
$ wallet-cli chain node --network tron:nile
Endpoint     nile.trongrid.io
Version      java-tron 4.8.2.1.PQ1_build1
Head block   #70,435,374  2026-08-27 09:39:33 (~8s ago — in sync)
Solid block  #70,435,358  (16 blocks behind head)
Peers        59 connected / 3 active
```

```bash
$ wallet-cli chain node --network sepolia
Endpoint     ethereum-sepolia-rpc.publicnode.com
Version      reth/v2.4.1-8eb2101/x86_64-unknown-linux-gnu
Chain id     11155111
Head block   #11,577,037  2026-08-27 09:39:36 (~9s ago — in sync)
Solid block  #11,576,965  (72 blocks behind head)
Syncing      no
Peers        33 connected / 33 active
```

> 以上两段均为实测输出。
>
> **EVM 有「不可逆区块」这个概念——合并之后就叫 `finalized`，与 TRON 的 solid block 是同一件事。** 文档此前写「EVM 无 solidified 区块」在事实上是错的：实测 Sepolia（落后 head 约 72 块）与 BSC（落后 2 块）皆回得出值。把它藏起来反而少给了一个真实且有用的数字。
>
> **`Peers` 取 `net_peerCount`，端点未暴露时显示 `—`**。`net_peerCount` 是标准 JSON-RPC 方法，但部分托管服务商禁用 `net_*` 命名空间。**为 EVM 破例改成「整行消失」会让同一条命令有两套规则**——`—` 正是这条命令**自己的既有惯例**（help 明写「端点未暴露的字段显示 `—`」）。
>
> 两族独有的字段：EVM 有 `Chain id`（EIP-155，签名要用，值得摆出来核对）与 `Syncing`，TRON 没有；`p2pVersion` 在 EVM 恒为 `null`。`Endpoint` 两族都只显主机名（§2.3）。

**Help 输出**

> **相对现状**：描述改写为按 family 说字段差异、TRON 在前（现状那句「端点未暴露的字段显示 —」并入 §9.2 正文）；`--network` 示例值；Examples 两族对称。

```text
$ wallet-cli chain node --help

Usage:
  wallet-cli chain node [options]

Show the connected node's status. Fields differ by family: TRON reports the
solidified block and peer counts, EVM reports the chain id and sync state.

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli chain node --network nile
  wallet-cli chain node --network sepolia
```

### 9.3 `chain prices` —— 当前交易单价

> **本版改动**：EVM 侧给 base fee、建议 priority fee 与实际 gas price，并折算一笔转账的成本。

**用法**

```
wallet-cli chain prices [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 发一笔交易此刻的单位成本 |
| EVM 增量 | 新增 `feeModel` 字段（见下）；base fee 取最新区块头的 `baseFeePerGas`；priority fee 取 `eth_maxPriorityFeePerGas`，**不做 `eth_feeHistory` 回退**；非 1559 链退到 `eth_gasPrice` |

> **不做 `eth_feeHistory` 回退**：四条内置网络**都支持** `eth_maxPriorityFeePerGas`，所以这条回退今天**一次都不会触发**。而一条永远跑不到的路径既无法验证、也会在下一次改动时被当成有效行为对待。要做的话是独立一小项，且需要先找到一个真的不支持 `eth_maxPriorityFeePerGas` 的端点来验证它走得通。读不到就是 undefined，该行不显示。
| 错误 | `rpc_error`（含端点限流 429） |

> **这条在 EVM 上成立**：TRON 侧它给 `Energy price` / `Bandwidth price` / `Memo fee`，回答的是「现在发一笔交易，单位成本多少」——该问题在 EVM 上不但成立，而且**更常被问**（gas 波动远大于 TRON 的资源单价）。业内对应 `cast gas-price` / `cast base-fee`。字段按 family 各取各的，问题是同一个。

**示例与输出**

```bash
$ wallet-cli chain prices --network sepolia
Fee model      eip1559
Base fee       0.97768 gwei
Priority fee   0.001 gwei
Gas price      0.97868 gwei
Transfer cost  0.00002 ETH  (21,000 gas)
```

```bash
$ wallet-cli chain prices --network sepolia -o json
{ "schema":"wallet-cli.result.v1","success":true,"command":"chain.prices","data":{ "feeModel":"eip1559","baseFeeWei":"977680801","priorityFeeWei":"1000000","gasPriceWei":"978680801","transferGas":21000,"transferCostWei":"20552296821000" },"meta":{ "durationMs":3024,"warnings":[] },"chain":{ "family":"evm","network":"eip155:11155111","chainId":"11155111" } }
```

> 以上为实测输出。
>
> **`feeModel` 是本版新增字段**（`"eip1559" | "legacy"`），text 对应 `Fee model` 一行。这条命令要回答「现在发一笔交易多少钱」，而**费用模型决定了读者该看哪些数字**：1559 链看 base + priority，legacy 链只有 gas price。靠「`baseFeeWei` 在不在」隐含地表达模型，要求读者知道这条规则，而且在 **BSC（base fee 为零但仍是 1559）上特别容易误读**。明讲一个字段，比让人从字段的有无去推断便宜得多。
>
> `feeModel` 由**链上侦测**（§6.1 的同一条规则：`baseFeePerGas` 字段存在即 1559，零也算），`NetworkDescriptor.feeModel` 为覆盖用。

> 三个价一律给 **wei 整数字符串**（text 才换算成 gwei，§1.4）；`gasPriceWei` 是前两者之和、不是 `eth_gasPrice` 的返回值。非 1559 链只给 `gasPriceWei` 与转账折算两项，`baseFeeWei` / `priorityFeeWei` 不出现（不给 `null`）。

> `Transfer cost` 是把单价折算成「一笔原生币转账要花多少」——单看 gwei 数字，多数用户判断不出贵不贵；21,000 gas 是协议固定的转账消耗，折算无歧义。这与 TRON 侧列 `Memo fee` 是同一个意图：把单价翻译成一次实际支出。
>
> **`Gas price` 是 base + priority 的和，由前两行算出，不是 `eth_gasPrice` 的返回值**——`eth_gasPrice` 给的是节点自己的建议值，与 1559 的两段式定价不是一回事，两者并列会对不上账。`Transfer cost` 按这个和乘 21,000 得出。
>
> 不支持 EIP-1559 的链没有 base fee，此时 `Gas price` 直接取 `eth_gasPrice`、只显这一行与 `Transfer cost`，`Base fee` / `Priority fee` 不显示。

**Help 输出**

> **相对现状**：描述由 TRON 专属（energy/bandwidth/memo fee）改写为按 family 说差异、TRON 在前；`--network` 示例值；Examples 两族对称。

```text
$ wallet-cli chain prices --help

Usage:
  wallet-cli chain prices [options]

Show what a transaction costs per unit right now. TRON reports energy/bandwidth
unit prices and the memo fee; EVM reports base fee, suggested priority fee and
the resulting gas price.

Global options:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted  [optional]
  --timeout <number>         per node, service, or device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --verbose, -v              show extra diagnostic output  [optional, default: false]

Examples:
  wallet-cli chain prices --network nile
  wallet-cli chain prices --network sepolia
```

---

## 10. help 规格（三层）

help 分 root / 组 / 命令三层。本章给前两层的完整输出与三层共同的文案规范；**命令层的 help 附在 §3–§9 各命令小节末尾**，与该命令的用法、Options 对照阅读。

> ### ⚠️ 本章尚有一项 help 文案未与实作对齐（待办）
>
> 本轮同步已把**旗标集合发生变化**的 help 区块按实测输出重贴（§2.3 `networks`、§2.4 `config`、§3.9 `derive`、§3.10 `backup`、§3.11 `contact` 三条、§6.3 `tx broadcast`、§7.3 `contract deploy`）。**全局旗标文案**（`--network` / `--timeout`）已于修订 4 按实作回贴至全部 **38 个**含 `Global options` 段的命令层区块。**尚未重贴的只剩一项**：
>
> | 项 | 内容 | 规模 |
> | --- | --- | --- |
> | 命令层描述 / Args / Examples | 实作的一行描述与 Examples 多处比规格更长且**多出来的内容是真的** | **38 个命令层 help 区块** |
>
> **已回贴的两条全局旗标文案**（实作版比原文档版准确，故据此改了文档）：
>
> ```text
> --network <string>   network id or alias, e.g. nile, sepolia, bsc, or eip155:11155111; falls back to config.defaultNetwork when omitted
> --timeout <number>   per node, service, or device call timeout, in milliseconds
> ```
>
> - `--timeout`：原文档版的 `RPC` 是**实作名**，违反 §10.1 规则 3（RPC 方法名／类别名不进 help）。而 `node, service, or device` 也更准确——这条超时同时涵盖节点调用、GasFree 这类外部服务、以及 Ledger 设备。
> - `--network`：实作版列出 `nile` / `sepolia` / `bsc` / `eip155:11155111` 四种形态（**两族别名 + 规范 id**），比原文档版更能让读者一眼看出「别名与规范 id 都收」。
>
> **family 标注词表已折叠进本版且实作已追平**：原 v4.13.1 主题 1（`(tron)` / `(evm)` → `(TRON only)` / `(EVM only)`）整体并入 v4.13.0，本文档全部 132 处标注已改（§10.1）；实作已于 `e206c00a` 输出全大写，**小写残留为 0**。
>
> **回贴命令层区块时的两条硬约束**：① 示例网络一律用 `nile` / `sepolia` 等测试网，**不得贴回 `--network tron` / `--network ethereum` 主网形态**；② 实作侧仍有若干处与 §10.1 文案规范不符（见 §10.1 末尾「待实作修正」），那几处**以本文档为准，不要照抄实作**。

### 10.1 help 文案规范

由实测既有 52 条命令的 help 归纳而来。骨架（`Usage → Args → Requires → Options → Global options → Examples`）由渲染层集中生成、52 条已完全一致，规范只约束**手写文案**。

**三层 help 各自的职责**

| 层 | 描述写什么 | family 差异怎么表达 |
| --- | --- | --- |
| root help | **动词概括**（`Query on-chain account state`），**不列举子命令名** | 整组仅一族可用时标组级 `(TRON only)`；混合组不标 |
| 组 help | 同上，可略具体 | **逐条子命令行尾标 `(TRON only)` / `(EVM only)`** |
| 命令 help | 该命令做什么，两族行为不同时说差异本身 | **逐个 flag 行尾标 `(TRON only)` / `(EVM only)`** |

**family 标注的词表是封闭的两个值：`(TRON only)` 与 `(EVM only)`。**

- **全大写、括号包裹**；后续新增 family 按 `(<FAMILY> only)` 构词，family 名全大写。
- **不得使用动词短语形式**（如 `only support TRON`）——标注列是**属性列**，成员一律为名词 / 形容词短语；且该形式超 80 列会打散标注列的对齐。
- 标注的**适用范围**（哪些项该标、哪些不该标、组级 vs 子命令级 vs flag 级的分工）由上表规定，与词表无关。

> **词表的由来**：原定为 `(tron)` / `(evm)`，评审反馈**看不懂**——单看 `(tron)` 读者无从判断这是「只在 TRON 可用」还是「在 TRON 上行为不同」。`only` 把语义补全，全大写让它在一列小写 flag 名里读得出是标注而不是取值。
>
> ✅ **实作已追平**（`e206c00a`）：全量 help 扫描小写 `(tron only)` / `(evm only)` 残留为 **0**，大写标注 **57 处**（root 9 + 组 11 + 命令层 37）。本文档 §3–§9 help 区块的标注列现已是实测值。

> **为什么不做按 family 过滤的人类 help**：主流 CLI 的 help 都不随运行时上下文变化——`git` / `docker` / `kubectl` / `aws` 的 help 不因 `--context`、`--region` 而增删条目。需要按某个维度分家时，业内是把该维度**做进命令路径**（`aws s3 …` / `aws ec2 …`），而不是让同一条路径的 help 变形。我方的 family 不是命令路径的一段（`wallet-cli tx send` 两族共用），所以走标注而非过滤；同一条命令的 help 永远只有一个版本，可直接引用、可缓存、可写进文档。

> root help 的组描述**不许列举子命令名**——`chain` 原描述 `Query chain params, prices & node info` 点名了 TRON 专属的 `params`，EVM 用户照着找会扑空；且全表只有它在列举，本就是体例偏差。

**Requires 段**

1. 每条是一个**名词短语**，小写开头、句尾无标点；补充说明用 ` — ` 接续。
2. 冠词统一：主密码类一律带 `the`；硬件与账户类为不定指，用 `a` / `an`。
3. 顺序固定：命令特有前置 → 主密码 → 账户。
4. 多条同类前置按**用户输入顺序**排列。
5. **只列硬前置**（缺了就无法执行）；交互确认不属前置，不进 Requires。
6. 外部服务依赖属硬前置，**必须进 Requires**，不许塞在一行描述的括号里（EVM 侧 `account history` 将来接索引服务时按此办，§4.4）。

主密码四种语义的统一写法：

| 场景 | 规范文案 |
| --- | --- |
| 只能 TTY 交互输入 | `the master password — entered interactively in a TTY` |
| 可 stdin 可交互 | `the master password — pass --password-stdin, or enter it interactively in a TTY` |
| 只能 stdin，从不提示 | `the master password — pass --password-stdin; this command never prompts` |
| **是否需要密码取决于模式** | `the master password only when the selected mode signs — pass --password-stdin then; other modes need no password` |

> **第四种是本版补入的**（2026-08-28 PM 拍板，按实作）。它覆盖**全部 ✍️ 写命令**——`--dry-run` / `--build-only` 不签名、因而不需要主密码，`--sign-only` 与默认广播路径才需要。把这类命令一律写成第三种（「从不提示，必须给 --password-stdin」）是**错的**：调用方会为一条 `--dry-run` 白准备一次密码。**实测 24 条命令用此文案**（`tx send` / `contract send` / `contract deploy` / `stake` 全组 / `asset` / `exchange` / `vote cast` / `reward withdraw` / `permission update` / `account activate` / `account set` / `gasfree transfer` / `tx multisig`）。
>
> 它带一个条件从句，形式上比前三种长，但 §10.1 规则 1 约束的是「每条是一个名词短语」——本条主词仍是 `the master password`，条件从句挂在破折号后的补充说明里，与前三种同构。
>
> `change-password` 的 `the new master password — entered interactively in a TTY` 是第一种的实例，不另立一种。

**一行描述**

1. **祈使动词开头**，描述命令做什么，不描述输出内容。
2. **标点按层分**：**组 help 的描述是完整句、句尾带句号**（`Query on-chain account state.`）；**命令 help 的一行描述单句不加句号**（`Show native balance`），多句时每句都加。组描述是独立段落、命令描述是标题式短语，两者惯例本就不同，别拉平。
3. **不出现实现细节名**——protobuf 字段名、Java 类名、RPC 方法名（`eth_getBalance` / `triggerConstantContract` / `getAccount`）一律不进 help。需要交代对应关系的写进本文档的「概览」表，那里是设计溯源该待的地方。**旗标名不算实现细节名**——组 help 的子命令描述可以点名本命令的招牌旗标（`tx` 组的 `send    Send native coins or tokens with human --amount`，2026-08-28 PM 拍板按实作）：`--amount` 是**面向用户的契约**，且它正是这条命令与 `--raw-amount` 路径的分界，点出来比省略更有信息量。规则 3 挡的是**读者用不上的内部名**，不是旗标。
4. 两族行为不同时，描述里说**差异本身**、不说实现（如 `chain prices` 写 "EVM reports base fee…; TRON reports energy/bandwidth unit prices…"，不写调了哪个 RPC）。

**family 专属项的标注**

1. help 静态、不随 `--network` 变化；某个 flag 只属于一族时，**行尾加 `(TRON only)` / `(EVM only)`**，位置在 `[optional, …]` tag 之后。同一条命令的 Options 里**同时出现两族标注**时，其一行描述必须交代标注含义（`Flags marked (TRON only) or (EVM only) are accepted only on networks of that family; using one on the other family is rejected.`）——help 要能被单独读懂，不能依赖读者先看过本规范。
2. 标注语义是**当前版本仅该族可用**，不承诺未来（`account history` 标 `(TRON only)` 是因为 EVM 侧等索引服务，补齐后摘掉）。
3. 两族都有的 flag 不标注，且描述必须**族中立**——`--to` 写 "recipient address"，不写 "recipient TRON base58 address"；`--contract` 写 "token contract address"，不写 "TRC20 contract address"。
4. 组级标注沿用 root help 现状（`stake … (TRON only)`）；混合组不标组级，差异下沉到子命令与 flag。

**Examples 的 family 配比**

help 是**两族共用的静态文本**，Examples 因此必须两族兼顾、**TRON 在前**（主推）。适用范围按命令分三档：

| 档 | 命令 | 要求 |
| --- | --- | --- |
| **吃 `--network` 的命令**（21 条 EVM 绑定命令） | `account` / `token` / `tx` / `contract` / 签名 / 链信息各组 | **必须两族对称**——同一个 flag 组合、只换 `--network` |
| **family 相关的本地命令** | `import ledger`（本版新增 `--app ethereum` 的就是它）、`import watch`（§3.5 明列了 EVM 示例） | **需涵盖两族**，但不要求「只换 `--network`」的对称形式 |
| **其余纯本地命令** | `create` / `derive` / `backup` / `contact` / `encoding` / `address` / `config` / `networks` | **豁免**——它们不吃 `--network`，「只换 `--network`」的对称形式对它们不成立 |

**这条只约束 help**——本文档 §3–§9 的「示例与输出」段是 EVM 规格正文，示例用 EVM 是必要的，不受此约束。

> **示例网络一律用测试网**：本节 Examples 的 `--network` 取值恒为 `nile` / `sepolia` 等测试网。help 的 Examples 是全文档**最可复制**的形态，主网命令不得以可复制形态出现（根 `CLAUDE.md` 示例安全公约）。实作已合规，回贴时不得改回 `--network tron` / `--network ethereum`。

**待实作修正（本节规范 vs 当前实作，`e206c00a` 实测）**

以下两处**以本节为准、需改实作**；回贴命令层 help 区块时**不要照抄实作**：

| # | 位置 | 本节规定 | 实作当前 |
| :---: | --- | --- | --- |
| 1 | `typed-data sign` 一行描述 | 祈使动词开头、不描述输出内容（规则 1） | 首行是 `Prints the signature, the digest that was signed, and the primary type.`——**整条命令没有祈使动词描述行**，两项都违反。应恢复为 `Sign an EIP-712 / TIP-712 typed-data payload` |
| 2 | `import ledger` 一行描述 | `Register a Ledger account (watch-only; signs on device)` | `Register a Ledger account`——删掉了「设备上签名」这个关键限定 |

> **另有五处已于 2026-08-28 拍板「按实作」、本文档已同步**，不需改实作：主密码 Requires 第四种写法（已补入本节上方的四行表）· `token info` 描述去掉字段列举（§5.2）· `tx` 组 help 的 `send` 行点名 `--amount`（规则 3 已加注）· §0.3「不提示」正名为「不问主密码」· **flag 标注免责句改用 `are accepted`**（规则 1 的定死文案已同步，见下）。

> **免责句为何是 `are accepted` 而非 `apply`**：`apply` 说的是「这个 flag 在另一族不起作用」，读起来像**被忽略**；实际行为是**被拒绝**（EVM 网络上传 `--fee-limit` 报 `invalid_option`）。`are accepted only on…` 与后半句 `using one on the other family is rejected` 同指一件事，语义自洽；`apply` 会让读者以为传了也无妨。

### 10.2 root `--help`（完整版）

> **有两行刻意保留实作版，不照原规格**（其余八处差异实作已照规格，不需再动）：
>
> | 组 | 本表采用 | 原规格 | 为什么 |
> | --- | --- | --- | --- |
> | `exchange` | `Create and trade Bancor exchange pairs` | `On-chain Bancor exchange` | 规格版是**名词短语**，违反 §10.1「一行描述以祈使动词开头」，而且全表只有它一列是名词短语 |
> | `contract` | `Call, deploy, govern, and inspect smart contracts` | `Call, send, deploy, and inspect…` | 规格版把 `govern` 换成 `send`，等于**舍弃了对治理四条命令的概括**（`clear-abi` / `set-origin-energy-limit` / `set-user-resource-percent` / `create2`），改成再列一个子命令名；而 `send` 与 `call` 在 root 这一层的区别对读者没有意义。**§10.3 的组 help 同步。**

```text
$ wallet-cli --help

Usage:  wallet-cli [OPTIONS] COMMAND

wallet-cli — CLI wallet for TRON and EVM networks.
Agent-first: deterministic exit codes, JSON output.

Common Commands:
  create           Create a new HD wallet (BIP39 seed)
  import           Import a wallet
  list             List wallets / accounts

Management Commands:
  account          Query on-chain account state
  permission       View / update account permissions (multi-sig)      (TRON only)
  token            Manage the token address book and query tokens
  tx               Build, send, broadcast, and inspect transactions
  gasfree          Gas-free token transfers via the GasFree service   (TRON only)
  contract         Call, deploy, govern, and inspect smart contracts
  proposal         Create / vote on governance proposals              (TRON only)
  witness          Register / operate a super representative          (TRON only)
  asset            Issue & manage TRC10 tokens                        (TRON only)
  exchange         Create and trade Bancor exchange pairs             (TRON only)
  stake            Stake / delegate resources & query state           (TRON only)
  vote             Vote for super representatives                     (TRON only)
  reward           Query / withdraw voting rewards                    (TRON only)
  chain            Query chain and node state
  message          Sign arbitrary messages
  typed-data       Sign EIP-712 / TIP-712 structured data
  block            Get a block (latest if omitted)

Commands:
  use              Set the active account
  current          Show the current (active) account
  rename           Rename an account label
  derive           Derive the next HD account from a seed wallet
  backup           Export an account's secret + metadata (0600)
  delete           Delete a wallet / account
  config           Show / get / set configuration values
  networks         List known networks
  change-password  Change the master password (re-encrypt keystores)
  encoding         Convert / validate addresses & encodings
  address          Generate a random keypair (local, not stored)
  contact          Manage the recipient address book

Global Options:
  -o, --output string  Output format ("text", "json") (default from config)
  --network string     Network id or alias, e.g. "tron", "ethereum", "sepolia"
  --account string     Account label or address to act as (overrides active)
  --timeout int        Request timeout in milliseconds
  -v, --verbose        Verbose / debug logging
  -h, --help           Show help
  -V, --version        Print version information and quit

Run 'wallet-cli COMMAND --help' for more information on a command.
```

**相对现状的三处改动**（其余原样）：

| 项               | 现状（实测）                                       | v4.13.0                                                                                                 |
| --------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 主描述首行           | `wallet-cli — CLI wallet for TRON.`          | `wallet-cli — CLI wallet for TRON and EVM networks.`（第二行 `Agent-first: …` 不变）                           |
| `chain` 组描述 | `Query chain params, prices & node info` | `Query chain and node state`——**改为动词概括、不列举子命令**：原描述点名了 `params`，而它是 TRON 专属，EVM 用户照着找会扑空；全表也只有它在列举子命令，与 `account` / `tx` / `contract` 的「动词 + 对象」体例不一致 |
| `--network` 示例值 | `"tron:728126428", "tron:3448148188", "tron:2494104990"` | `"tron", "ethereum", "sepolia"`，跨两族各取一个、且用简写别名，让「多链」在第一屏可见                                     |

> **`(TRON only)` 标注只给纯 TRON 组**：`permission` / `gasfree` / `proposal` / `witness` / `asset` / `exchange` / `stake` / `vote` / `reward` 九组在 EVM 上整组不适用。**混合组一律不标**——`account`（`activate` / `set` 是 TRON 专属）、`tx`（`approvals` / `multisig`）、`contract`（治理四条）、`chain`（`params` / `prices`）都含 TRON 专属子命令，但组本身两族可用，标了会让人以为整组不可用；差异下沉到子命令与 flag 的 `(TRON only)` / `(EVM only)` 标注（见 §10.1）。这与实现现状一致——实测 root help 里 `chain` 就没有标注。

### 10.3 组 `--help`（中间层）

组 help 是「root → 组 → 命令」三层里的中间层，本版同样要改：现状的子命令描述**写死了 TRON**（`prices` 写 `Energy/bandwidth unit price and memo fee`、`info` 写 `getAccount`、`balance` 写 `(TRX/SUN)`），在 EVM 网络下全不成立。改造两件事：**描述族中立化** + **family 专属子命令行尾标 `(TRON only)` / `(EVM only)`**。

> **相对现状**：`balance` / `info` 描述族中立化（去 `TRX/SUN`、去 `getAccount`）；`history` 的 `(requires TronGrid)` 移出描述并改标 `(TRON only)`；补 `activate` / `set` 两条并标 `(TRON only)`；`portfolio` 调整到 `info` 之后。

```text
$ wallet-cli account --help

Usage:  wallet-cli account COMMAND

Query on-chain account state.

Commands:
  balance     Show the native coin balance
  info        Show the account's on-chain state
  portfolio   Show native + token balances with best-effort USD value
  history     Show transaction history                                 (TRON only)
  activate    Activate an unactivated account                          (TRON only)
  set         Set the on-chain account name / id                       (TRON only)

Run 'wallet-cli account COMMAND --help' for more information on a command.
```

> **相对现状**：组描述改为动词概括、不列举子命令；`prices` 去掉 `Energy/bandwidth`、`node` 去掉 `(version / sync / peers)`；`params` 标 `(TRON only)` 并移到末位。

```text
$ wallet-cli chain --help

Usage:  wallet-cli chain COMMAND

Query chain and node state.

Commands:
  node     Connected node status
  prices   Current transaction unit prices
  params   On-chain governance parameters   (TRON only)

Run 'wallet-cli chain COMMAND --help' for more information on a command.
```

> **相对现状**：五条子命令描述统一精简，去掉 `(--contract / --asset-id)` 与 `totalSupply` 这类 flag / 字段细节。

```text
$ wallet-cli token --help

Usage:  wallet-cli token COMMAND

Manage the token address book and query tokens.

Commands:
  balance   Show a single token balance
  info      Show token metadata
  add       Add a token to the address book
  list      List the address book
  remove    Remove a user-added token

Run 'wallet-cli token COMMAND --help' for more information on a command.
```

> **相对现状**：`send` / `sign` 描述族中立化；补 `approvals` / `multisig` 两条并标 `(TRON only)`。

```text
$ wallet-cli tx --help

Usage:  wallet-cli tx COMMAND

Build, send, broadcast, and inspect transactions.

Commands:
  send        Send native coins or tokens with human --amount
  sign        Sign a transaction built elsewhere
  broadcast   Broadcast a presigned transaction
  status      Show confirmation status of a transaction
  info        Show full transaction detail + receipt
  approvals   Show collected signatures on a multi-sig transaction  (TRON only)
  multisig    Create / co-sign a multi-sig transaction              (TRON only)

Run 'wallet-cli tx COMMAND --help' for more information on a command.
```

> **相对现状**：`call` / `send` / `deploy` 描述去掉 RPC 方法名；`info` 改标 `(TRON only)`；补 `clear-abi` / `set-origin-energy-limit` / `set-user-resource-percent` / `create2` 四条并标 `(TRON only)`；名列宽随之加宽。

```text
$ wallet-cli contract --help

Usage:  wallet-cli contract COMMAND

Call, deploy, govern, and inspect smart contracts.

Commands:
  call                        Read-only contract call
  send                        State-changing contract call
  deploy                      Deploy contract bytecode
  info                        Show contract ABI + metadata        (TRON only)
  clear-abi                   Clear a contract's on-chain ABI     (TRON only)
  set-origin-energy-limit     Set the deployer's energy cap       (TRON only)
  set-user-resource-percent   Set the caller-paid resource share  (TRON only)
  create2                     Precompute a CREATE2 address        (TRON only)

Run 'wallet-cli contract COMMAND --help' for more information on a command.
```

> **相对现状**：组描述精简为 `Import a wallet.`；补 `keystore` 一条；`ledger` / `watch` 描述精简（括号里的说明下沉到各自命令 help）。

```text
$ wallet-cli import --help

Usage:  wallet-cli import COMMAND

Import a wallet.

Commands:
  mnemonic      Import a BIP39 mnemonic phrase
  private-key   Import a raw private key
  keystore      Import a Web3 keystore file
  ledger        Register a Ledger account
  watch         Register a watch-only address

Run 'wallet-cli import COMMAND --help' for more information on a command.
```

> **相对现状**：`list` 的子命令描述补「给出每条的 chain family」；组描述与另两条沿用现状。

```text
$ wallet-cli contact --help

Usage:  wallet-cli contact COMMAND

Manage the recipient address book.

Commands:
  add      Add a payee to the address book
  list     List every contact
  remove   Remove a contact

Run 'wallet-cli contact COMMAND --help' for more information on a command.
```

> **标注语义**：`(TRON only)` / `(EVM only)` 表示**当前版本仅该族可用**，不承诺未来——`account history` 与 `contract info` 标 `(TRON only)` 是因为 EVM 侧要等索引服务（§4.4、能力矩阵），将来补齐后标注即摘掉。整组仅 TRON 的（`permission` / `gasfree` / `stake` / `vote` / `reward` / `proposal` / `witness` / `asset` / `exchange`）在 root help 标组级 `(TRON only)`，其组 help 内部不再逐条重复。
>
> **`message` / `typed-data` 两组各只有一个子命令 `sign`，两族均可用**，组 help 无标注、无改造，此处从略。

---

## 11. 错误码

> **「这份表是唯一的错误码索引，不得出现表外的码」这句承诺保留、不弱化**——agent 就是靠 `error.code` 分支的，一个没被文档写过的码等于一个它无法处理的码。
>
> **会失效的不是承诺，是手工维护的表**：上一版的 §11 列了 9 个从不产生的码、漏了 30 多个真的会产生的码，正是手工维护的结果。因此索引改为与错误定义放在一起、由测试守住，让它结构上不可能再漂移：
>
> - 真理源是 `src/domain/errors/codes.ts` 的 `ERROR_CODES`，逐码附一行语义；
> - 一条测试扫描全部源码**双向**比对——**丢得出来却没登记 → 失败；登记了却没人丢 → 也失败**；
> - **机器可读版本在 `--json-schema` 的 `errorCodes` 键**，agent 一次调用即可取得全量（纯新增，不影响既有键）。
>
> 下表由该真理源生成，共 **129 条**。各节「概览」的错误行只从这里取值。

### 11.1 本版相关的新增与更名

| 错误码 | 说明 |
| --- | --- |
| `migration_required` | **本版新增**。注册文件落后于本体，且无法取得主密码（无 TTY 且未给 `--password-stdin`），见 §0 |
| `invalid_config` / `insecure_config` | **本版新增**。config 文件格式错 / 权限或内容不安全（§2.2、§2.4） |
| `unsupported_network` / `missing_network` | 网络解析（§2.1） |
| `family_mismatch` | **本版由 `network_family_mismatch` 更名**——对照旧字符串的 agent／脚本会坏，**进 release note** |
| `missing_wallet_address` | 与 `family_mismatch` **分家**：「账户存在但在另一条链上」先前与「你根本没有账户」共用同一个码，而两者的解法完全不同 |
| EVM 广播拒绝码 | `nonce_too_high` / `replacement_underpriced` / `gas_too_low` / `fee_too_low` / `gas_limit_exceeded`（§6.3 白名单判断的产物） |
| `token_metadata_unavailable` | **取代规格里的 `not_a_token`**——读不到 metadata 的原因不只「不是代币」，新名字更准 |
| `token_already_listed` | **取代规格里的 `token_exists`** |
| `token_not_in_book` | **取代规格里的 `token_not_found`**——说出了「不在地址簿」而不是含糊的「找不到」 |
| `ledger_unsupported` | **规格里的 `app_not_open` 并入此码**：它与「app 版本不支持这条指令」共用同一个 status word（`0x6d00` INS_NOT_SUPPORTED），**单看它分不出是哪一个**，故合并，信息同时涵盖两种原因 |
| `ledger_setting_required` | **本版新增**：TRON app 的设定类状态 |
| `provider_rate_limited` | **外部服务**的限流专用码。**节点限流（HTTP 429）仍归 `rpc_error`**，两者的处置不同 |

**从 `invalid_value` 这个泛用桶里分出来的六个**（破坏性：比对 `invalid_value` 的脚本会漏接，**进 release note**）：

| 码 | 分出来的理由 |
| --- | --- |
| `account_not_found` | `--account` 打错的下一步是 `list`；而秘密是在隐藏提示下输入的，envelope 连 issue path 都没有，**码是调用者唯一拿得到的东西** |
| `invalid_mnemonic` | 同上。顺带修掉一个真的缺陷：私钥含非十六进制字符时 `hexToBytes` 抛的是自己的 Error，会被归为**信息被 redact 的 `internal_error`**——同一个打字错误的两种形态先前回两个不同的码，其中一个还是错的 |
| `invalid_private_key` | 同上 |
| `seed_not_found` | `--seed-id` 指到一个非 seed 钱包时信息说得清楚、码什么都没说 |
| `invalid_path` | `import ledger --path` 把「这根本不是一条 BIP32 路径」报成 `--path coin_type ? does not match --app tron`——一句在谈 coin_type 的话，而用户的问题不是 coin_type。**同时旧检查只比对 `m/44'/<coin>'/` 前缀，`m/44'/195'/garbage` 会通过验证直接送进设备。** 现在路径格式错误报 `invalid_path`，币别不符才留在 `invalid_option`（那是两个旗标之间真正的矛盾） |
| `device_not_found` / `device_locked` | 先前一起归进 `auth_required`——**装置没插时没有任何凭证可以提供，`auth_required` 说的是错的事**；而「没插」与「锁着」的解法一个是插上、一个是输 PIN |

> **查找「歧义」的情形维持 `invalid_value`**：值是有效的，只是选中多个，解法是缩小范围而不是去找一个不存在的账户。

### 11.2 `family_mismatch` 的触发场景（本版扩为六个）

| # | 场景 |
| :---: | --- |
| 1 | 账户与目标网络 family 不符 |
| 2 | raw tx 与目标网络 family 不符 |
| 3 | **该命令在目标网络的 family 下没有实作**（`stake info --network eip155:1`） |
| 4 | **收款人地址属于另一族**（`--to 0x…` 配 `--network nile`）。先前报 `contact_not_found`——会让用户去找一个他**从没建立过**的通讯录条目 |
| 5 | **通讯录条目的地址属于另一族**。信息刻意描述**地址**而非 family（§3.11），用户不必学会那个词 |
| 6 | **以 family 前缀查询一条该族没有实作的命令**（`evm account history --help`）。命令**存在**，只是没有那一族的实作；报 `unknown_command` 会把读者导向去找不存在的错字 |

### 11.3 两条跨命令的判定规则

**① `unknown_command` 涵盖 meta 路径。** 无法解析的命令路径一律 `unknown_command`（exit 2），**`--help` / `--json-schema` 不例外**。

先前 `handleMeta()` 对**任何**无法解析的路径都退回 root help 并 `return 0`——同一个错字，不带 meta 旗标时是 `unknown_command` / exit 2，加上 `--help` 就变成「成功」。**meta 旗标等于在退出码契约上开了一个洞**，而 agent 打错命令名时会拿到一个看似成功的回应。（顺带修掉一个既有缺陷：`tx send --to T... --help` 先前拿到的是**组** help 而非该命令的。）**破坏性，进 release note。**

**② `--to` 两者皆非时，错误码由值的形状决定。** `--to` 接受地址**或**通讯录名称，所以「解析不出来」有两个可能的原因，而**只讲其中一个会把一半的人送去错的地方找**。

| 值的形状 | 码 |
| --- | --- |
| `0x…` 或 `T…` 开头 | `invalid_address` |
| 其余 | `contact_not_found` |

**两种信息都必须提到另一种可能**：

```text
invalid_address: 0xnotanaddress is not a valid evm address, and no contact is named that either
contact_not_found: no contact named nosuchname, and it is not an address either
```

> 判断用的是最宽的那个问法：**不是「这是不是有效地址」，也不是「这是不是地址形状」**（那两个更早就判掉了），而是**「他是不是想打一个地址」**——没有人会在想打通讯录名称时键入 `0x`。

### 11.4 全量索引

> 由 `ERROR_CODES` 生成。每条一行：**从调用者这一侧看，发生了什么**；不写该怎么办——那属于 message，message 可以点名涉及的文件、旗标或地址。

| 错误码 | 语义 |
| --- | --- |
| `usage_error` | the command line could not be parsed |
| `unknown_command` | no such command path, including under --help / --json-schema |
| `invalid_option` | an option is not accepted here, or contradicts another one |
| `missing_option` | a required option was not given |
| `invalid_value` | an option's value is not of the shape that option takes |
| `unknown_parameter` | no chain parameter by that name |
| `limit_exceeded` | a bounded input (file size, list length, page size) was over its limit |
| `family_mismatch` | the account, recipient, raw transaction or command does not belong to the selected network's chain |
| `missing_network` | the command needs a network and none was selected or configured |
| `unsupported_network` | no network by that id or alias |
| `unsupported_network_capability` | the selected network does not offer what this command needs |
| `missing_wallet_address` | no account is available to act as |
| `account_not_found` | no local account by that id, label or address |
| `seed_not_found` | the reference does not name a seed (HD) wallet |
| `account_exists` | an account with that address is already in the keystore |
| `invalid_account` | the account reference is not well-formed |
| `not_exportable` | the account holds no exportable secret (watch-only or Ledger) |
| `no_software_wallet` | the operation needs a locally stored key and none exists |
| `watch_only_no_signer` | the selected account can be watched but cannot sign |
| `auth_required` | the master password is needed and was not available |
| `auth_failed` | the master password was wrong |
| `weak_password` | the proposed master password does not meet the strength rule |
| `wrong_keystore_password` | the keystore file's own password was wrong |
| `invalid_keystore` | the file is not a valid V3 keystore |
| `invalid_mnemonic` | the phrase is not a valid BIP39 mnemonic |
| `invalid_path` | the value is not a usable BIP44 derivation path |
| `invalid_private_key` | the private key is not 32 bytes of hex |
| `keystore_not_found` | no keystore file at that path |
| `secret_source_error` | a secret channel (stdin / TTY) could not be read |
| `tty_required` | the operation only accepts input from a terminal, and there is none |
| `entropy_failure` | the system random source failed |
| `insecure_permissions` | a wallet file's permissions are wider than 0600 |
| `migration_required` | a registry file is older than this build and must be migrated first |
| `audit_append_failed` | the local export/audit log could not be appended to |
| `file_not_found` | an input file does not exist |
| `output_exists` | the output path is already taken and would be overwritten |
| `io_error` | a local read or write failed |
| `encoding_error` | data on disk or on the wire is not in the form its format requires |
| `invalid_config` | the config file is malformed, or a network in it is missing a required field |
| `insecure_config` | the config file's permissions or contents are unsafe to load |
| `contact_not_found` | no contact by that name, and the value is not an address either |
| `invalid_address` | the value is not a valid address for the relevant chain |
| `already_exists` | a contact with that name or address is already stored |
| `token_not_in_book` | no token by that reference in the local address book |
| `token_already_listed` | that token is already in the local address book |
| `token_is_official` | the entry is a built-in and cannot be edited or removed |
| `token_metadata_unavailable` | the token's on-chain metadata could not be read |
| `unsupported_token` | the token standard is not one this command handles |
| `ambiguous_token_symbol` | the symbol matches more than one token; address it by contract |
| `ambiguous_asset_name` | the TRC10 name matches more than one asset; address it by id |
| `invalid_transaction` | the transaction is malformed, or already carries a signature |
| `invalid_payload` | the payload does not decode as what the flag says it is |
| `invalid_amount` | the amount is not positive, or is finer than the asset's precision |
| `precision_loss` | the amount cannot be represented exactly at the required precision |
| `tx_integrity` | the transaction re-encoded differently than it arrived — it was altered in flight |
| `chain_id_mismatch` | the transaction was built for a different chain than the one selected |
| `signing_rejected` | the signature was declined on the device |
| `dry_run_violation` | a --dry-run path attempted to broadcast; the attempt was barred |
| `invalid_permission` | no such permission group on the account, or it cannot be used here |
| `not_authorized` | the account is not permitted to perform this operation |
| `already_signed` | this account has already signed the transaction |
| `already_approved` | the approval was already recorded |
| `not_approved` | the transaction has not gathered the approvals it needs |
| `tx_expired` | the transaction's expiration has passed |
| `transaction_rejected` | the node refused the transaction, in its own words |
| `nonce_too_low` | nonce already used; the account has moved on |
| `nonce_too_high` | nonce is ahead of the account; an earlier transaction is missing |
| `replacement_underpriced` | replacing a pending transaction needs a higher fee than the original |
| `gas_too_low` | the gas limit is below what this transaction needs |
| `gas_limit_exceeded` | the gas limit exceeds the block gas limit |
| `fee_too_low` | the fee is below what the network is currently accepting |
| `insufficient_balance` | the balance cannot cover the amount plus the maximum fee |
| `insufficient_token_balance` | the token balance cannot cover the amount |
| `execution_reverted` | the contract reverted the call |
| `execution_error` | the transaction ran on-chain and failed |
| `not_found` | the transaction, block or record does not exist at this node |
| `rpc_error` | the node answered with an error |
| `invalid_node_response` | the node's answer was not in the shape the API defines |
| `provider_error` | an external service failed |
| `provider_rate_limited` | an external service is rate-limiting this client |
| `timeout` | the node, service or device did not answer in time |
| `aborted` | the operation was stopped before it finished |
| `cancelled` | the operation was cancelled before it reached the device |
| `history_not_supported` | the selected network exposes no transaction history endpoint |
| `chain_parameter_unavailable` | the node does not report that chain parameter |
| `gasfree_auth_failed` | the GasFree service rejected the request's credentials |
| `gasfree_credentials_missing` | no GasFree credentials are configured |
| `gasfree_integrity` | the GasFree service's answer failed its integrity check |
| `gasfree_rejected` | the GasFree service refused the transfer |
| `tronlink_credentials_missing` | no TronLink multi-sig service credentials are configured |
| `device_not_found` | no Ledger device answered |
| `device_locked` | the Ledger device is connected but locked |
| `ledger_setting_required` | a setting in the Ledger app must be enabled for this operation |
| `ledger_unsupported` | the Ledger app does not implement this operation or cannot decode it |
| `ledger_address_not_found` | the address was not found within the scanned derivation range |
| `wrong_device_seed` | the device holds a different seed than the account was registered with |
| `account_not_active` | the account is not activated on-chain |
| `account_already_active` | the account is already activated on-chain |
| `insufficient_stake` | the staked amount cannot cover this operation |
| `insufficient_voting_power` | the account has less voting power than the votes cast |
| `no_frozen_supply` | there is nothing frozen to act on |
| `not_yet_unfreezable` | the stake is still within its lock-up period |
| `nothing_to_withdraw` | there is nothing available to withdraw |
| `withdraw_too_frequent` | the withdrawal interval has not elapsed yet |
| `no_reward` | there is no reward to claim |
| `not_a_witness` | the address is not a witness |
| `already_witness` | the address is already a witness |
| `asset_not_found` | no TRC10 asset by that id or name |
| `invalid_asset_name` | the TRC10 name is not of an acceptable form |
| `already_issued_asset` | the account has already issued a TRC10 asset |
| `not_an_issuer` | the account did not issue this asset |
| `not_in_ico_window` | the asset's participation window is not open |
| `id_taken` | that id is already in use |
| `proposal_not_found` | no proposal by that id |
| `proposal_expired` | the proposal's voting window has closed |
| `not_proposal_owner` | the account did not create this proposal |
| `already_canceled` | the proposal was already withdrawn |
| `exchange_not_found` | no Bancor exchange pair by that id |
| `exchange_closed` | the exchange pair is not accepting this operation |
| `exchange_trading_disabled` | this network is not accepting Bancor trades |
| `not_exchange_creator` | the account did not create this exchange pair |
| `token_not_in_exchange` | that token is not one of the pair's two sides |
| `same_token` | both sides of the pair would be the same token |
| `insufficient_reserve` | the pair's reserve cannot support the requested amount |
| `self_participation` | the account cannot take both sides of this operation |
| `slippage_exceeded` | the trade would have returned less than the floor set for it |
| `contract_not_found` | no contract at that address |
| `not_contract_deployer` | the account did not deploy this contract |
| `internal_error` | an unexpected internal failure; the message is redacted on purpose |

> **`rpc_error` 与 `invalid_option` 的退出码不同**：前者是端点侧的失败（重试或换端点即可，exit 1），后者是调用方错误（要改命令行，exit 2）。§6.1 的 gas 估算失败正是按这条界线**由 `invalid_option` 改回节点侧码**的。

---

## 12. Java 版移除 Standard CLI

### 12.1 决策

Java 版内嵌两套入口：交互式 shell 与 Standard CLI（`org.tron.walletcli.cli`，非交互命令行层）。TS 版已完整覆盖非交互场景（`-o json`、错误码契约、`--*-stdin` 秘密通道），两套并存只会让行为契约长期漂移。**本版一次性移除 Java Standard CLI**，不留弃用过渡版本。

移除后 Java 版只剩交互式 shell 一个入口；所有非交互 / 脚本 / CI 场景改用 TS 版。

**这是破坏性变更，触达使用者靠四件事**（缺一不可，且都在发版前完成）：

| 交付物 | 内容 | 实测状态 @ `e206c00a` |
| --- | --- | --- |
| 命令映射表 | Standard CLI 全部命令 → TS 版对应命令，逐条列出，含参数与输出差异；进 release note 与 `java/README.md`，移除后继续保留在 docs | ❌ **未做**——全仓不存在；`java/README.md` 无横幅、无 Standard CLI 字样、无迁移指引 |
| 版本号 | Java 版随本版做 **major 级跳跃**，让依赖锁定的构建不会自动升上来 | ❌ **未达成**——`Utils.VERSION = " v4.13.0"`，4.12→4.13 是 **minor**；`java/build.gradle` 仍 `version '1.0-SNAPSHOT'` |
| 启动兜底 | 交互式 shell 收到 Standard CLI 形态的调用（带子命令参数启动）时，打一行**含替代命令与映射表地址**的提示再退出，**而不是**报未知参数 | ⚠️ **半数达成**——`Client.runMain` 已对带参调用打 stderr 提示并 exit 2，文案为 `Standard CLI has been removed in v4.13.0. Use the TypeScript CLI instead: @tron-walletcli/wallet-cli`；**但只给了包名，没有替代命令、没有映射表地址** |
| 社区通知 | GitHub Release note + Discussions 置顶帖 + 官方开发者渠道，随本版发布同步发出 | 🔵 发版动作，仓库内不可核 |

> 没有弃用版做缓冲，**映射表与启动兜底就是仅有的两条触达渠道**——使用者是脚本与 CI，不读 release note，只在流水线红掉时才发现。映射表必须**逐条覆盖**、可直接照着改脚本，不能只给一句「请改用 TS 版」；启动兜底的那行提示，是他们在故障现场唯一能看到的东西，必须自带出路。

> ⚠️ **发版阻塞**：上表两个 ❌ 与一个 ⚠️ 落在同一条链上——**兜底提示之所以只能给包名，正是因为映射表还不存在**（无址可指）。四件交付物「缺一不可、且都在发版前完成」是本节自订的条件，目前仅社区通知一项待发。

### 12.2 移除范围（实测量化）

> **本节的删除工作已在 PR #990 内完成**（`e206c00a`，含 PR #991 合入）：`java/…/org/tron/walletcli/cli/` 已不存在，`fbf5362c..HEAD` 的 java 侧净删 **19,329 行 / 77 文件**。下表规模数字已按 `e206c00a` 复核——**「Standard CLI 包」一行逐位吻合**（39 文件 / 6,773 行）；测试与文档两行原为 2 / 5，实测为 24 / 1，已订正（原文点名的另外四篇文档在本文档自己的旧基准 `fbf5362c` 上就不存在）。

| 项 | 规模 | 位置 |
| --- | --- | --- |
| Standard CLI 包 | **39 个文件 / 6,773 行** | `java/src/main/java/org/tron/walletcli/cli/` |
| 入口挂钩 | 4 个 import + `initRegistry()` 的 9 处 register + main 分支 | `java/src/main/java/org/tron/walletcli/Client.java` |
| 测试 | **24 个测试文件** | 整个 `java/src/test/java/org/tron/walletcli/cli/` 测试树（含 `aliases/` 5 个、`ledger/` 3 个、`commands/` 3 个）+ QA harness（`org/tron/qa/QARunner`、`QASecretImporter`）+ `TransactionUtilsTest` / `UtilsPasswordTest` / `ClearWalletUtilsTest` |
| 文档 | **1 篇** | `java/docs/standard-cli-contract-spec.md` |
| 关联方法族 | `WalletApi` 的 `*ForCli`、`WalletApiWrapper` 的 GasFree 签名分支 | 处置见 §12.3 |

### 12.3 动工前置（阻塞项，必须先有结论）

一次性移除没有回退窗口，以下两条**必须先查清调用关系再动手**，否则会删出「Java 版悄悄没了 Ledger」这类回归：

| # | 前置 | 两种结论各自怎么做 |
| --- | --- | --- |
| 1 | **Ledger 支持的归属**——Java 侧 Ledger 只在 Standard CLI 这条路上做过（`cli/ledger/`、`WalletApi.signTransactionForCli` 的 Ledger 分支、`WalletApiWrapper` 的 GasFree 签名分支） | 若交互式 shell 也要保留 Ledger：先把 Ledger 相关代码**迁出** `cli/` 包并接到交互路，再删其余；若确认放弃：在 release note 里**明写「Java 版不再支持 Ledger」**，不能让它随包静默消失 |
| 2 | **`*ForCli` 方法族**——`processTransactionForCli` / `processTransactionExtentionForCli` / `signTransactionForCli` | 若只有 Standard CLI 调用：随包删；若交互路也在用：只删调用方、方法改名去掉 `ForCli` 后缀 |

> 第 1 条的两种结论**都可接受，但都必须落在 release note 里**——不可接受的是没结论就删。
