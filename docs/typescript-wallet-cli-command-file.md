# Wallet-CLI 命令文档（一期）

> 版本：v0.3（评审稿）｜ 日期：2026-06-22 ｜ 作者：Kevin（产品）
> 依据：2026-06-18 命令评审《会议纪要》+《phase1-command-flags-reference》（以**当前 TS 代码**为准）。
> 范围：TRON 为主轴；EVM 部分命令代码已落地（属出入项，见 §13）。
> 体例：每条命令含 **用法（Synopsis）→ 概览表（功能 / 三态 / 错误）→ Flags 表 → 示例与输出**（交互式命令以「交互流程」代替示例与输出）。

---

## 0. 阅读约定

### 0.1 命令分块与文法

- **绑链命令**：`wallet-cli <family> <resource> <action> [--network <net>] [flags]`，`family ∈ tron | evm`。
- **中立命令**（不绑链）：`wallet-cli wallet|config|chains <action>`，无连线。
- **Synopsis 文法**：`<必填>` ｜ `[可选]` ｜ `a | b`（互斥，二选一）｜ `(... | ...)`（互斥组，必选其一）。
- **图标**：🔒 需 master password ｜ ✍️ 改链上状态（会广播交易）｜ ⚠️ 不可逆 / 高风险（删除、导出秘密）｜ 无图标 = 纯读 / 仅本地。

```
wallet-cli
├─ wallet     create | import-mnemonic | import-private-key | import-ledger | import-watch
│             | list | set-active | active | rename | add-account | export-address | delete | backup
├─ config     get | set
├─ chains     list
├─ tron <resource> <action> --network <tron-net>
│  ├─ account   balance | resources | assets | info | history | add-token | list-tokens | remove-token | portfolio
│  ├─ token     balance | info
│  ├─ tx        send-native | send-token | broadcast | status | info
│  ├─ resource  freeze | unfreeze | withdraw | cancel-unfreeze | delegate | undelegate | prices
│  ├─ block     get
│  ├─ contract  call | send | deploy | info
│  └─ message   sign
└─ evm <resource> <action> --network <evm-net>   # 代码已部分实作，详见 §11 / 出入 §13
```

### 0.2 命令呈现读法

每条命令固定按 **用法（Synopsis）→ 概览表 → Flags 表 → 示例与输出** 四块呈现，各块读法如下。

**① 用法（Synopsis）**：一眼看清命令全貌与必填 / 可选 / 互斥关系（文法见 §0.1）。

**② 概览表**：两列 `项 / 内容`，固定 **功能 / 网络 / 解锁 / 账户 / 错误** 五行，用来一眼看懂这条命令的“性质”。每行可能填的值及含义：

| 项 | 取值 | 含义 |
| --- | --- | --- |
| **功能** | （一句话） | 这条命令做什么。 |
| **网络** | `必填` | 不带 `--network` 就报错。 |
| | `可选` | 可不带；缺省时用该 family 的预设网络。 |
| | `本地操作` | 只读本地，根本不访问链上节点。 |
| **解锁** | `software 账户需密码` | 软件钱包：需输 master password 解密私钥。 |
| | `Ledger 需设备确认` | 硬件钱包：私钥不出设备，在 Ledger 上按键确认，**不需要 master password**。 |
| | `不需要` | 纯读或纯本地，无需任何解锁。 |
| **账户** | `默认 active，可 --account 覆写` | 不指定就用当前 active 账户。 |
| | `必填（命令字段）` | 必须用 `--account` 显式指定，不带就报错。 |
| | `不适用` | 这条命令不针对某个账户。 |
| **错误** | （错误码列表） | 只列本命令专属错误码；通用网络 / 节点错误不在此重复。 |

**③ Flags 表**：四列 `Flag / 必填 / 默认 / 说明`，只列**命令专属 flag**（`必填` 取 `是 / 否 / 互斥必填`）；情境全局 flag（§0.3）不重列。

**④ 示例与输出**：可直接复制的命令 + 默认 text 输出 + `-o json` 输出；多行 / 表格 / JSON 在此完整呈现（不挤进表格单元格）。

> **交互式命令**改用「交互流程」（分步 + 状态机 + 异常）代替「示例与输出」，不产生 text / json 契约。
> 秘密永不进 argv：`--*-stdin` 为 boolean 开关，值由 **fd 0（stdin）** 读入，每次调用至多喂一个。

### 0.3 全局 Flag（每条命令都能带，各表不重列）

**通用全局**（与具体命令无关）：

| Flag | 默认 | 说明 |
| --- | --- | --- |
| `--output text\|json` / `-o` | config `defaultOutput`（预设 text） | 输出格式；json 走固定 envelope |
| `--quiet` | off | 抑制 stderr 诊断（不影响 data） |
| `--verbose` | off | 增加 debug 诊断 |
| `--timeout <ms>` | config `timeoutMs` | 操作逾时（含 Ledger 等待） |
| `--help` / `-h` | — | 显示命令说明（meta，短路执行） |
| `--json-schema` | — | 输出该命令 agent JSON-schema（meta） |
| `--version` | — | 显示版本（根命令） |

**情境全局**：

| Flag                              | 适用                  | 默认                 | 说明                                               |
| --------------------------------- | ------------------- | ------------------ | ------------------------------------------------ |
| `--network <net>`                 | 绑链命令                | family 预设（签名类多为必填） | 选网络 / 连节点；签名类缺省 → `missing_network`              |
| `--account <ref\|label\|address>` | 需指定操作账户的命令          | 当前 active          | 覆写 active 选择操作账户（作「目标必填字段」时则进 Flags 表，见各命令）      |
| `--password-stdin`                | 🔒 software 签名 / 解锁 | —                  | master password 走 fd 0（过渡期形态，目标为交互式隐藏输入，见 §13.4） |
| `--grpc-endpoint <url>`           | tron 绑链             | config             | 单次覆写 TRON 节点端点                                   |
| `--rpc-url <url>`                 | evm 绑链              | config             | 单次覆写 EVM RPC 端点                                  |

### 0.4 输出契约

- **json 输出**固定 envelope：`{ "ok":true, "command":"<family.resource.action>", "network":"<net|null>", "data":{…}, "error":null }`；失败 `ok:false` + `error:{code,message}`。
- **text 输出**：列表 / 历史 → 表格；单对象 → 条列；动作回执 → 单行 + 状态标记（`✅`成功 `❌`失败 `⏳`待确认 `⚠️`风险）。默认输出由 config `defaultOutput` 决定（预设 text）。
- **交互式命令**不产生 text / json 输出契约；AI 侧仅收到**地址级回执**（无秘密）。

### 0.5 上链执行模式（tx / resource / contract / message 通用）

签名命令默认**直接签名并执行**（每笔由 master password 解锁 / Ledger 设备确认作门槛）；`--dry-run` 只回 plan + 真实费用、不签不广播；`--sign-only` 仅签名出 hex。`--dry-run` 与 `--sign-only` **互斥**。无独立 `--broadcast` flag。

```
默认：  build ──► sign ──► broadcast        （一步到位）
dry-run：build ──► 估费/估能量              （不签、不广播）
离线签：build ──► sign ──► hex ──► tron tx broadcast   （--sign-only 出 hex，另机广播）
```

---

## 1. wallet —— 钱包 / 账户管理（中立群组，不访问链上节点）

### 1.1 `wallet create` —— 产生新 HD 钱包并加密存档 🔒（交互式）

**用法**

```
wallet-cli wallet create [--label <name>] [--words 12|24]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 生成新助记词 HD 钱包并加密存档；首次使用时交互式设置 master password |
| 网络 | 本地操作（不访问链上节点） |
| 解锁 | 首次设置 / 已有则输入 master password |
| 账户 | 新建并设为 active |
| 错误 | `password_mismatch` · `io_error` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--label <name>` | 否 | 自动「钱包N」 | 新钱包显示名 |
| `--words <12\|24>` | 否 | 12 | 助记词字数 |

**交互流程**

```
$ wallet-cli wallet create --label main
? First time here — set a master password (hidden input): ********
? Confirm master password: ********
(generating mnemonic, encrypting locally…)
✅ Created wallet "main"
   Address: TXY... (hidden) | Type: HD master wallet (12 words, encrypted) | Set as active
⚠️ The mnemonic is your only recovery phrase. Run `wallet backup` to save it offline soon (a forgotten password cannot be recovered).
```

- **步骤 1 — 解析参数**：读取 `--label` / `--words`（默认 12 词）。
- **步骤 2 — master password 状态机**：
  - 首次（本机无 keystore）→ 隐藏输入 + 二次确认。
  - 已有 keystore → 改为「输入现有 master password」单次解锁，用同一把密码加密新钱包。
  - 两次不一致 → `password_mismatch`，回到本步重输。
- **步骤 3 — 生成 + 加密**：生成助记词、加密落盘；**助记词不在任何步骤展示**，不落明文。写盘失败 → `io_error`。
- **结束态**：新钱包成为 active；提示备份。AI 仅收到地址级回执（无助记词、无密码）。

### 1.2 `wallet import-mnemonic` —— 导入既有 BIP39 助记词 🔒（交互式·仅人工）

**用法**

```
wallet-cli wallet import-mnemonic [--label <name>]      # 助记词、密码交互式输入
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 导入既有助记词并加密存档；助记词与密码均隐藏输入，AI 全程看不到、只回地址 |
| 网络 | 本地操作（不访问链上节点） |
| 解锁 | 首次设置 / 已有则输入 master password |
| 账户 | 导入并设为 active |
| 错误 | `wrong_password` · `invalid_mnemonic` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--label <name>` | 否 | 自动「钱包N」 | 新钱包显示名（助记词、密码不走 flag，交互式输入） |

**交互流程**

```
$ wallet-cli wallet import-mnemonic
? Enter master password (hidden input): ********
? Paste mnemonic (12/24 words; hidden, no echo, not saved to shell history): ****************************
(validating BIP39, deriving address, encrypting to disk…)
✅ Imported "main" TQk... (mnemonic never seen by AI) | Set as active
```

- **步骤 1 — master password**：首次设置（二次确认）/ 已有则输入解锁；错误 → `wrong_password`（有限次重试）。
- **步骤 2 — 助记词输入**：隐藏、不回显、不进 shell history；秘密输入交还给人在终端完成，AI 看不到。
- **步骤 3 — 校验 + 落盘**：词数 / 校验和非法 → `invalid_mnemonic`，要求重输；通过则派生地址、加密落盘，不写明文。
- **结束态**：导入钱包成为 active；AI 仅收到地址级回执。

> 代码现况为过渡期 `--mnemonic-stdin`（fd 0），互动式隐藏输入为目标形态（见 §13.4）。

### 1.3 `wallet import-private-key` —— 导入既有私钥 🔒（交互式·仅人工）

**用法**

```
wallet-cli wallet import-private-key [--label <name>]   # 私钥、密码交互式输入
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 导入既有私钥并加密存档，约束同助记词导入 |
| 网络 | 本地操作（不访问链上节点） |
| 解锁 | 首次设置 / 已有则输入 master password |
| 账户 | 导入并设为 active |
| 错误 | `wrong_password` · `invalid_private_key` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--label <name>` | 否 | 自动「钱包N」 | 新钱包显示名（私钥、密码交互式输入） |

**交互流程**

```
$ wallet-cli wallet import-private-key
? Enter master password (hidden input): ********
? Paste private key (64-char hex; hidden, no echo): ****************************
(validating, deriving address, encrypting to disk…)
✅ Imported "hot" TRa... (private key never seen by AI) | Set as active
```

- **步骤 1 — master password**：同助记词导入（首次设置 / 已有解锁；错误 `wrong_password`）。
- **步骤 2 — 私钥输入**：隐藏、不回显；私钥与助记词同等敏感，引导一致。
- **步骤 3 — 校验 + 落盘**：格式非法 → `invalid_private_key`，要求重输；私钥钱包不挂在任何 HD 下，单独成类。
- **结束态**：导入钱包成为 active；AI 仅收到地址级回执。

### 1.4 `wallet import-ledger` —— 登记 Ledger 账户 🔒（交互式·硬件）

**用法**

```
wallet-cli wallet import-ledger --app tron|ethereum
                                (--index <n> | --path <m/44'/...> | --address <addr> [--scan-limit <n>])
                                [--label <name>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 登记 Ledger 地址为 watch-only 条目，硬件签名、私钥永不出设备；交互式设备状态机引导 + 地址选择 |
| 网络 | 本地操作（仅派生 / 登记，不访问链上节点） |
| 解锁 | 设备 PIN + 设备确认（无 master password） |
| 账户 | 登记并设为 active |
| 错误 | `device_not_found` · `app_not_open` · `user_rejected` · `device_timeout` · `device_disconnected` · `address_not_found` · `invalid_value` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--app <tron\|ethereum>` | 是 | — | Ledger app / 衍生 family（tron→tron、ethereum→evm） |
| `--index <n>` | 互斥必填 | — | HD 衍生 index（与 `--path` / `--address` 互斥） |
| `--path <m/44'/...>` | 互斥必填 | — | 明确 BIP32 路径（与 `--index` / `--address` 互斥） |
| `--address <addr>` | 互斥必填 | — | 已知地址，有界扫描反查（与 `--index` / `--path` 互斥） |
| `--scan-limit <n>` | 否 | 20 | `--address` 反查扫描上限 |
| `--label <name>` | 否 | 自动 | 账户显示名 |

> `--index` / `--path` / `--address` 三择一，多带 → `invalid_value`。

**交互流程**

```
$ wallet-cli wallet import-ledger --app tron
(detecting device…) ⚠️ Ledger detected, but the TRON app is not open
? Open the TRON app on your Ledger, then press Enter to continue ↵
Derived addresses (5 per batch by default, first selected by default):
  1. TGd...   ← default
  2. TKp...
  3. TLs...
  4. TBe...
  5. TRn...
? Select address [enter number / n for next batch]: 1
? Name this wallet: cold
✅ Registered "cold" TGd... (Ledger hardware; no private key stored locally) | Each transfer requires on-device confirmation
```

- **设备状态机**（CLI 持续轮询，按状态给下一步指令）：

  | 状态 | 提示 / 处理 | 错误码（超时或放弃时） |
  | --- | --- | --- |
  | 未检测到设备 | 提示插入并解锁 | `device_not_found` |
  | 已连接但锁定 | 提示在设备输入 PIN | — |
  | 未打开对应 App（TRON/Ethereum） | 提示打开 App（**最常见卡点**） | `app_not_open` |
  | 就绪 | 读派生地址批次 | — |
  | 等待设备确认 | 提示在设备按键 | — |
  | 用户拒绝 | 终止 | `user_rejected` |
  | 等待超时 | 受 `--timeout` 影响 | `device_timeout` |
  | 中途断连 | 提示重连后继续 | `device_disconnected` |

- **选地址子流程**：`--index` / `--path` / `--address` 三择一（多带 `invalid_value`）；交互式默认每批 5 个、默认第 1 个，可「翻下一批」换选；`--address` 走有界扫描（`--scan-limit`，默认 20）反查，扫不到 → `address_not_found`。每次导入一个，重复流程可导入多个。
- **结束态**：登记为硬件钱包条目（**只存地址 + 派生路径**，无私钥），成为 active。

### 1.5 `wallet import-watch` —— 登记观察地址（无秘密）

**用法**

```
wallet-cli wallet import-watch --address <addr> [--label <name>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 仅凭地址追踪资产，无私钥、不能签名 |
| 网络 | 本地操作（family 由地址格式自动判，不访问链上节点） |
| 解锁 | 不需要 |
| 账户 | 登记并设为 active |
| 错误 | `invalid_value`（地址格式非法） |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--address <addr>` | 是 | — | 观察地址，family 由格式自动判（`T...`→tron、`0x...`→evm） |
| `--label <name>` | 否 | 自动 | 账户显示名 |

**示例与输出**

```bash
$ wallet-cli wallet import-watch --address T... --label team-vault
# text 输出（默认）
✅ Added watch-only wallet "team-vault" T... (read-only; signing operations will be rejected)
# json 输出（-o json）
{ "ok":true,"command":"wallet.import-watch","data":{ "ref":"wlt_e5","label":"team-vault","address":"T...","type":"watch","active":true } }
```

> 后续对该钱包的签名类请求 → `watch_only_no_signer`。

### 1.6 `wallet list` —— 列出所有钱包 / 账户

**用法**

```
wallet-cli wallet list [-o text|json]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 列出本地全部钱包，按类型分组，标记 active |
| 网络 | 本地操作（不访问链上节点） |
| 解锁 | 不需要 |
| 账户 | 列出全部 |
| 错误 | — |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| （无命令专属 flag） | — | — | 仅通用全局（§0.3） |

**示例与输出**

```bash
$ wallet-cli wallet list
# text 输出（默认）
[Hot] main TQk... (HD master) ← active | hot TRa... (private key)
[Hardware] cold TGd... (Ledger)
[Watch] team-vault T...
# json 输出（-o json）
{ "ok":true,"command":"wallet.list","data":{ "wallets":[ {"ref":"wlt_b2","label":"main","address":"TQk...","type":"hd-master","active":true}, … ] } }
```

### 1.7 `wallet set-active` —— 设定 active 账户

**用法**

```
wallet-cli wallet set-active --account <ref|label|address>
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 设定 active 账户，之后命令默认作用于它 |
| 网络 | 本地操作（不访问链上节点） |
| 解锁 | 不需要 |
| 账户 | 由 `--account` 指定（命令字段，必填） |
| 错误 | `account_not_found` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--account <ref\|label\|address>` | 是 | — | 要设为 active 的账户（命令必填字段，非情境选择器） |

**示例与输出**

```bash
$ wallet-cli wallet set-active --account main
# text 输出（默认）
✅ Active wallet: main TQk...
# json 输出（-o json）
{ "ok":true,"command":"wallet.set-active","data":{ "ref":"wlt_b2","label":"main","address":"TQk..." } }
```

### 1.8 `wallet active` —— 显示目前 active 账户

**用法**

```
wallet-cli wallet active [--account <ref|label|address>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 显示当前 active 并印两链地址 |
| 网络 | 本地操作（不访问链上节点） |
| 解锁 | 不需要 |
| 账户 | 默认 active，可 `--account` 覆写来查指定账户 |
| 错误 | `account_not_found` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| （无命令专属 flag） | — | — | 仅通用全局 + 情境 `--account`（§0.3） |

**示例与输出**

```bash
$ wallet-cli wallet active
# text 输出（默认）
Active: main | tron TQk... | evm 0x91...
# json 输出（-o json）
{ "ok":true,"command":"wallet.active","data":{ "ref":"wlt_b2","label":"main","tron":"TQk...","evm":"0x91..." } }
```

### 1.9 `wallet rename` —— 改账户 / 钱包显示名

**用法**

```
wallet-cli wallet rename --account <ref|label|address> --label <name>
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 重命名，即时生效，不影响 active |
| 网络 | 本地操作（不访问链上节点） |
| 解锁 | 不需要 |
| 账户 | 由 `--account` 指定（命令字段，必填） |
| 错误 | `account_not_found` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--account <ref\|label\|address>` | 是 | — | 要改名的目标 |
| `--label <name>` | 是 | — | 新的唯一显示名 |

**示例与输出**

```bash
$ wallet-cli wallet rename --account main --label primary
# text 输出（默认）
✅ Renamed "main" → "primary"
# json 输出（-o json）
{ "ok":true,"command":"wallet.rename","data":{ "ref":"wlt_b2","label":"primary","previousLabel":"main" } }
```

### 1.10 `wallet add-account` —— seed 衍生子账户 🔒

**用法**

```
wallet-cli wallet add-account --account <seed> [--index <n>] [--label <name>] --password-stdin
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 从 seed 钱包衍生子账户，需解锁 seed |
| 网络 | 本地操作（不访问链上节点） |
| 解锁 | 需 master password（解锁 seed） |
| 账户 | 由 `--account` 指定 seed（命令字段，必填）；新子账户设为 active |
| 错误 | `wrong_password` · `account_not_found` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--account <ref\|label\|address>` | 是 | — | 要衍生的 seed 钱包 |
| `--index <n>` | 否 | 下一个空位 | 指定 HD 子账户 index（重复=幂等） |
| `--label <name>` | 否 | 自动 | 新子账户显示名 |

**示例与输出**

```bash
$ echo "$PW" | wallet-cli wallet add-account --account main --password-stdin --label sub-1
# text 输出（默认）
✅ Derived sub-account "sub-1" TWp... (shares master mnemonic; no separate backup needed) | Set as active
# json 输出（-o json）
{ "ok":true,"command":"wallet.add-account","data":{ "ref":"wlt_b2-2","label":"sub-1","address":"TWp...","type":"hd-child","parent":"wlt_b2","index":2,"active":true } }
```

### 1.11 `wallet export-address` —— 输出账户收款地址

**用法**

```
wallet-cli wallet export-address [--account <ref|label|address>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 输出账户地址用于收款；本地操作，不访问链上节点 |
| 网络 | 本地操作（`--network` 此处为**链选择器/family**，不访问链上节点；缺省两链都印） |
| 解锁 | 不需要 |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `account_not_found` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--network <net>` | 否 | 两链都印 | **链选择器**（命令字段，转成 family；非连节点，与一般绑链命令的全局 `--network` 语义不同） |

**示例与输出**

```bash
$ wallet-cli wallet export-address --account main --network nile
# text 输出（默认）
"main" tron receive address: TQk7...
# json 输出（-o json）
{ "ok":true,"command":"wallet.export-address","data":{ "label":"main","tron":"TQk7..." } }
```

### 1.12 `wallet delete` —— 删除钱包 / 账户 ⚠️（交互式）

**用法**

```
wallet-cli wallet delete --account <ref|label|address>      # 交互式二次确认
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 删除账户或钱包并清孤儿 label，不可逆；交互式校验 + 输入钱包名二次确认 |
| 网络 | 读余额时会访问链上节点 |
| 解锁 | 二次确认（输入钱包名）；非密码门槛 |
| 账户 | 由 `--account` 指定（命令字段，必填） |
| 错误 | `account_not_found`（确认串不符则中止，不删除） |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--account <ref\|label\|address>` | 是 | — | 要删除的账户或钱包 |

**交互流程**

```
$ wallet-cli wallet delete --account old
(reading wallet balance…)
⚠️ "old" TRa..., balance 230 USDT. Deleting removes the local encrypted private key and cannot be undone.
   If the mnemonic / private key isn't backed up, its funds are lost forever after deletion.
? Confirm deletion? Type the wallet name "old" to confirm: old
✅ Deleted "old" | active auto-switched to next in list: "main" TQk...
```

- **步骤 1 — 解析目标**：`--account`（ref/label/address）解析；解析不到 → `account_not_found`。
- **步骤 2 — 风险展示**：读取并展示余额 + 不可恢复警告（watch / ledger 也可删，仅删本地条目，不影响链上资产）。
- **步骤 3 — 二次确认**：需键入钱包名才执行；输入串不符 → 中止（不删除）。
- **步骤 4 — 删除 + 清理**：删除条目并清孤儿 label。
- **active 处理**：删 active 后自动切到列表下一个；删到空 → 提示创建 / 导入。

> 规格定为互动式确认；代码现况无确认 prompt 直接删（属出入项，见 §13.4）。

### 1.13 `wallet backup` —— 导出账户秘密到 0600 文件 🔒⚠️（交互式）

**用法**

```
wallet-cli wallet backup --account <ref|label|address> [--out <path>]   # 交互式密码 + 环境确认
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 把账户秘密 + metadata 写入 0600 文件；秘密永不上 stdout / log / envelope |
| 网络 | 本地操作（不访问链上节点） |
| 解锁 | 需 master password + 环境确认 |
| 账户 | 由 `--account` 指定（命令字段，必填）；watch / ledger → `watch_only_no_signer` |
| 错误 | `watch_only_no_signer` · `wrong_password` · `output_exists` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--account <ref\|label\|address>` | 是 | — | 要备份的账户 |
| `--out <path>` | 否 | `<root>/backups/<ref>-<ts>.json` | 输出文件路径；拒覆盖既有文件（`output_exists`） |

**交互流程**

```
$ wallet-cli wallet backup --account main --out ~/main-backup.json
? Enter master password (hidden input): ********
? Are you private right now — no one watching, no screen share / recording? (yes/no): yes
(verifying password, writing 0600 file…)
✅ Backed up "main" to ~/main-backup.json (0600; secret not shown on screen, never seen by AI)
   After copying it offline, delete this file soon — don't leave it on your computer.
```

- **步骤 1 — 解析目标**：`--account` 解析；watch / ledger 账户无秘密可导 → `watch_only_no_signer`。
- **步骤 2 — 密码门槛**：输入 master password 解锁；错误 → `wrong_password`。
- **步骤 3 — 环境确认**：`yes/no` 确认无人围观 / 无录屏；答 no → 中止。
- **步骤 4 — 写文件**：校验 `--out`，已存在 → `output_exists`（拒覆盖）；秘密只写 0600 文件，**不上屏、不进对话、不进 envelope**。
- **结束态**：提示抄录离线后尽快删除该文件。

> 代码现况：密码走 `--password-stdin`，无环境确认 prompt（互动式为目标，见 §13.4）。

---

## 2. config —— 本地配置（中立命令）

### 2.1 `config get` —— 读使用者设定

**用法**

```
wallet-cli config get [--key defaultOutput|timeoutMs|networks]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 读配置；可读键仅 `defaultOutput` / `timeoutMs` / `networks` |
| 网络 | 本地操作（不访问链上节点） |
| 解锁 | 不需要 |
| 账户 | 不适用 |
| 错误 | `invalid_value`（未知键） |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--key <k>` | 否 | 全部 | 要读的键；未知键 → `invalid_value` |

**示例与输出**

```bash
$ wallet-cli config get --key defaultOutput
# text 输出（默认）
defaultOutput = text
# json 输出（-o json）
{ "ok":true,"command":"config.get","data":{ "defaultOutput":"text","timeoutMs":60000 } }
```

### 2.2 `config set` —— 写使用者设定

**用法**

```
wallet-cli config set --key defaultOutput|timeoutMs --value <v>
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 写配置；可写键仅 `defaultOutput` / `timeoutMs`（enum 限制） |
| 网络 | 本地操作（不访问链上节点） |
| 解锁 | 不需要 |
| 账户 | 不适用 |
| 错误 | `invalid_value`（未知键 / 非法值） |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--key <defaultOutput\|timeoutMs>` | 是 | — | 设定键（仅此二键） |
| `--value <v>` | 是 | — | 设定值（`defaultOutput`∈`text\|json`；`timeoutMs`≥0） |

**示例与输出**

```bash
$ wallet-cli config set --key defaultOutput --value json
# text 输出（默认）
✅ Set defaultOutput = json
# json 输出（-o json）
{ "ok":true,"command":"config.set","data":{ "key":"defaultOutput","value":"json","previous":"text" } }
```

> `defaults.network`、`price:`、`networks.*.tronGridUrl` 无法用 config set 写（只能改 config.yaml，属出入项）。

---

## 3. chains —— 网络（中立命令）

### 3.1 `chains list` —— 列出已知网络与别名

**用法**

```
wallet-cli chains list
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 印 `id / family / chainId / aliases / feeModel` |
| 网络 | 本地操作（仅读本地网络表，不访问链上节点） |
| 解锁 | 不需要 |
| 账户 | 不适用 |
| 错误 | — |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| （无命令专属 flag） | — | — | 仅通用全局 |

**示例与输出**

```bash
$ wallet-cli chains list
# text 输出（默认）
mainnet (tron) alias main | nile (tron) alias testnet | base (evm) chainId 8453
# json 输出（-o json）
{ "ok":true,"command":"chains.list","data":{ "chains":[ {"id":"mainnet","family":"tron","aliases":["main"],"feeModel":"tron-resource"}, {"id":"nile","family":"tron","aliases":["testnet"]} ] } }
```

---

## 4. tron account —— 账户读类查询 + 地址簿

> 以下命令均纯读、不解锁。

### 4.1 `tron account balance` —— 查 TRX 余额

**用法**

```
wallet-cli tron account balance [--account <ref>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 查 active / 指定账户的 TRX 余额 |
| 网络 | 可选（缺省 family 预设） |
| 解锁 | 不需要（纯读） |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `account_not_found` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| （无命令专属 flag） | — | — | 仅通用全局 + 情境 `--network` / `--account` |

**示例与输出**

```bash
$ wallet-cli tron account balance --account main
# text 输出（默认）
"main" balance: 356.0 TRX
# json 输出（-o json）
{ "ok":true,"command":"tron.account.balance","network":"mainnet","data":{ "address":"TQk...","trx":356.0,"sun":"356000000" } }
```

### 4.2 `tron account resources` —— 带宽 / 能量 + 质押汇总

**用法**

```
wallet-cli tron account resources [--account <ref>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 查带宽 / 能量额度与质押、解押、可提领汇总 |
| 网络 | 可选（缺省 family 预设） |
| 解锁 | 不需要 |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `account_not_found` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| （无命令专属 flag） | — | — | 仅通用全局 + 情境 `--network` / `--account` |

**示例与输出**

```bash
$ wallet-cli tron account resources
# text 输出（默认）
"main" energy 30,000/95,000 | bandwidth 600/1,500 | unfreezing 500 TRX | withdrawable 0 | unfreeze slots left 1
# json 输出（-o json）
{ "data":{ "bandwidth":600,"energy":30000,"frozenV2":[…],"unfreezing":[{"amountSun":"500000000","expireTime":1700000000}],"withdrawableSun":"0","availableUnfreezeCount":1 } }
```

### 4.3 `tron account assets` —— 指定代币逐个查余额

**用法**

```
wallet-cli tron account assets [--tokens <list>] [--account <ref>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 按清单逐个查 TRC20 / TRC10 余额（不依赖 indexer） |
| 网络 | 可选（缺省 family 预设） |
| 解锁 | 不需要 |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `account_not_found` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--tokens <list>` | 否 | 地址簿全部 | 逗号分隔的 TRC20 合约 / TRC10 asset-id 清单 |

**示例与输出**

```bash
$ wallet-cli tron account assets --tokens TR7...,1002000
# text 输出（默认）
"main" USDT 1,204.56 | BTT 0
# json 输出（-o json）
{ "data":{ "assets":[ {"symbol":"USDT","balance":"1204.56","contract":"TR7..."},{"symbol":"BTT","balance":"0","assetId":"1002000"} ] } }
```

### 4.4 `tron account info` —— 原始账户汇总（getAccount 直通）

**用法**

```
wallet-cli tron account info [--account <ref>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 回链上原始账户（含余额 / 资源 / 质押 / 权限 / create_time 等） |
| 网络 | 可选（缺省 family 预设） |
| 解锁 | 不需要 |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `account_not_found` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| （无命令专属 flag） | — | — | 仅通用全局 + 情境 `--network` / `--account` |

**示例与输出**

```bash
$ wallet-cli tron account info --account main -o json
# text 输出（默认）
Account main TQk... | balance 356.0 TRX | created 2023-07-22 | owner 1/1 | active 1 group
# json 输出（-o json）
{ "data":{ "address":"TQk...","balance":356000000,"create_time":1690000000000,"frozenV2":[…],"account_resource":{…},"owner_permission":{…},"active_permission":[…] } }
```

### 4.5 `tron account history` —— 交易历史（依赖 TronGrid）

**用法**

```
wallet-cli tron account history [--limit <n>] [--only native|token] [--account <ref>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 查最近交易历史（依赖 TronGrid indexer） |
| 网络 | 可选（缺省 family 预设；缺 `tronGridUrl` → `indexer_not_configured`） |
| 解锁 | 不需要 |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `indexer_not_configured` · `account_not_found` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--limit <n>` | 否 | 20（上限 200） | 返回笔数 |
| `--only <native\|token>` | 否 | 全部 | native=TRX/TRC10、token=TRC20 |

**示例与输出**

```bash
$ wallet-cli tron account history --only token --limit 3
# text 输出（默认）
"main" recent transactions
| Time        | Type | Amount    | Counterparty | Status |
| 06-08 14:22 | out  | 200 USDT  | TNz...       | ✅     |
| 06-08 10:05 | in   | 500 USDT  | TRa...       | ✅     |
# json 输出（-o json）
{ "data":{ "txs":[ {"time":1717834920000,"type":"out","amount":"200","symbol":"USDT","counterparty":"TNz...","status":"success","txid":"7b2..."} ] } }
```

> 一期不含 NFT/Approval。

### 4.6 `tron account add-token` —— 加自订代币到地址簿

**用法**

```
wallet-cli tron account add-token (--contract <T...> | --asset-id <id>) [--account <ref>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 抓 symbol / decimals 把代币加入地址簿（范围 = network + account） |
| 网络 | 可选（地址簿范围 = network + account） |
| 解锁 | 不需要 |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `token_metadata_unavailable` · `token_already_listed` · `invalid_value` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--contract <T...>` | 互斥必填 | — | TRC20 合约（与 `--asset-id` 互斥） |
| `--asset-id <id>` | 互斥必填 | — | TRC10 asset-id（与 `--contract` 互斥） |

**示例与输出**

```bash
$ wallet-cli tron account add-token --contract TR7NHqMeKAxGswbDaRMt6njyD3Czbu9YJL1
# text 输出（默认）
✅ Added to token book: SUN (decimals 18)
# json 输出（-o json）
{ "ok":true,"command":"tron.account.add-token","data":{ "added":{ "symbol":"SUN","decimals":18,"contract":"TR7..." } } }
```

> 抓不到 metadata → `token_metadata_unavailable`；已在官方层 → `token_already_listed`；使用者层则幂等刷新。

### 4.7 `tron account list-tokens` —— 列地址簿（官方 + 使用者）

**用法**

```
wallet-cli tron account list-tokens [--account <ref>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 列出地址簿官方层 + 使用者层代币 |
| 网络 | 可选（缺省 family 预设） |
| 解锁 | 不需要 |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | — |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| （无命令专属 flag） | — | — | 仅通用全局 + 情境 `--network` / `--account` |

**示例与输出**

```bash
$ wallet-cli tron account list-tokens
# text 输出（默认）
[Official] USDT | USDD   [User] SUN
# json 输出（-o json）
{ "data":{ "official":["USDT","USDD"],"user":[{"symbol":"SUN","contract":"TR7...","decimals":18}] } }
```

### 4.8 `tron account remove-token` —— 从地址簿移除使用者层代币

**用法**

```
wallet-cli tron account remove-token (--contract <T...> | --asset-id <id>) [--account <ref>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 从地址簿移除使用者层代币 |
| 网络 | 可选（缺省 family 预设） |
| 解锁 | 不需要 |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `token_is_official` · `token_not_in_book` · `invalid_value` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--contract <T...>` | 互斥必填 | — | 要移除的 TRC20（与 `--asset-id` 互斥） |
| `--asset-id <id>` | 互斥必填 | — | 要移除的 TRC10（与 `--contract` 互斥） |

**示例与输出**

```bash
$ wallet-cli tron account remove-token --contract TR7...
# text 输出（默认）
✅ Removed SUN from token book
# json 输出（-o json）
{ "ok":true,"command":"tron.account.remove-token","data":{ "removed":"TR7..." } }
```

> 移官方层 → `token_is_official`；不在簿 → `token_not_in_book`。

### 4.9 `tron account portfolio` —— 原生 + 地址簿代币余额 + best-effort USD

**用法**

```
wallet-cli tron account portfolio [--account <ref>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 汇总余额并尽力换 USD（行情失败不影响余额） |
| 网络 | 可选（缺省 family 预设） |
| 解锁 | 不需要 |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `account_not_found`（行情失败不报错，仅 `priceError`） |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| （无命令专属 flag） | — | — | 仅通用全局 + 情境 `--network` / `--account` |

**示例与输出**

```bash
$ wallet-cli tron account portfolio
# text 输出（默认）
"main" Portfolio
| Token | Balance   | Value (USD) |
| TRX   | 356.0     | $46.28      |
| USDT  | 1,204.56  | $1,204.56   |
| SUN   | 12,340    | $271.48     |
Total ≈ $1,522.32
# json 输出（-o json）
{ "data":{ "priceSource":"…","assets":[ {"symbol":"TRX","balance":"356.0","valueUsd":46.28},{"symbol":"SUN","balance":"12340","valueUsd":271.48} ],"totalUsd":1522.32 } }
```

> 行情失败回 `priceSource` + 选填 `priceError`，个别 `valueUsd=null`。

---

## 5. tron token —— 代币读类查询

### 5.1 `tron token balance` —— 单代币余额

**用法**

```
wallet-cli tron token balance (--contract <T...> | --asset-id <id>) [--account <ref>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 查单一代币余额 |
| 网络 | 可选（缺省 family 预设） |
| 解锁 | 不需要 |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `invalid_value`（缺 contract / asset-id） |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--contract <T...>` | 互斥必填 | — | TRC20 合约（与 `--asset-id` 互斥） |
| `--asset-id <id>` | 互斥必填 | — | TRC10 asset-id（与 `--contract` 互斥） |

**示例与输出**

```bash
$ wallet-cli tron token balance --contract TR7...
# text 输出（默认）
"main" USDT balance: 1,204.56
# json 输出（-o json）
{ "data":{ "symbol":"USDT","balance":"1204.56","decimals":6,"contract":"TR7..." } }
```

### 5.2 `tron token info` —— 代币 metadata

**用法**

```
wallet-cli tron token info (--contract <T...> | --asset-id <id>) [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 查代币 name / symbol / decimals / totalSupply（纯 RPC 读，不碰账户） |
| 网络 | 可选（缺省 family 预设） |
| 解锁 | 不需要 |
| 账户 | 不适用（不碰账户） |
| 错误 | `token_metadata_unavailable` · `invalid_value` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--contract <T...>` | 互斥必填 | — | TRC20 合约（与 `--asset-id` 互斥） |
| `--asset-id <id>` | 互斥必填 | — | TRC10 asset-id（与 `--contract` 互斥） |

**示例与输出**

```bash
$ wallet-cli tron token info --contract TR7...
# text 输出（默认）
Token Tether USD (symbol USDT, decimals 6)
# json 输出（-o json）
{ "data":{ "name":"Tether USD","symbol":"USDT","decimals":6,"totalSupply":"...","contract":"TR7..." } }
```

---

## 6. tron tx —— 转账 / 交易

### 6.1 `tron tx send-native` —— 发送 TRX 🔒✍️

**用法**

```
wallet-cli tron tx send-native --to <T...> --amount-sun <n> --network <net>
                               [--dry-run | --sign-only] [--account <ref>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 发送 TRX（默认直接签名广播） |
| 网络 | **必填**（缺 → `missing_network`） |
| 解锁 | software 需密码 / Ledger 需设备确认 / watch → `watch_only_no_signer` |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `missing_network` · `watch_only_no_signer` · `wrong_password` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--to <T...>` | 是 | — | 收款 TRON 地址 |
| `--amount-sun <n>` | 是 | — | 金额（SUN） |
| `--dry-run` | 否 | off | 只回 plan + 费用，不签不广播（与 `--sign-only` 互斥） |
| `--sign-only` | 否 | off | 签名出 hex 不广播（喂 `tx broadcast`） |

**示例与输出**

```bash
$ echo "$PW" | wallet-cli tron tx send-native --network nile --to T... --amount-sun 1000000 --password-stdin
# text 输出（默认）
✅ Broadcast 1 TRX → T... | txid 7b2... | fee ≈ 0.27 TRX
#   （加 --dry-run 则只预览费用、不上链）
# json 输出（-o json）
{ "command":"tron.tx.send-native","network":"nile","data":{ "stage":"broadcast","to":"T...","amountSun":"1000000","txid":"7b2...","feeSun":"268000" } }
```

### 6.2 `tron tx send-token` —— 发送 TRC20 / TRC10 🔒✍️

**用法**

```
wallet-cli tron tx send-token --to <T...> --amount <n> (--contract <T...> | --asset-id <id>) --network <net>
                              [--fee-limit <sun>] [--dry-run | --sign-only] [--account <ref>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 发送 TRC20 / TRC10 代币 |
| 网络 | **必填** |
| 解锁 | software 需密码 / Ledger 需设备确认 / watch → `watch_only_no_signer` |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `missing_network` · `watch_only_no_signer` · `wrong_password` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--to <T...>` | 是 | — | 收款地址 |
| `--amount <n>` | 是 | — | 金额（代币最小单位） |
| `--contract <T...>` | 互斥必填 | — | TRC20 合约（与 `--asset-id` 互斥） |
| `--asset-id <id>` | 互斥必填 | — | TRC10 asset-id（与 `--contract` 互斥） |
| `--fee-limit <sun>` | 否 | 100000000 | 能量费上限 |
| `--dry-run` | 否 | off | 只预览，不上链（与 `--sign-only` 互斥） |
| `--sign-only` | 否 | off | 仅签名出 hex |

**示例与输出**

```bash
$ echo "$PW" | wallet-cli tron tx send-token --network nile --to T... --amount 50000000 --contract TR7... --password-stdin
# text 输出（默认）
✅ Broadcast 50 USDT → T... | txid 9c1... | energy 65,000 (shortfall burns ≈ 13.5 TRX)
#   （加 --dry-run 则预览：需能量 / 当前能量 / 缺口烧多少 TRX）
# json 输出（-o json）
{ "data":{ "stage":"broadcast","amount":"50000000","contract":"TR7...","txid":"9c1...","energy":65000 } }
```

### 6.3 `tron tx broadcast` —— 广播预签交易（不签名）✍️

**用法**

```
wallet-cli tron tx broadcast (--transaction <hex> | --tx-stdin) --network <net>
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 广播预签交易；不持私钥、不选账户 |
| 网络 | **必填** |
| 解锁 | 不需要（不持私钥） |
| 账户 | 不适用 |
| 错误 | `missing_network` · `invalid_value`（交易非法） |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--transaction <hex>` | 互斥必填 | — | 预签交易（TRON 为 JSON，argv inline） |
| `--tx-stdin` | 互斥必填 | — | 从 stdin 读预签交易（与 `--transaction` 互斥） |

**示例与输出**

```bash
$ wallet-cli tron tx broadcast --network nile --tx-stdin < signed.json
# text 输出（默认）
✅ Broadcast txid 9c1...
# json 输出（-o json）
{ "ok":true,"command":"tron.tx.broadcast","data":{ "txid":"9c1...","broadcasted":true } }
```

### 6.4 `tron tx status` —— 查交易确认状态

**用法**

```
wallet-cli tron tx status --txid <hash> [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 查交易确认状态 |
| 网络 | 可选（缺省 family 预设） |
| 解锁 | 不需要 |
| 账户 | 不适用 |
| 错误 | — |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--txid <hash>` | 是 | — | 交易 id |

**示例与输出**

```bash
$ wallet-cli tron tx status --txid abc123
# text 输出（默认）
Tx abc123 confirmed ✅ | block #66,000,000
# json 输出（-o json）
{ "data":{ "txid":"abc123","status":"confirmed","block":66000000 } }
```

### 6.5 `tron tx info` —— 查交易详情 / receipt

**用法**

```
wallet-cli tron tx info --txid <hash> [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 查交易详情 / receipt |
| 网络 | 可选（缺省 family 预设） |
| 解锁 | 不需要 |
| 账户 | 不适用 |
| 错误 | — |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--txid <hash>` | 是 | — | 交易 id |

**示例与输出**

```bash
$ wallet-cli tron tx info --txid abc123
# text 输出（默认）
Tx abc123: TXY... → TNz... | 200 USDT | success | block #66,000,000 | fee 13.5 TRX
# json 输出（-o json）
{ "data":{ "txid":"abc123","from":"TXY...","to":"TNz...","amount":"200","symbol":"USDT","status":"success","block":66000000,"feeTrx":13.5,"energyUsed":65000 } }
```

---

## 7. tron resource —— 质押与资源

> 质押生命周期：`freeze ──► unfreeze ──(赎回期)──► withdraw`；`cancel-unfreeze` 撤销待解押、`delegate / undelegate` 把资源代理给他人 / 收回。

### 7.1 `tron resource freeze` —— 质押换能量 / 带宽 🔒✍️

**用法**

```
wallet-cli tron resource freeze --amount-sun <n> [--resource energy|bandwidth] --network <net>
                                [--dry-run | --sign-only] [--account <ref>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 质押 TRX 换取能量 / 带宽 |
| 网络 | **必填** |
| 解锁 | software 需密码 / Ledger 需设备确认 / watch → `watch_only_no_signer` |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `missing_network` · `watch_only_no_signer` · `wrong_password` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--amount-sun <n>` | 是 | — | 冻结额（SUN） |
| `--resource <energy\|bandwidth>` | 否 | bandwidth | 资源类型 |
| `--dry-run` | 否 | off | 只预览，不上链（与 `--sign-only` 互斥） |
| `--sign-only` | 否 | off | 仅签名出 hex |

**示例与输出**

```bash
$ echo "$PW" | wallet-cli tron resource freeze --network nile --amount-sun 1000000000 --resource energy --password-stdin
# text 输出（默认）
✅ Staked 1,000 TRX for "energy" | txid c3d... (add --dry-run to preview estimated energy gained)
# json 输出（-o json）
{ "data":{ "stage":"broadcast","amountSun":"1000000000","resource":"energy","txid":"c3d..." } }
```

### 7.2 `tron resource unfreeze` —— 解押 🔒✍️

**用法**

```
wallet-cli tron resource unfreeze --amount-sun <n> [--resource energy|bandwidth] --network <net>
                                  [--dry-run | --sign-only] [--account <ref>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 发起解押，进入赎回等待期 |
| 网络 | **必填** |
| 解锁 | software 需密码 / Ledger 需设备确认 / watch → `watch_only_no_signer` |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `missing_network` · `watch_only_no_signer` · `wrong_password` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--amount-sun <n>` | 是 | — | 解押额（SUN） |
| `--resource <energy\|bandwidth>` | 否 | bandwidth | 资源类型 |
| `--dry-run` | 否 | off | 只预览（与 `--sign-only` 互斥） |
| `--sign-only` | 否 | off | 仅签名出 hex |

**示例与输出**

```bash
$ echo "$PW" | wallet-cli tron resource unfreeze --network nile --amount-sun 1000000000 --password-stdin
# text 输出（默认）
✅ Unstake initiated for 1,000 TRX; withdrawable after the unlock period (withdraw)
# json 输出（-o json）
{ "data":{ "stage":"broadcast","amountSun":"1000000000","resource":"energy","txid":"d4e..." } }
```

### 7.3 `tron resource withdraw` —— 提领已过等待期的解押 TRX 🔒✍️

**用法**

```
wallet-cli tron resource withdraw --network <net> [--dry-run | --sign-only] [--account <ref>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 提领已过等待期的解押 TRX 到余额 |
| 网络 | **必填** |
| 解锁 | software 需密码 / Ledger 需设备确认 / watch → `watch_only_no_signer` |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `missing_network` · `watch_only_no_signer` · `wrong_password` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--dry-run` | 否 | off | 只预览（与 `--sign-only` 互斥） |
| `--sign-only` | 否 | off | 仅签名出 hex |

**示例与输出**

```bash
$ echo "$PW" | wallet-cli tron resource withdraw --network nile --password-stdin
# text 输出（默认）
✅ Withdrew 1,000 TRX to balance
# json 输出（-o json）
{ "data":{ "stage":"broadcast","withdrawnSun":"1000000000","txid":"e5f..." } }
```

### 7.4 `tron resource cancel-unfreeze` —— 取消全部待解押（回滚 frozen）🔒✍️

**用法**

```
wallet-cli tron resource cancel-unfreeze --network <net> [--dry-run | --sign-only] [--account <ref>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 取消全部待解押，回滚为质押状态 |
| 网络 | **必填** |
| 解锁 | software 需密码 / Ledger 需设备确认 / watch → `watch_only_no_signer` |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `missing_network` · `watch_only_no_signer` · `wrong_password` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--dry-run` | 否 | off | 只预览（与 `--sign-only` 互斥） |
| `--sign-only` | 否 | off | 仅签名出 hex |

**示例与输出**

```bash
$ echo "$PW" | wallet-cli tron resource cancel-unfreeze --network nile --password-stdin
# text 输出（默认）
✅ Cancelled all pending unstakes (rolled back to staked)
# json 输出（-o json）
{ "data":{ "stage":"broadcast","txid":"f6a..." } }
```

### 7.5 `tron resource delegate` —— 代理资源给他人 🔒✍️

**用法**

```
wallet-cli tron resource delegate --receiver <T...> --amount-sun <n> [--resource energy|bandwidth]
                                  [--lock [--lock-period <blocks>]] --network <net>
                                  [--dry-run | --sign-only] [--account <ref>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 把质押所得资源代理给他人 |
| 网络 | **必填** |
| 解锁 | software 需密码 / Ledger 需设备确认 / watch → `watch_only_no_signer` |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `missing_network` · `watch_only_no_signer` · `wrong_password` · `invalid_value` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--amount-sun <n>` | 是 | — | 代理的资源额（质押 TRX 的 SUN 值） |
| `--receiver <T...>` | 是 | — | 代理对象（须 ≠ owner，否则 `invalid_value`） |
| `--resource <energy\|bandwidth>` | 否 | bandwidth | 资源类型 |
| `--lock` | 否 | off | 锁定代理（锁定期不可提前 undelegate） |
| `--lock-period <blocks>` | 否 | — | 锁定区块数（每块 3s；须搭 `--lock`，否则 `invalid_value`） |
| `--dry-run` | 否 | off | 只预览（与 `--sign-only` 互斥） |
| `--sign-only` | 否 | off | 仅签名出 hex |

**示例与输出**

```bash
$ echo "$PW" | wallet-cli tron resource delegate --network nile --receiver T... --amount-sun 1000000000 --resource energy --password-stdin
# text 输出（默认）
✅ Delegated 1,000 TRX of energy to T... | txid b7c...
# json 输出（-o json）
{ "data":{ "stage":"broadcast","receiver":"T...","amountSun":"1000000000","resource":"energy","lock":false,"txid":"b7c..." } }
```

### 7.6 `tron resource undelegate` —— 收回代理出去的资源 🔒✍️

**用法**

```
wallet-cli tron resource undelegate --receiver <T...> --amount-sun <n> [--resource energy|bandwidth] --network <net>
                                    [--dry-run | --sign-only] [--account <ref>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 收回已代理出去的资源 |
| 网络 | **必填** |
| 解锁 | software 需密码 / Ledger 需设备确认 / watch → `watch_only_no_signer` |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `missing_network` · `watch_only_no_signer` · `wrong_password` · `invalid_value` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--amount-sun <n>` | 是 | — | 收回的资源额（SUN） |
| `--receiver <T...>` | 是 | — | 原代理对象（须 ≠ owner） |
| `--resource <energy\|bandwidth>` | 否 | bandwidth | 资源类型 |
| `--dry-run` | 否 | off | 只预览（与 `--sign-only` 互斥） |
| `--sign-only` | 否 | off | 仅签名出 hex |

**示例与输出**

```bash
$ echo "$PW" | wallet-cli tron resource undelegate --network nile --receiver T... --amount-sun 1000000000 --resource energy --password-stdin
# text 输出（默认）
✅ Reclaimed 1,000 TRX of energy delegated to T...
# json 输出（-o json）
{ "data":{ "stage":"broadcast","receiver":"T...","amountSun":"1000000000","resource":"energy","txid":"c8d..." } }
```

### 7.7 `tron resource prices` —— 能量 / 带宽单价

**用法**

```
wallet-cli tron resource prices [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 查能量 / 带宽单价 |
| 网络 | 可选（缺省 family 预设） |
| 解锁 | 不需要 |
| 账户 | 不适用 |
| 错误 | — |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| （无命令专属 flag） | — | — | 仅通用全局 + 情境 `--network` |

**示例与输出**

```bash
$ wallet-cli tron resource prices
# text 输出（默认）
Unit price — energy 420 SUN | bandwidth 1,000 SUN
# json 输出（-o json）
{ "data":{ "energyPriceSun":420,"bandwidthPriceSun":1000 } }
```

---

## 8. tron block —— 区块

### 8.1 `tron block get` —— 查区块（省略=最新）

**用法**

```
wallet-cli tron block get [--number <n>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 查区块（省略 `--number` 则取最新） |
| 网络 | 可选（缺省 family 预设） |
| 解锁 | 不需要 |
| 账户 | 不适用 |
| 错误 | — |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--number <n>` | 否 | 最新 | 区块号 |

**示例与输出**

```bash
$ wallet-cli tron block get --number 12345
# text 输出（默认）
Block #12,345 | time … | 312 txs
# json 输出（-o json）
{ "data":{ "number":12345,"hash":"0000...","timestamp":1750000000000,"txCount":312 } }
```

---

## 9. tron contract —— 合约（含 ABI）

### 9.1 `tron contract call` —— 唯读呼叫（triggerConstantContract）

**用法**

```
wallet-cli tron contract call --contract <T...> --method <sig> [--params <json>] [--account <ref>] [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 唯读呼叫合约方法（triggerConstantContract） |
| 网络 | 可选（缺省 family 预设） |
| 解锁 | 不需要（常量调用） |
| 账户 | 默认 active 作调用者，可 `--account` 覆写 |
| 错误 | `invalid_value` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--contract <T...>` | 是 | — | 合约地址 |
| `--method <sig>` | 是 | — | 方法签名，如 `balanceOf(address)` |
| `--params <json>` | 否 | — | 方法参数，JSON 阵列 `[{type,value}]` |

**示例与输出**

```bash
$ wallet-cli tron contract call --contract TR7... --method "balanceOf(address)" --params '[{"type":"address","value":"T..."}]'
# text 输出（默认）
Called balanceOf, returned: 1204560000
# json 输出（-o json）
{ "data":{ "method":"balanceOf(address)","result":["1204560000"] } }
```

### 9.2 `tron contract send` —— 写入呼叫（triggerSmartContract）🔒✍️

**用法**

```
wallet-cli tron contract send --contract <T...> --method <sig> [--params <json>]
                              [--call-value-sun <n>] [--fee-limit <sun>] --network <net>
                              [--dry-run | --sign-only] [--account <ref>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 写入呼叫合约方法（triggerSmartContract） |
| 网络 | **必填** |
| 解锁 | software 需密码 / Ledger 需设备确认 / watch → `watch_only_no_signer` |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `missing_network` · `watch_only_no_signer` · `wrong_password` · `invalid_value` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--contract <T...>` | 是 | — | 合约地址 |
| `--method <sig>` | 是 | — | 方法签名 |
| `--params <json>` | 否 | — | 方法参数，JSON 阵列 |
| `--call-value-sun <n>` | 否 | 0 | 随呼叫附带的 TRX（SUN） |
| `--fee-limit <sun>` | 否 | 100000000 | 能量费上限 |
| `--dry-run` | 否 | off | 只预览能量（estimateEnergy），不上链（与 `--sign-only` 互斥） |
| `--sign-only` | 否 | off | 仅签名出 hex |

**示例与输出**

```bash
$ echo "$PW" | wallet-cli tron contract send --network nile --contract TR7... --method "transfer(address,uint256)" --params '[...]' --password-stdin
# text 输出（默认）
✅ Broadcast contract call transfer | txid c8d... | energy 31,200 (add --dry-run to estimate energy)
# json 输出（-o json）
{ "data":{ "stage":"broadcast","method":"transfer(address,uint256)","txid":"c8d...","energyUsed":31200 } }
```

### 9.3 `tron contract deploy` —— 部署合约 🔒✍️

**用法**

```
wallet-cli tron contract deploy --abi <json> --bytecode <hex> --fee-limit <sun>
                                [--constructor-sig <sig> --params <json>] --network <net>
                                [--dry-run | --sign-only] [--account <ref>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 部署合约 |
| 网络 | **必填** |
| 解锁 | software 需密码 / Ledger 需设备确认 / watch → `watch_only_no_signer` |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `missing_network` · `watch_only_no_signer` · `wrong_password` · `invalid_value` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--abi <json>` | 是 | — | 合约 ABI（JSON） |
| `--bytecode <hex>` | 是 | — | 合约 bytecode |
| `--fee-limit <sun>` | 是 | — | 能量费上限（deploy 必填，无 default） |
| `--constructor-sig <sig>` | 否 | — | constructor 签名（与 `--params` 并用；旧名 `--constructor` 因撞 JS 保留字改名） |
| `--params <json>` | 否 | — | constructor 参数（JSON 阵列） |
| `--dry-run` | 否 | off | 只预览（与 `--sign-only` 互斥） |
| `--sign-only` | 否 | off | 仅签名出 hex |

**示例与输出**

```bash
$ echo "$PW" | wallet-cli tron contract deploy --network nile --abi '[...]' --bytecode 60... --fee-limit 1000000000 --password-stdin
# text 输出（默认）
✅ Contract deployed | address TXc... | txid b7c...
# json 输出（-o json）
{ "data":{ "stage":"broadcast","contractAddress":"TXc...","txid":"b7c..." } }
```

### 9.4 `tron contract info` —— 取合约 ABI / metadata

**用法**

```
wallet-cli tron contract info --contract <T...> [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 取合约 ABI / metadata（getContract + getContractInfo 合一） |
| 网络 | 可选（缺省 family 预设） |
| 解锁 | 不需要 |
| 账户 | 不适用 |
| 错误 | — |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--contract <T...>` | 是 | — | 合约地址 |

**示例与输出**

```bash
$ wallet-cli tron contract info --contract TR7...
# text 输出（默认）
Contract TetherToken | 12 methods (transfer/approve/balanceOf…)
# json 输出（-o json）
{ "data":{ "contract":"TR7...","name":"TetherToken","abi":["..."] } }
```

---

## 10. tron message —— 消息签名

### 10.1 `tron message sign` —— TIP-191 / V2 消息签名 🔒

**用法**

```
wallet-cli tron message sign (--message <text> | --message-stdin) [--account <ref>] [--network <net>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | TIP-191 / V2 消息签名（仅签名，不广播） |
| 网络 | 可选（离线签名可省） |
| 解锁 | software 需密码 / Ledger 需设备确认 / watch → `watch_only_no_signer` |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `watch_only_no_signer` · `wrong_password` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--message <text>` | 互斥必填 | — | 待签消息（inline，与 `--message-stdin` 互斥） |
| `--message-stdin` | 互斥必填 | — | 从 stdin 读消息（与 `--message` 互斥） |

> fd 0 互斥：`--message-stdin` 与 `--password-stdin` 都用 fd 0；要 pipe password 时消息改走 inline `--message`。

**示例与输出**

```bash
$ echo "$PW" | wallet-cli tron message sign --message "hello" --password-stdin
# text 输出（默认）
✅ Signed (account T...) | signature: 0x9f3c...
# json 输出（-o json）
{ "data":{ "address":"T...","signature":"0x9f3c...","scheme":"TIP-191" } }
```

---

## 11. evm —— 绑链命令（代码已部分实作，属出入项）

> 规格标记 EVM「一期不交付」，代码已实作下列命令（`evm contract call/send` 未做）。钱包身份与 tron 共用；情境端点覆写用 `--rpc-url`（见 §0.3）。

### 11.1 `evm account balance` —— 查原生 wei 余额

**用法**

```
wallet-cli evm account balance [--account <ref>] [--network <net>] [--rpc-url <url>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 查原生币 wei 余额 |
| 网络 | 可选（缺省 family 预设，如 base） |
| 解锁 | 不需要（纯读） |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `account_not_found` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| （无命令专属 flag） | — | — | 仅通用全局 + 情境 `--network` / `--account` / `--rpc-url` |

**示例与输出**

```bash
$ wallet-cli evm account balance --network base --account main
# text 输出（默认）
"main" balance: 0.42 ETH
# json 输出（-o json）
{ "command":"evm.account.balance","network":"base","data":{ "address":"0x91...","wei":"420000000000000000" } }
```

### 11.2 `evm tx send-native` —— 发送原生币（wei）🔒✍️

**用法**

```
wallet-cli evm tx send-native --to <0x...> --amount-wei <n> --network <net>
                              [--dry-run | --sign-only] [--account <ref>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 发送原生币（wei） |
| 网络 | **必填** |
| 解锁 | software 需密码 / Ledger 需设备确认 / watch → `watch_only_no_signer` |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `missing_network` · `watch_only_no_signer` · `wrong_password` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--to <0x...>` | 是 | — | 收款 EVM 地址 |
| `--amount-wei <n>` | 是 | — | 金额（wei） |
| `--dry-run` | 否 | off | 只预览（与 `--sign-only` 互斥） |
| `--sign-only` | 否 | off | 仅签名出 hex |

**示例与输出**

```bash
$ echo "$PW" | wallet-cli evm tx send-native --network base --to 0x... --amount-wei 1000000 --password-stdin
# text 输出（默认）
✅ Broadcast 1000000 wei → 0x... | txid 0x...
# json 输出（-o json）
{ "data":{ "stage":"broadcast","to":"0x...","amountWei":"1000000","txid":"0x..." } }
```

### 11.3 `evm tx send-token` —— 发送 ERC-20 🔒✍️

**用法**

```
wallet-cli evm tx send-token --to <0x...> --amount-wei <n> --contract <0x...> --network <net>
                             [--max-fee <wei>] [--max-priority-fee <wei>] [--gas-price <wei>]
                             [--dry-run | --sign-only] [--account <ref>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 发送 ERC-20 代币 |
| 网络 | **必填** |
| 解锁 | software 需密码 / Ledger 需设备确认 / watch → `watch_only_no_signer` |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `missing_network` · `watch_only_no_signer` · `wrong_password` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--to <0x...>` | 是 | — | 收款地址 |
| `--amount-wei <n>` | 是 | — | 金额（代币最小单位） |
| `--contract <0x...>` | 是 | — | ERC-20 合约地址 |
| `--max-fee <wei>` | 否 | — | EIP-1559 maxFeePerGas |
| `--max-priority-fee <wei>` | 否 | — | EIP-1559 maxPriorityFeePerGas |
| `--gas-price <wei>` | 否 | — | legacy gas price |
| `--dry-run` | 否 | off | 只预览（与 `--sign-only` 互斥） |
| `--sign-only` | 否 | off | 仅签名出 hex |

**示例与输出**

```bash
$ echo "$PW" | wallet-cli evm tx send-token --network base --to 0x... --amount-wei 1000000 --contract 0x... --password-stdin
# text 输出（默认）
✅ Broadcast ERC-20 → 0x... | txid 0x...
# json 输出（-o json）
{ "data":{ "stage":"broadcast","contract":"0x...","amountWei":"1000000","txid":"0x..." } }
```

### 11.4 `evm tx status` / `evm tx info` —— 查状态 / 详情

**用法**

```
wallet-cli evm tx status|info --txid <0x...> [--network <net>]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | 查交易状态 / 详情 |
| 网络 | 可选（缺省 family 预设） |
| 解锁 | 不需要 |
| 账户 | 不适用 |
| 错误 | — |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--txid <0x...>` | 是 | — | 交易 hash |

**示例与输出**

```bash
$ wallet-cli evm tx info --txid 0x... --network base
# text 输出（默认）
Tx 0x...: success | block #18,000,000 | gasUsed 21,000
# json 输出（-o json）
{ "command":"evm.tx.info","data":{ "txid":"0x...","status":"success","blockNumber":18000000,"gasUsed":"21000" } }
```

### 11.5 `evm message sign` —— EIP-191 消息签名 🔒

**用法**

```
wallet-cli evm message sign (--message <text> | --message-stdin) [--account <ref>] [--network <net>] [--password-stdin]
```

**概览**

| 项 | 内容 |
| --- | --- |
| 功能 | EIP-191 消息签名（仅签名，不广播） |
| 网络 | 可选（离线签名可省） |
| 解锁 | software 需密码 / Ledger 需设备确认 / watch → `watch_only_no_signer` |
| 账户 | 默认 active，可 `--account` 覆写 |
| 错误 | `watch_only_no_signer` · `wrong_password` |

**Flags**

| Flag | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--message <text>` | 互斥必填 | — | 待签消息（与 `--message-stdin` 互斥） |
| `--message-stdin` | 互斥必填 | — | 从 stdin 读消息（与 `--message` 互斥） |

**示例与输出**

```bash
$ echo "$PW" | wallet-cli evm message sign --message "hello" --password-stdin
# text 输出（默认）
✅ Signed (0x91...) | 0x...
# json 输出（-o json）
{ "data":{ "address":"0x91...","signature":"0x...","scheme":"EIP-191" } }
```

> 代码未实作 `evm contract call`、`evm contract send`。

---

## 12. 命令总数对照

中立：wallet ×13 ｜ config ×2 ｜ chains ×1
tron：account ×9 ｜ token ×2 ｜ tx ×5 ｜ resource ×7 ｜ block ×1 ｜ contract ×4 ｜ message ×1
evm（已实作）：account balance ｜ tx send-native/send-token/status/info ｜ message sign

---

## 13. 规格 vs 代码出入（待决策）

| # | 事项 | 现况 | 建议方向 |
| --- | --- | --- | --- |
| 13.1 | EVM 命令 | 规格说一期不做，代码已做 6 条（`contract call/send` 未做） | (a) 正式纳入一期；(b) 一期关闭注册留 code；(c) 保留并注记「实验性」 |
| 13.2 | `config set/get` 可用键 | 代码只接受 `defaultOutput` / `timeoutMs`；规格假设可设 `defaults.network` / `price:` / `tronGridUrl` | 确认是否扩充 config，还是只走 config.yaml 手改、规格据此修正 |
| 13.3 | 签名命令 wallet 需求 | 代码 `wallet=optional`（`--account` 可退回 active），规格表局部写 `req` | 以 optional 为准、改规格表（已统一为概览表「默认 active，可 --account 覆写」） |
| 13.4 | 互动式未落地 | 规格要求 create / import / delete / backup 互动式；代码用 `--*-stdin` + delete 无确认，双秘密命令因 fd 0 只能喂一个 | 一期是否接受「过渡期 stdin + delete 无确认」，还是把互动式 prompt 列为必交付 |
| 13.5 | 能力键缺登记 | 代码用 `account.tokenbook` / `account.portfolio`，规格 §7 未列 | 补进规格（纯文件） |
| 13.6 | `account history --limit` 上限 | 代码上限 200，规格只说默认 20 | 规格补「上限 200」（已补入 §4.5 表） |
| 13.7 | `--fee-limit` 默认 | `tx send-token` / `contract send` 默认 100000000，`contract deploy` 必填无默认 | 规格补各自默认 / 必填差异（已体现在各命令 Flags 表） |
| 13.8 | `--quiet` | 代码保留；会议曾提删除（与 verbose 重复） | 确认保留或删除 |
```
