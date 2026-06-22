# Wallet CLI(TS 版)一期支援命令規格

> **目的**:列出 TS 版 Wallet CLI **一期(Phase 1)支援的命令**,作為命令面與旗標的單一對照。
> **基準架構**:[`typescript-wallet-cli-module-layered-plan.zh-TW.md`](./typescript-wallet-cli-module-layered-plan.zh-TW.md) 為唯一架構 source of truth(文法 B、flag 分類 §7.10、能力鍵 §7.9、import 模型 §7.14、輸出契約 §7.7)。本文件只談「一期有哪些命令、各要哪些 flag」。
> **範圍**:以 **TRON 為主軸**;同 intent + 同 input shape 的能力以共用 factory **EVM 順帶**(見 §5)。

---

## 0. 怎麼讀本文件

- **文法 B**:綁鏈命令 `wallet-cli <family> <resource> <action> --network <net> [flags]`(`family` ∈ `tron`/`evm`);中立命令 `wallet-cli wallet|config|chains [action]`(無 `--network`)。
- **flag 標記**(命令表的 flags 欄):`*` = 必填、`[x]` = 選填、`a|b` = 互斥擇一。`--account` 等全域旗標不重列於每命令,定義見 §4 flag 表。
- **需求三碼**(`net · wallet · auth`)——每碼講的都是「**對應的 flag** 該不該必填」,值統一為:`req`=必填,省略就報錯(無 default)/ `opt`=選填,省略則退回某個 default / `—`=不適用(沒這個 flag)。每個欄位只會用到語意上講得通的子集:`network` 三態都有、`wallet` 只有 `opt`/`—`(`--account` 永遠有 active 可退,從不必填)、`auth` 只有 `req`/`—`(密碼沒有「預設值」可退)。三者各問一件事:
  - **net** = 要不要 `--network`?**動鏈命令**(`tx send-*`/`broadcast`、`resource freeze|unfreeze|withdraw|cancel-unfreeze`、`contract send|deploy`)`req`;**讀類查詢/離線簽名**(各 query、`contract call`、`message sign`)`opt`——省略則用 family 預設網路(內建 mainnet,config `defaults.network` 可覆寫;架構 §7.5);中立命令 `—`。family 一律由 positional(`tron`/`evm`)決定,無需依 source type 分支。
  - **wallet** = 這個命令**會不會用到帳戶**?只有 `opt`/`—` 兩態(無 `req`,因為 `--account` 永遠可省略→退回 active):`—` 完全不碰帳戶(`wallet list`、`chains list`、純 RPC 讀如 `token info`/`contract call`/`block get`);`opt` 會用到帳戶——不帶 `--account` 就用 active、帶了就覆寫,查/簽的是**你自己的**帳戶(無任意地址查詢)。你若連一個錢包都沒有,才會提前報 `missing_wallet_address`(= 連 default 都沒有)。
  - **auth** = 要不要用 **master password 解鎖秘密**?`—` 純讀不解鎖;`req` 要解鎖才能簽名/讀出秘密/加密新檔(`tx send-*`、`wallet backup`、`wallet create`)。
  - 兩者獨立:`account balance` = `wallet opt · auth —`(會用到帳戶但不解鎖秘密);`wallet create` = `wallet — · auth req`(不選既有帳戶但要密碼加密)。`auth=req` 的簽名命令走 `TxPipeline`,**預設即簽名並上鏈**;`--dry-run` 只回 plan+費用、`--sign-only` 出 hex 不廣播;詳見 §6。
- **一期排除**(二期/不做):多簽、投票 SR/領獎、提案、TRC10 發行、Bancor/market、GasFree、NFT、DApp 瀏覽器。(USD 估值由 `account portfolio` 以 **best-effort** 行情 service 提供,見 §3.1 / §7;非完整行情/歷史。)

---

## 1. 命令樹總覽

```text
wallet-cli
├─ wallet   create | import-mnemonic | import-private-key | import-ledger | import-watch
│           | list | set-active | active | rename | add-account | export-address | delete | backup
├─ config   get | set
├─ chains   list
├─ tron <resource> <action> --network <tron-net>
│  ├─ account   balance | resources | assets | info | history | add-token | list-tokens | remove-token | portfolio
│  ├─ token     balance | info
│  ├─ tx        send-native | send-token | broadcast | status | info
│  ├─ resource  freeze | unfreeze | withdraw | cancel-unfreeze | delegate | undelegate | prices
│  ├─ block     get
│  ├─ contract  call | send | deploy | info
│  └─ message   sign
└─ evm <resource> <action> --network <evm-net>   # 順帶,同 intent 共用;見 §5
   ├─ account   balance
   ├─ tx        send-native | send-token | status | info
   ├─ contract  call | send
   └─ message   sign
```

> **命名原則**:grammar B 的 `<resource> <action>` namespace 已承載 `balance`/`v2`/`expire` 等限定詞,故 action 只留語義核心(Java 的 `withdraw-expire-unfreeze`→`withdraw`、`cancel-all-unfreeze-v2`→`cancel-unfreeze`、`get-contract`+`get-contract-info`→`contract info`)。查詢類能塞進既有讀命令回傳的就不另開命令(可提領金額/可解押次數併入 `account resources`)。

---

## 2. 中立群組命令(無 `--network`)

| 命令 | 能力(一句話) | wallet · auth | 主要 flags |
| --- | --- | --- | --- |
| `wallet create` | 產生新 HD 錢包(助記詞)並加密存檔 | — · req | `[--label]` `[--words 12\|24]` + `--password-stdin` |
| `wallet import-mnemonic` | 匯入既有助記詞(BIP39)並加密存檔(🗣️ 互動式) | — · req | `[--label]`(助記詞與 master password 皆互動式隱藏輸入,見 §6) |
| `wallet import-private-key` | 匯入既有私鑰並加密存檔(🗣️ 互動式) | — · req | `[--label]`(私鑰與 master password 皆互動式隱藏輸入,見 §6) |
| `wallet import-ledger` | 登記 Ledger(watch-only,簽名走硬體;**無秘密、不需 master password**;🗣️ 互動式僅地址選擇/命名,非秘密輸入) | — · — | `--app*`、`--index\|--path\|--address`(三擇一)、`[--scan-limit]`、`[--label]` |
| `wallet import-watch` | 登記觀察地址(無秘密) | — · — | `--address*`、`[--label]` |
| `wallet list` | 列出所有錢包/帳戶與 active 標記 | — · — | (無) |
| `wallet set-active` | 設定 active 帳戶 | — · — | `--account*` |
| `wallet active` | 顯示目前 active 帳戶(與 set-active 成對) | opt · — | (無) |
| `wallet rename` | 改帳戶/錢包顯示名 | — · — | `--account*`、`--label*` |
| `wallet add-account` | seed 衍生子帳戶(僅 seed;預設下一個空 index,可 `--index` 指定) | — · req | `--account*`(指要衍生的 seed 錢包)、`[--index]`、`[--label]` |
| `wallet export-address` | 輸出帳戶地址(收款用);`--network` 決定哪條鏈(轉成 family),省略=兩條鏈 | opt · — | `[--account]`、`[--network <net>]` |
| `wallet delete` | 刪除錢包/帳戶並清 labels 孤兒(🗣️ 互動式) | — · — | `--account*`(帳戶或錢包;刪除確認互動式輸入) |
| `wallet backup` | 匯出帳戶秘密+metadata 到 0600 檔(秘密永不上 stdout;🗣️ 互動式) | — · req | `--account*`、`[--out <path>]`(省略=`<root>/backups/<ref>-<ts>.json`;不覆蓋既有檔)(master password 互動式隱藏輸入,見 §6) |
| `config get` | 讀使用者設定 | — · — | `[--key]` |
| `config set` | 寫使用者設定 | — · — | `--key*`、`--value*` |
| `chains list` | 列出已知網路與別名 | — · — | (無) |

> **import 拆四條而非單一 `--type`**:必填 discriminator 在 grammar B 下拆成獨立 action 更乾淨(對齊 `set-active`/`add-account` 命名),且各自必填 flag 與 `auth` 需求無條件化(助記詞/私鑰要密碼加密、ledger/watch 無秘密)。1:1 對應 Keystore 的 `import`/`registerLedger`/`registerWatch`。
> **`import-mnemonic`/`import-private-key` 為互動式**:助記詞/私鑰與 master password 兩個秘密皆改走**互動式隱藏輸入**,不經 flag/argv/stdin pipe(見 §6)。(過渡期 code 暫以 `--*-stdin` 餵秘密、標 `TODO:interactive`,待互動式 prompt 子系統落地。)
> **`import-watch`**:`--address` 的 family 由格式自動判(`T...`→tron、`0x...`→evm);無秘密、無檔;讀類命令照常,簽名類 → `watch_only_no_signer`(架構 §7.14.2)。
> **`import-ledger`**:`--app tron\|ethereum` + `--index`/`--path`/`--address` 三擇一(架構 §7.14.1);簽名時硬體按鍵確認,無獨立 Ledger 命令。

---

## 3. `tron` 綁鏈命令(`net`:動鏈命令 `req`、讀類查詢/離線簽名 `opt`)

> **net 逐命令**:會上鏈的(`tx send-*`/`broadcast`、`resource freeze|unfreeze|withdraw|cancel-unfreeze`、`contract send|deploy`)`net=req`,缺 `--network` → `missing_network`;其餘讀類查詢、`contract call`、`resource prices`、`message sign` 為 `net=opt`,省略 `--network` 時用 family 預設網路(架構 §7.5)。

### 3.1 `tron account`(純 RPC + 本地代幣地址簿,`auth = —`)

| 命令 | 能力 | wallet | capability | 主要 flags |
| --- | --- | --- | --- | --- |
| `account balance` | 查 TRX 餘額(SUN/TRX) | opt | `account.balance.native` | `[--account]` |
| `account resources` | bandwidth/energy + 待解押/可提領彙總 | opt | `resources.bandwidth`/`resources.energy` | `[--account]` |
| `account assets` | 指定代幣餘額逐個查並匯總(不依賴 indexer) | opt | `account.balance.token` | `[--account]`、`[--tokens]` |
| `account info` | 原始帳戶彙總(`getAccount` 直通) | opt | — | `[--account]` |
| `account history` | 交易歷史列表(**依賴 TronGrid**,見 §7) | opt | — | `[--account]`、`[--limit]`、`[--only native\|token]` |
| `account add-token` | 加自訂代幣到地址簿(network+account 範圍;抓 symbol/decimals 存簿) | opt | `account.tokenbook` | `[--account]`、`--contract\|--asset-id*` |
| `account list-tokens` | 列地址簿(官方+使用者層;不拉餘額/不接行情) | opt | `account.tokenbook` | `[--account]` |
| `account remove-token` | 從地址簿移除使用者層代幣 | opt | `account.tokenbook` | `[--account]`、`--contract\|--asset-id*` |
| `account portfolio` | 原生 TRX + 地址簿代幣餘額 + best-effort USD 估值 | opt | `account.portfolio` | `[--account]` |

> `resources` 回傳吸收 Java 的 `get-can-withdraw-unfreeze-amount` / `get-available-unfreeze-count`:`{ bandwidth, energy, frozenV2:[...], unfreezing:[{amountSun,expireTime}], withdrawableSun, availableUnfreezeCount }`。
> **代幣地址簿(token-book)**:兩層 —— **官方層**(內建、per-network:`tron:mainnet` 預設 USDT/USDC,`nile`/`shasta` 僅原生)+ **使用者層**(`tokens.json`,per **network+account**,`add-token`/`remove-token` 寫)。`list-tokens`/`portfolio` 取兩層聯集(官方優先、`kind+id` 去重、各列標 `source: official|user`)。**原生 TRX 不入簿**——`portfolio` 永遠首列原生(`getNativeBalance`,decimals 6)。`add-token` 抓不到 symbol/decimals → `token_metadata_unavailable`;目標已在官方層 → `token_already_listed`(已在使用者層則**冪等刷新** metadata);`remove-token` 移官方 → `token_is_official`、不在簿 → `token_not_in_book`。`--contract`(TRC20)/`--asset-id`(TRC10)互斥擇一(同 `token balance`)。
> **USD 估值(best-effort)**:`portfolio` 經 `PriceProvider`(預設 CoinGecko:原生 `ids=tron`、TRC20 by contract;**TRC10 無價=null**)估 USD;**價格失敗不影響餘額**——回 `priceSource` + 選填 `priceError`、個別 `valueUsd=null`、`totalValueUsd` 對 null 安全求和。`portfolio` **列出地址簿全部代幣(含餘額 0)**,不隱藏 dust。來源/金鑰/關閉由 `config.yaml` `price:` 設定(架構 §7.5/§7.17),`provider: none` 全回 null。

### 3.2 `tron token`(純 RPC,`auth = —`)

| 命令 | 能力 | wallet | capability | 主要 flags |
| --- | --- | --- | --- | --- |
| `token balance` | 單代幣餘額 | opt | `account.balance.token` | `[--account]`、`--contract\|--asset-id*` |
| `token info` | 代幣 metadata(name/symbol/decimals/totalSupply) | — | `account.balance.token` | `--contract\|--asset-id*` |

> **TRC-10 / TRC-20 合一,旗標區分**:`--contract`(TRC20 合約地址)與 `--asset-id`(TRC10 數字 id)互斥;命令依旗標選 codec。

### 3.3 `tron tx`(`send-*` 簽名、其餘純 RPC)

| 命令 | 能力 | wallet · auth | capability | 主要 flags |
| --- | --- | --- | --- | --- |
| `tx send-native` | 發送 TRX | opt · req | `tx.native.transfer` | `--to*`、`--amount-sun*`、`[--dry-run]`、`[--sign-only]` |
| `tx send-token` | 發送 TRC20/TRC10 | opt · req | `tx.token.transfer` | `--to*`、`--amount*`、`--contract\|--asset-id*`、`[--fee-limit]`、`[--dry-run]`、`[--sign-only]` |
| `tx broadcast` | 廣播預簽交易(不簽名) | — · — | `tx.broadcast` | `--transaction\|--tx-stdin*`(交易 hex 走 argv inline 或 stdin) |
| `tx status` | 查交易確認狀態 | — · — | — | `--txid*` |
| `tx info` | 查交易詳情/receipt | — · — | — | `--txid*` |

> **費用/能量預估**(不另開命令):`send-*` 的 `--dry-run` 回真實 `{ feeModel:"tron-resource", bandwidth, energy, feeSunIfBurned }`(capability `tx.estimate`)。
> **解耦簽名/廣播**:`send-* --sign-only` 出 hex,`tx broadcast` 消費,支撐離線/冷簽;`broadcast` 本身 `auth=—`(不持私鑰)。多簽組裝的 hex 來源為二期。
> **收款展示**:復用 `wallet export-address`(TRON 地址即收款地址)。

### 3.4 `tron resource`(`freeze`/`unfreeze`/`withdraw`/`cancel-unfreeze`/`delegate`/`undelegate` 簽名)

| 命令 | 能力 | wallet · auth | capability | 主要 flags |
| --- | --- | --- | --- | --- |
| `resource freeze` | 質押換能量/帶寬(FreezeBalanceV2) | opt · req | `staking.freeze` | `--amount-sun*`、`[--resource energy\|bandwidth]`、`[--dry-run]`、`[--sign-only]` |
| `resource unfreeze` | 解押(UnfreezeBalanceV2) | opt · req | `staking.freeze` | `--amount-sun*`、`[--resource energy\|bandwidth]`、`[--dry-run]`、`[--sign-only]` |
| `resource withdraw` | 提領已過等待期的解押 TRX(閉合循環) | opt · req | `staking.freeze` | `[--dry-run]`、`[--sign-only]` |
| `resource cancel-unfreeze` | 取消全部待解押、回滾為 frozen | opt · req | `staking.freeze` | `[--dry-run]`、`[--sign-only]` |
| `resource delegate` | 把已質押資源代理給他人(DelegateResourceV2) | opt · req | `staking.delegate` | `--amount-sun*`、`--receiver*`、`[--resource energy\|bandwidth]`、`[--lock]`、`[--lock-period <blocks>]`、`[--dry-run]`、`[--sign-only]` |
| `resource undelegate` | 收回代理出去的資源(UnDelegateResourceV2) | opt · req | `staking.delegate` | `--amount-sun*`、`--receiver*`、`[--resource energy\|bandwidth]`、`[--dry-run]`、`[--sign-only]` |
| `resource prices` | 能量/帶寬單價(供費用換算 SUN) | — · — | `resources.energy`/`resources.bandwidth` | (無) |

> 採 Stake 2.0;完整循環 = `freeze → unfreeze →(等待期)→ withdraw`,`cancel-unfreeze` 為回滾。可提領額/可解押次數查 `account resources`。
> **代理(delegate)是質押之上的一層**:只移轉資源的「使用權」給 `--receiver`,**不動本金**;`amount-sun` 與 freeze 同單位(質押 TRX 的 SUN 值)。被代理的資源**無法 unfreeze**——須先 `undelegate` 收回才可解押。`--lock` 鎖定代理(`--lock-period` 鎖定區塊數,每塊 3s;鎖定期間不可提前 undelegate;`--lock-period` 須搭 `--lock`,否則 `invalid_value`)。`--receiver` 不得等於 owner。

### 3.5 `tron block`(純 RPC,`auth = —`)

| 命令 | 能力 | wallet | capability | 主要 flags |
| --- | --- | --- | --- | --- |
| `block get` | 查區塊(省略=最新),作連線健檢/確認 | — | — | `[--number]` |

### 3.6 `tron contract`(`send`/`deploy` 簽名、`call`/`info` 純 RPC)

| 命令 | 能力 | wallet · auth | capability | 主要 flags |
| --- | --- | --- | --- | --- |
| `contract call` | 唯讀呼叫(triggerConstantContract;固定 read owner,不選帳戶) | — · — | `contract.call` | `--contract*`、`--method*`、`[--params]` |
| `contract send` | 寫入呼叫(triggerSmartContract) | opt · req | `contract.call` | `--contract*`、`--method*`、`[--params]`、`[--call-value-sun]`、`[--fee-limit]`、`[--dry-run]`、`[--sign-only]` |
| `contract deploy` | 部署合約 | opt · req | `contract.deploy` | `--abi*`、`--bytecode*`、`--fee-limit*`、`[--constructor-sig]`、`[--params]`、`[--dry-run]`、`[--sign-only]` |
| `contract info` | 取合約 ABI/metadata(`get-contract`+`get-contract-info` 合一) | — · — | `contract.call` | `--contract*` |

> `call`/`send` 是 `token`/`resource` 等具名命令的底層能力;`info` 取回的 ABI 可餵 `call`/`send` 省去手填 signature;`send --dry-run` 的 energy 預估走 `estimateEnergy`。

### 3.7 `tron message`(`net = opt`)

| 命令 | 能力 | wallet · auth | capability | 主要 flags |
| --- | --- | --- | --- | --- |
| `message sign` | TIP-191/V2 訊息簽名 | opt · req | `message.sign` | `--message\|--message-stdin*`(訊息走 argv inline 或 stdin;auth=req 的 password 走 `--password-stdin`,與 `--message-stdin` 互斥於 fd 0) |

---

## 4. Flag 表(意義 + 用到的命令)

> 分類對齊架構 §7.10。同一 flag 在不同命令語義不同者於描述中註明。秘密類旗標永不進 argv:**只接受 `--*-stdin`(讀 fd 0,每次調用至多一個秘密占用)**,每來源讀一次。需要第二個秘密的命令(`import-mnemonic`/`import-private-key`/`backup`)改走**互動式隱藏輸入**(見 §6 / 架構 §7.13.1),不再有 `--*-file`/`/dev/fd/N` 多-fd 通道。

| Flag | 類別 | 意義(per-command 差異註明) | 用到的命令 |
| --- | --- | --- | --- |
| `--output text\|json` | 全域 | 輸出格式;`json` 走固定 envelope | 所有命令 |
| `--network <id\|alias>` | 全域 | 選網路(canonical 或別名);動鏈命令(`net=req`)必帶,讀類/離線簽名(`net=opt`)選填——省略則用 family 預設(內建 mainnet,config `defaults.network` 可覆寫);family 須與 positional 一致。`wallet export-address` 下作**鏈選擇器**(轉成 family,省略=兩條鏈) | 所有 `tron`/`evm` 命令 + `wallet export-address` |
| `--account <ref\|label\|address>` | 全域(選擇器) | 指定操作帳戶/錢包,覆寫 active;**所有命令**皆可用。形狀自動判:`wlt_`開頭→ref、`T...`/`0x...`→比對 cache 地址(唯一)、其餘→label。一般命令=簽名/查詢來源;`wallet rename/delete/backup/export-address` 下=**被操作目標**。解析到多帳戶 seed 的 wallet 層 → 報錯要求指定 account(簽名路徑不替你猜);單帳戶錢包(privateKey/ledger/watch)wallet==account 直接用 | tron 簽名/查詢命令、`wallet set-active/rename/add-account/delete/backup/export-address` |
| `--quiet` | 全域 | 抑制 stderr 診斷(不影響 data) | 所有命令 |
| `--verbose` | 全域 | 增加 debug 診斷 | 所有命令 |
| `--timeout <ms>` | 全域 | 操作逾時(含 Ledger 等待確認) | 所有命令(主要影響簽名類) |
| `--no-device-wait` | 全域 | Ledger 不等待、立即失敗(自動化用) | 所有簽名命令(Ledger 帳戶) |
| `--help` / `-h` | 元 | 顯示命令說明 | 所有命令 |
| `--version` | 元 | 顯示版本 | 根命令 |
| `--json-schema` | 元 | 輸出該命令 agent JSON-schema | 所有命令 |
| `--grpc-endpoint <host:port>` | 端點覆寫 | 單次執行覆寫 TRON gRPC 端點 | `tron` 綁鏈命令 |
| `--rpc-url <url>` | 端點覆寫 | 單次執行覆寫 EVM RPC 端點 | `evm` 綁鏈命令 |
| `--password-stdin` | 含秘密 | 餵 master password(讀 fd 0),解鎖/加密 keystore。**無 env 來源**(不支援 `MASTER_PASSWORD`)。`backup`/import 類改互動式,不用此 flag | `wallet create`、所有 software 簽名命令 |
| `--tx-stdin` | 資料 | 餵預簽交易 hex(= `--transaction` 的 stdin 形式,讀 fd 0,與 `--transaction` 互斥) | `tx broadcast` |
| `--label <name>` | 命令 | 顯示名。create/import-*=新錢包名;add-account=子帳戶名;rename=新名稱 | `wallet create/import-mnemonic/import-private-key/import-ledger/import-watch/add-account/rename` |
| `--words <12\|24>` | 命令 | 助記詞字數(預設 12) | `wallet create` |
| `--address <addr>` | 命令 | import-watch=觀察地址(family 自動判);import-ledger=反查目標地址 | `wallet import-watch`、`wallet import-ledger` |
| `--app <tron\|ethereum>` | 命令 | Ledger app / 衍生 family | `wallet import-ledger` |
| `--index <n>` | 命令 | HD 衍生 index。import-ledger:與 `--path`/`--address` 互斥;add-account:指定子帳戶 index(省略=下一個空位,重複=冪等) | `wallet import-ledger`、`wallet add-account` |
| `--path <m/44'/...>` | 命令 | Ledger 衍生路徑(與 `--index`/`--address` 互斥) | `wallet import-ledger` |
| `--scan-limit <n>` | 命令 | `--address` 反查掃描上限(預設 20) | `wallet import-ledger` |
| `--out <path>` | 命令(輸出) | backup 檔輸出位置;省略=`<root>/backups/<ref>-<ts>.json`。檔含明文秘密+metadata,權限 0600,拒絕覆蓋既有檔(`output_exists`) | `wallet backup` |
| `--key <k>` | 命令 | 設定鍵 | `config get`(選填)、`config set` |
| `--value <v>` | 命令 | 設定值 | `config set` |
| `--to <addr>` | 命令 | 收款地址 | `tx send-native/send-token` |
| `--amount-sun <n>` | 命令 | 金額(SUN);轉帳=轉出額、質押=凍結額、代理=資源額 | `tx send-native`、`resource freeze/unfreeze/delegate/undelegate` |
| `--amount <n>` | 命令 | 金額(代幣最小單位) | `tx send-token` |
| `--contract <T...>` | 命令 | TRC20 合約地址;查詢/轉帳/合約/地址簿通用 | `token balance/info`、`tx send-token`、`contract call/send/info`、`account add-token/remove-token` |
| `--asset-id <id>` | 命令 | TRC10 數字 id(與 `--contract` 互斥) | `token balance/info`、`tx send-token`、`account add-token/remove-token` |
| `--fee-limit <sun>` | 命令 | 能量費上限;`tx send-token`/`contract send` 選填(預設 100000000),`contract deploy` 必填無預設 | `tx send-token`、`contract send/deploy` |
| `--resource <energy\|bandwidth>` | 命令 | 質押資源類型(預設 bandwidth) | `resource freeze/unfreeze/delegate/undelegate` |
| `--receiver <T...>` | 命令 | 資源代理對象地址(須 ≠ owner) | `resource delegate/undelegate` |
| `--lock` | 命令 | 鎖定代理(鎖定期間不可提前 undelegate) | `resource delegate` |
| `--lock-period <blocks>` | 命令 | 鎖定區塊數(每塊 3s;須搭 `--lock`) | `resource delegate` |
| `--dry-run` | 執行模式 | 只回 plan + 真實費用,不簽不廣播 | 所有簽名命令 |
| `--sign-only` | 執行模式 | 簽名輸出 hex 不廣播(餵 `tx broadcast`) | 所有簽名命令:`tx send-native/send-token`、`contract send/deploy`、`resource freeze/unfreeze/withdraw/cancel-unfreeze/delegate/undelegate` |
| `--transaction <hex>` | 命令 | 預簽交易 hex | `tx broadcast` |
| `--txid <hash>` | 命令 | 交易 id | `tx status/info` |
| `--number <n>` | 命令 | 區塊號(省略=最新) | `block get` |
| `--tokens <list>` | 命令 | 逗號分隔 contract/assetId 清單 | `account assets` |
| `--limit <n>` | 命令 | 歷史筆數(預設 20,上限 200) | `account history` |
| `--only <native\|token>` | 命令 | 歷史類型過濾 | `account history` |
| `--method <sig>` | 命令 | 方法簽名,如 `transfer(address,uint256)` | `contract call/send` |
| `--params <json>` | 命令 | call/send=方法參數;deploy=constructor 參數 | `contract call/send/deploy` |
| `--call-value-sun <n>` | 命令 | 隨呼叫附帶的 TRX(SUN),預設 0 | `contract send` |
| `--abi <json>` | 命令 | 合約 ABI(JSON) | `contract deploy` |
| `--bytecode <hex>` | 命令 | 合約 bytecode | `contract deploy` |
| `--constructor-sig <sig>` | 命令 | constructor 簽名(與 `--params` 並用;舊名 `--constructor` 因撞 JS 原型保留字而改名) | `contract deploy` |
| `--message <text>` | 命令 | 待簽訊息 | `message sign` |
| `--message-stdin` | 資料 | 由 stdin(fd 0)餵待簽訊息;與 `--message` 互斥。auth=req 的 password 亦走 fd 0(`--password-stdin`),故與本 flag 互斥——pipe password 時訊息改走 inline `--message` | `message sign` |

---

## 5. EVM 順帶(同 intent 才共用)— **一期先不實作**

> **一期不納入**:本節為**後續階段**的 EVM 順帶藍圖,**Phase 1 不交付**。下表僅作為未來規劃參考;一期命令面以 TRON 為準(§1~§4)。

凡 intent + input shape 與 TRON 一致者,以共用 factory(`modules/shared.ts`)順帶提供;旗標沿用同名,惟金額用 `--amount-wei`、費用用 `--gas-price`/`--max-fee`/`--max-priority-fee`、代幣為 ERC-20(**無 `--asset-id`**)。

| EVM 命令(後續) | 對應 TRON | 備註 |
| --- | --- | --- |
| `evm account balance` | `tron account balance` | 與 TRON 同一共享錢包身分 |
| `evm message sign` | `tron message sign` | EIP-191 / typed-data |
| `evm tx send-native` | `tron tx send-native` | 金額 `--amount-wei`;fee 旗標走 EIP-1559/legacy |
| `evm tx send-token` | `tron tx send-token` | ERC-20;`--contract` 必帶 |
| `evm tx status/info` | `tron tx status/info` | 回傳 chain-shaped |
| `evm contract call/send` | `tron contract call/send` | EVM ABI |

> **不為 EVM 做**:`account resources`、`resource *`、TRC10(`--asset-id`)、`account history`(TronGrid 專屬)、`block get`(暫不順帶)。EVM 順帶整體**留待後續階段**;屆時加命令只動該 module。

---

## 6. 認證與執行模式模型(無新命令)

- **auth 落在命令 metadata**:讀類 `auth=—`;簽名/備份 `auth=req`,`TxPipeline` 與 `wallet backup` 需要時才解鎖。
- **執行模式** = **預設即簽名並上鏈**;`--dry-run`(只回 plan+fee、不簽不廣播)與 `--sign-only`(簽名出 hex、不廣播)為兩個互斥的退讓開關,同時帶 → `invalid_option`。Ledger 另有硬體按鍵。stateless CLI 無「自動鎖定」,每次調用獨立認證。
- **訪問密碼解析**(`SecretResolver` 集中、每來源讀一次):非互動命令(`create`、software 簽名)的 master password **唯一來源 `--password-stdin`**(讀 fd 0)。**不支援 `MASTER_PASSWORD` env**(避免裸放 env / process table / shell history)。
- **stdin 至多一個輸入,需第二個秘密者改互動式**:fd 0 一次只能餵一個值。需要**兩個秘密**的命令(`import-mnemonic` = 助記詞 + password、`import-private-key` = 私鑰 + password)、以及讀出秘密的 `backup`(password)、刪除確認的 `delete`,**皆改走互動式隱藏輸入**——不經 flag/argv/stdin pipe,秘密在 TTY 直接輸入、不回顯、不入 shell history。
  > **過渡期**:互動式 prompt 子系統尚未實作;當前 code 暫以 `--*-stdin` 餵這些秘密並標 `TODO:interactive`,待 prompt 層落地後移除這些 flag。
- 非秘密的第二輸入(如 `message sign` 的訊息)走 inline argv(`--message <text>`),把 fd 0 讓給 `--password-stdin`。已移除 `--*-file` 與 `/dev/fd/N` 多-fd 通道。
- **觀察錢包**:讀類照常;任何簽名類 → `watch_only_no_signer`。
- 秘密永不進 argv / log / envelope / **stdout**。`wallet backup` 把秘密+metadata 寫進一個 0600 檔(`--out` 指定或預設 `<root>/backups/...`),stdout 只回 metadata + 寫出路徑;不覆蓋既有檔。秘密只落在該檔,不上螢幕、不入 AI context。

---

## 7. 底層支撐與外部依賴

**RpcClient(TronRpcClient)一期需備的方法**:
`getAccountResources`、`getTrc20Balance`/`getTrc10Balance`/`getTokenInfo`、`buildTrc20Transfer`/`buildTrc10Transfer`、`estimateResources`、`estimateEnergy`、`broadcastTransaction`、`getAccount`、`getBlock`、`buildFreezeV2`/`buildUnfreezeV2`/`buildWithdrawExpireUnfreeze`/`buildCancelAllUnfreezeV2`、`getEnergyPrices`/`getBandwidthPrices`、`getTransactionById`/`getTransactionInfoById`、`triggerConstantContract`/`triggerSmartContract`、`deployContract`、`getContract`/`getContractInfo`。

**能力鍵**(架構 §7.9 已宣告):`account.balance.native`/`account.balance.token`、`tx.native.transfer`/`tx.token.transfer`、`tx.estimate`/`tx.broadcast`、`message.sign`、`contract.call`/`contract.deploy`、`resources.energy`/`resources.bandwidth`、`staking.freeze`/`staking.delegate`、`account.tokenbook`(`account add-token`/`list-tokens`/`remove-token`)/`account.portfolio`(`account portfolio`)。每命令的 `capability` 鍵驅動 runtime 的 **CapabilityGate**(同 family 跨網路能力差異的閘門);一期**不提供唯讀的 `capabilities` 命令**(輸出與 `--json-schema`〔含每命令 `capability`〕+ `chains list`〔fee 模型〕重疊),agent 從那兩者取得即可。

**外部依賴**:
- **TronGrid**(`account history`):`NetworkDescriptor` 增 `tronGridUrl?`,缺值回 `indexer_not_configured`。
- **行情 API**(USD 估值,`account portfolio`):接 best-effort `PriceProvider`(L1 獨立薄 service,**不污染純 RPC 路徑**;取價失敗回 null 不報錯)。預設 CoinGecko,`config.yaml` `price:` 可換源/帶金鑰或 `provider: none` 關閉。見架構 §7.17。
- **代幣地址簿**(`account add-token`/`list-tokens`/`remove-token`/`portfolio`):`TokenBook`(L1)管 `tokens.json`(使用者層,per network+account)+ 內建官方層(per network);純本地、無秘密。見架構 §7.17。

