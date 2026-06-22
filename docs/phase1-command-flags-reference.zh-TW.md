# Wallet CLI(TS 版)一期命令 × Flag 對照手冊

> **目的**:逐命令列出**實際可用的 flag**,每個命令一張表(flag / 說明 / 示例),並標出每命令會用到的**全域 flag**。
> **資料來源**:以**當前 TS 代碼**(`ts/src/commands/**`、`ts/src/cli/shell/index.ts`、`ts/src/app/runner/index.ts`)為準;規格基準為 [`phase1-command-spec.zh-TW.md`](./phase1-command-spec.zh-TW.md)。
> **出入**:代碼與規格不一致之處集中於文末「§X 規格 vs 代碼出入」,待決策。

---

## 0. 怎麼讀本手冊

- **flag CLI 名**:zod 欄位的 camelCase 會自動轉 kebab(`amountSun` → `--amount-sun`),表內一律寫 CLI 名。
- **必填/選填**:`*` = 必填(缺則 `missing_option`);`[x]` = 選填(有 default 或可省);`a | b` = 互斥擇一(同時帶 → `invalid_value` / `invalid_option`)。
- **全域 flag 分兩層**:
  - **通用全域**(下表)——**每個命令都能帶**,故各命令表內**不重列**,只在此處列一次。
  - **情境全域**(`--network`、`--account`、`--grpc-endpoint`、`--rpc-url`、`--no-device-wait`、`--password-stdin`、`--*-stdin`)——只在語意成立的命令才有意義,故**逐命令表內會列出該命令適用者**。
- **秘密永不進 argv**:`--password-stdin` / `--mnemonic-stdin` / `--private-key-stdin` / `--tx-stdin` / `--message-stdin` 皆為 boolean 開關,實際值由 **fd 0(stdin)**讀入,每次調用至多餵一個。

### 0.1 通用全域 flag(所有命令)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--output text\|json` / `-o` | 輸出格式;`json` 走固定 envelope。省略則用 config `defaultOutput`(預設 text) | `wallet-cli wallet list -o json` |
| `--quiet` | 抑制 stderr 診斷(不影響 data) | `wallet-cli tron account balance --quiet` |
| `--verbose` | 增加 debug 診斷 | `wallet-cli tron tx info --txid abc --verbose` |
| `--timeout <ms>` | 操作逾時(含 Ledger 等待);無效值退回 config 預設 | `wallet-cli tron tx send-native ... --timeout 30000` |
| `--help` / `-h` | 顯示命令說明(meta,短路執行) | `wallet-cli tron tx send-native --help` |
| `--json-schema` | 輸出該命令 agent JSON-schema(meta) | `wallet-cli tron token balance --json-schema` |
| `--version` | 顯示版本(根命令) | `wallet-cli --version` |

> **代碼註記**:`--help`/`--json-schema`/`--version` 由 `runner` 的 meta 短路(`hasMeta`)處理;`--output`/`--quiet`/`--verbose`/`--timeout` 在 `parseGlobals` 解析。以上對所有命令有效,以下各表不再重列。

---

## 1. 中立群組(`wallet` / `config` / `chains`,無 `--network` 連線)

> 中立命令 `network: "none"`,不連鏈。其中 `wallet export-address` 例外:它接受一個 `--network` **命令欄位**當「鏈選擇器」(轉成 family),並不真的連線。

### `wallet create` — 產生新 HD 錢包(助記詞)並加密存檔

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--label <name>]` | 新錢包顯示名 | `--label main` |
| `[--words 12\|24]` | 助記詞字數(預設 12) | `--words 24` |
| `--password-stdin` *(情境全域)* | 由 stdin 餵 master password,加密 keystore(`auth=required`) | `echo "$PW" \| wallet-cli wallet create --label main --password-stdin` |

### `wallet import-mnemonic` — 匯入既有 BIP39 助記詞(加密存檔)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--label <name>]` | 新錢包顯示名 | `--label main` |
| `--mnemonic-stdin` *(情境全域,過渡期)* | 由 stdin 餵助記詞。`TODO:interactive`,未來改互動式 | `wallet-cli wallet import-mnemonic --mnemonic-stdin < phrase.txt` |
| `--password-stdin` *(情境全域)* | master password(`auth=required`) | 見下方「雙秘密」註記 |

> **雙秘密限制**:助記詞與 password 都要走 fd 0,目前**無法在同一次非互動調用同時餵兩者**(過渡期限制,待互動式 prompt 落地)。

### `wallet import-private-key` — 匯入既有私鑰(加密存檔)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--label <name>]` | 新錢包顯示名 | `--label hot` |
| `--private-key-stdin` *(情境全域,過渡期)* | 由 stdin 餵私鑰。`TODO:interactive` | `wallet-cli wallet import-private-key --private-key-stdin < key.txt` |
| `--password-stdin` *(情境全域)* | master password(`auth=required`) | 同「雙秘密」限制 |

### `wallet import-ledger` — 登記 Ledger 帳戶(watch-only,硬體簽名)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--app tron\|ethereum` * | Ledger app / 衍生 family(`ethereum`→evm、`tron`→tron) | `--app ethereum` |
| `--index <n>` | HD 衍生 index(與 `--path`/`--address` 互斥) | `--index 0` |
| `--path <m/44'/...>` | 明確 BIP32 路徑(與 `--index`/`--address` 互斥) | `--path "m/44'/195'/0'/0/0"` |
| `--address <addr>` | 已知地址,做有界掃描反查(與 `--index`/`--path` 互斥) | `--address T...` |
| `[--scan-limit <n>]` | `--address` 反查掃描上限(預設 20) | `--scan-limit 50` |
| `[--label <name>]` | 帳戶顯示名 | `--label cold` |

> `auth=none`(無秘密)。`--index`/`--path`/`--address` 三擇一,多帶 → `invalid_value`;掃描過程 `awaiting_device`,需硬體確認地址。

### `wallet import-watch` — 登記觀察地址(無秘密)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--address <addr>` * | 觀察地址,family 由格式自動判(`T...`→tron、`0x...`→evm) | `--address T...` |
| `[--label <name>]` | 帳戶顯示名 | `--label team-vault` |

### `wallet list` — 列出所有錢包/帳戶與 active 標記

| Flag | 說明 | 示例 |
| --- | --- | --- |
| (無命令 flag) | 僅通用全域 | `wallet-cli wallet list -o json` |

### `wallet set-active` — 設定 active 帳戶

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--account <ref\|label\|address>` * | 要設為 active 的帳戶(此處為**命令必填欄位**,非全域選擇器) | `--account main` |

### `wallet active` — 顯示目前 active 帳戶

| Flag | 說明 | 示例 |
| --- | --- | --- |
| (無命令 flag) | `wallet=optional`;讀目前 active 並印兩鏈地址 | `wallet-cli wallet active` |
| `--account <…>` *(情境全域,選用)* | 覆寫 active 來查指定帳戶 | `--account main` |

### `wallet export-address` — 輸出帳戶收款地址

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--network <net>]` | **鏈選擇器**(命令欄位,轉成 family;省略=兩條鏈都印)。不連線 | `--network nile`(只印 tron 地址) |
| `--account <…>` *(情境全域,選用)* | 指定要輸出地址的帳戶(覆寫 active) | `--account main` |

> **注意**:此命令的 `--network` 是**命令欄位**,語意與一般綁鏈命令的全域 `--network` 不同(不連節點)。

### `wallet rename` — 改帳戶/錢包顯示名

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--account <ref\|label\|address>` * | 要改名的目標 | `--account main` |
| `--label <name>` * | 新的唯一顯示名 | `--label primary` |

### `wallet add-account` — seed 衍生子帳戶

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--account <ref\|label\|address>` * | 要衍生的 seed 錢包 | `--account main` |
| `[--index <n>]` | 指定 HD 子帳戶 index(省略=下一個空位;重複=冪等) | `--index 3` |
| `[--label <name>]` | 新子帳戶顯示名 | `--label sub-1` |
| `--password-stdin` *(情境全域)* | master password(`auth=required`,衍生需解鎖 seed) | `echo "$PW" \| wallet-cli wallet add-account --account main --password-stdin` |

### `wallet delete` — 刪除錢包/帳戶並清孤兒 label

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--account <ref\|label\|address>` * | 要刪除的帳戶或錢包 | `--account old` |

> 規格定為互動式刪除確認;當前代碼**未做確認 prompt**(見出入 §X)。

### `wallet backup` — 匯出帳戶秘密+metadata 到 0600 檔

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--account <ref\|label\|address>` * | 要備份的帳戶 | `--account main` |
| `[--out <path>]` | 輸出檔路徑(省略=`<root>/backups/<ref>-<ts>.json`);拒覆蓋既有檔(`output_exists`) | `--out ~/main-backup.json` |
| `--password-stdin` *(情境全域)* | master password(`auth=required`,讀出秘密) | `echo "$PW" \| wallet-cli wallet backup --account main --password-stdin` |

> 秘密只寫進 0600 檔,**永不上 stdout/log/envelope**;watch/ledger 帳戶 → `watch_only_no_signer`。

### `config get` — 讀使用者設定

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--key <k>]` | 要讀的設定鍵(省略=全部);未知鍵 → `invalid_value` | `--key defaultOutput` |

> **可讀鍵僅**:`defaultOutput`、`timeoutMs`、`networks`(代碼硬編碼;見出入 §X)。

### `config set` — 寫使用者設定

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--key defaultOutput\|timeoutMs` * | 設定鍵(**僅此二鍵**,enum 限制) | `--key defaultOutput` |
| `--value <v>` * | 設定值(`defaultOutput`∈`text\|json`;`timeoutMs`≥0) | `--value json` |

> **可寫鍵僅** `defaultOutput`、`timeoutMs`;規格提到的 `defaults.network`、`price:` **無法用 `config set` 寫**(見出入 §X)。

### `chains list` — 列出已知網路與別名

| Flag | 說明 | 示例 |
| --- | --- | --- |
| (無命令 flag) | 印 `id/family/chainId/aliases/feeModel` | `wallet-cli chains list` |

---

## 2. `tron <resource> <action>`(綁鏈)

> **情境全域**:綁鏈命令一律可帶 `--network`(動鏈命令 `required`、讀類/離線 `optional`,省略則用 family 預設網路)、`--grpc-endpoint`(單次覆寫端點);會用帳戶者可帶 `--account`;簽名命令(`auth=required`)需 `--password-stdin`(software 帳戶)且可帶 `--no-device-wait`(Ledger 帳戶)。

### 2.1 `tron account`

#### `tron account balance` — 查 TRX 餘額

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--network <net>` *(情境全域)* | 網路(`optional`,省略用預設) | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 查指定帳戶餘額(覆寫 active) | `--account main` |

#### `tron account resources` — 帶寬/能量 + 質押彙總

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 指定帳戶 | `--account main` |

> 回傳含 `bandwidth/energy/frozenV2/unfreezing/withdrawableSun/availableUnfreezeCount`(吸收 can-withdraw / available-unfreeze-count)。

#### `tron account assets` — 指定代幣逐個查餘額

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--tokens <list>]` | 逗號分隔的 TRC20 合約 / TRC10 asset-id 清單 | `--tokens TR7...,1002000` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 指定帳戶 | `--account main` |

#### `tron account info` — 原始帳戶彙總(`getAccount` 直通)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 指定帳戶 | `--account main` |

#### `tron account history` — 交易歷史(依賴 TronGrid)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--limit <n>]` | 筆數(預設 20,上限 200) | `--limit 50` |
| `[--only native\|token]` | 歷史類型過濾 | `--only token` |
| `--network <net>` *(情境全域)* | 網路;缺 `tronGridUrl` → `indexer_not_configured` | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 指定帳戶 | `--account main` |

#### `tron account add-token` — 加自訂代幣到地址簿

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--contract <T...>` \| `--asset-id <id>` * | TRC20 合約 / TRC10 asset-id(互斥擇一);抓 symbol/decimals 入簿 | `--contract TR7...` |
| `--network <net>` *(情境全域)* | 網路(地址簿範圍 = network+account) | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 地址簿所屬帳戶 | `--account main` |

> 抓不到 metadata → `token_metadata_unavailable`;已在官方層 → `token_already_listed`;使用者層則冪等刷新。

#### `tron account list-tokens` — 列地址簿(官方+使用者)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--network <net>` *(情境全域)* | 網路 | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 地址簿所屬帳戶 | `--account main` |

#### `tron account remove-token` — 從地址簿移除使用者層代幣

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--contract <T...>` \| `--asset-id <id>` * | 要移除的代幣(互斥擇一) | `--contract TR7...` |
| `--network <net>` *(情境全域)* | 網路 | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 地址簿所屬帳戶 | `--account main` |

> 移官方層 → `token_is_official`;不在簿 → `token_not_in_book`。

#### `tron account portfolio` — 原生+地址簿代幣餘額 + best-effort USD

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--network <net>` *(情境全域)* | 網路 | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 指定帳戶 | `--account main` |

> 行情失敗不影響餘額(回 `priceSource` + 選填 `priceError`,個別 `valueUsd=null`)。

### 2.2 `tron token`

#### `tron token balance` — 單代幣餘額

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--contract <T...>` \| `--asset-id <id>` * | TRC20 / TRC10(互斥擇一) | `--contract TR7...` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 查指定帳戶 | `--account main` |

#### `tron token info` — 代幣 metadata

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--contract <T...>` \| `--asset-id <id>` * | TRC20 / TRC10(互斥擇一) | `--contract TR7...` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |

> `wallet=none`(純 RPC 讀,不碰帳戶)。

### 2.3 `tron tx`

#### `tron tx send-native` — 發送 TRX

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--to <T...>` * | 收款 TRON 地址 | `--to T...` |
| `--amount-sun <n>` * | 金額(SUN) | `--amount-sun 1000000` |
| `[--dry-run]` | 只回 plan+費用,不簽不廣播(與 `--sign-only` 互斥) | `--dry-run` |
| `[--sign-only]` | 簽名出 hex 不廣播(餵 `tx broadcast`) | `--sign-only` |
| `--network <net>` *(情境全域)* | 網路(`required`,缺 → `missing_network`) | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 簽名來源帳戶(覆寫 active) | `--account main` |
| `--password-stdin` *(情境全域)* | software 帳戶解鎖(`auth=required`) | `echo "$PW" \| ... --password-stdin` |
| `--no-device-wait` *(情境全域)* | Ledger 帳戶不等待、立即失敗 | `--no-device-wait` |

#### `tron tx send-token` — 發送 TRC20/TRC10

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--to <T...>` * | 收款地址 | `--to T...` |
| `--amount <n>` * | 金額(代幣最小單位) | `--amount 1000000` |
| `--contract <T...>` \| `--asset-id <id>` * | TRC20 / TRC10(互斥擇一) | `--contract TR7...` |
| `[--fee-limit <sun>]` | 能量費上限(預設 100000000) | `--fee-limit 50000000` |
| `[--dry-run]` / `[--sign-only]` | 執行模式(互斥) | `--dry-run` |
| `--network <net>` *(情境全域)* | 網路(`required`) | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 簽名來源帳戶 | `--account main` |
| `--password-stdin` / `--no-device-wait` *(情境全域)* | 解鎖 / Ledger 控制 | `--password-stdin` |

#### `tron tx broadcast` — 廣播預簽交易(不簽名)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--transaction <hex>` \| `--tx-stdin` * | 預簽交易(TRON 為 JSON);argv inline 或 stdin(互斥) | `--tx-stdin < signed.json` |
| `--network <net>` *(情境全域)* | 網路(`required`) | `--network nile` |

> `auth=none`(不持私鑰)、`wallet=none`。

#### `tron tx status` — 查交易確認狀態

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--txid <hash>` * | 交易 id | `--txid abc123` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |

#### `tron tx info` — 查交易詳情/receipt

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--txid <hash>` * | 交易 id | `--txid abc123` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |

### 2.4 `tron resource`

> `freeze/unfreeze/withdraw/cancel-unfreeze/delegate/undelegate` 皆 `network=required`、`auth=required`;共通情境全域:`--network`(必)、`--account`(選)、`--password-stdin`(software)、`--no-device-wait`(Ledger)、`--dry-run`/`--sign-only`(互斥)。

#### `tron resource freeze` — 質押換能量/帶寬

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--amount-sun <n>` * | 凍結額(SUN) | `--amount-sun 1000000000` |
| `[--resource energy\|bandwidth]` | 資源類型(預設 bandwidth) | `--resource energy` |
| `[--dry-run]` / `[--sign-only]` | 執行模式(互斥) | `--dry-run` |

#### `tron resource unfreeze` — 解押

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--amount-sun <n>` * | 解押額(SUN) | `--amount-sun 1000000000` |
| `[--resource energy\|bandwidth]` | 資源類型(預設 bandwidth) | `--resource energy` |
| `[--dry-run]` / `[--sign-only]` | 執行模式(互斥) | `--sign-only` |

#### `tron resource withdraw` — 提領已過等待期的解押 TRX

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--dry-run]` / `[--sign-only]` | 執行模式(互斥) | `--dry-run` |

#### `tron resource cancel-unfreeze` — 取消全部待解押(回滾 frozen)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--dry-run]` / `[--sign-only]` | 執行模式(互斥) | `--dry-run` |

#### `tron resource delegate` — 代理資源給他人

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--amount-sun <n>` * | 代理的資源額(質押 TRX 的 SUN 值) | `--amount-sun 1000000000` |
| `--receiver <T...>` * | 代理對象(須 ≠ owner,否則 `invalid_value`) | `--receiver T...` |
| `[--resource energy\|bandwidth]` | 資源類型(預設 bandwidth) | `--resource energy` |
| `[--lock]` | 鎖定代理(鎖定期間不可提前 undelegate) | `--lock` |
| `[--lock-period <blocks>]` | 鎖定區塊數(每塊 3s;**須搭 `--lock`**,否則 `invalid_value`) | `--lock-period 28800` |
| `[--dry-run]` / `[--sign-only]` | 執行模式(互斥) | `--dry-run` |

#### `tron resource undelegate` — 收回代理出去的資源

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--amount-sun <n>` * | 收回的資源額(SUN) | `--amount-sun 1000000000` |
| `--receiver <T...>` * | 原代理對象(須 ≠ owner) | `--receiver T...` |
| `[--resource energy\|bandwidth]` | 資源類型(預設 bandwidth) | `--resource energy` |
| `[--dry-run]` / `[--sign-only]` | 執行模式(互斥) | `--sign-only` |

#### `tron resource prices` — 能量/帶寬單價

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |

> `auth=none`、`wallet=none`(純 RPC)。

### 2.5 `tron block`

#### `tron block get` — 查區塊(省略=最新)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--number <n>]` | 區塊號(省略=最新) | `--number 12345` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |

### 2.6 `tron contract`

#### `tron contract call` — 唯讀呼叫(triggerConstantContract)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--contract <T...>` * | 合約地址 | `--contract TR7...` |
| `--method <sig>` * | 方法簽名 | `--method "balanceOf(address)"` |
| `[--params <json>]` | 方法參數,JSON 陣列 `[{type,value}]` | `--params '[{"type":"address","value":"T..."}]'` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |

> `auth=none`、`wallet=none`(固定 read owner,不選帳戶)。

#### `tron contract send` — 寫入呼叫(triggerSmartContract)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--contract <T...>` * | 合約地址 | `--contract TR7...` |
| `--method <sig>` * | 方法簽名 | `--method "transfer(address,uint256)"` |
| `[--params <json>]` | 方法參數,JSON 陣列 | `--params '[...]'` |
| `[--call-value-sun <n>]` | 隨呼叫附帶的 TRX(SUN,預設 0) | `--call-value-sun 0` |
| `[--fee-limit <sun>]` | 能量費上限(預設 100000000) | `--fee-limit 50000000` |
| `[--dry-run]` / `[--sign-only]` | 執行模式(互斥) | `--dry-run` |
| `--network <net>` *(情境全域)* | 網路(`required`) | `--network nile` |
| `--account / --password-stdin / --no-device-wait` *(情境全域)* | 簽名帳戶 / 解鎖 / Ledger | `--password-stdin` |

#### `tron contract deploy` — 部署合約

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--abi <json>` * | 合約 ABI(JSON) | `--abi '[...]'` |
| `--bytecode <hex>` * | 合約 bytecode | `--bytecode 60...` |
| `--fee-limit <sun>` * | 能量費上限(deploy 為**必填**) | `--fee-limit 1000000000` |
| `[--constructor-sig <sig>]` | constructor 簽名(與 `--params` 並用;舊名 `--constructor` 因撞 JS 保留字改名) | `--constructor-sig "constructor(uint256)"` |
| `[--params <json>]` | constructor 參數(JSON 陣列) | `--params '[...]'` |
| `[--dry-run]` / `[--sign-only]` | 執行模式(互斥) | `--dry-run` |
| `--network <net>` *(情境全域)* | 網路(`required`) | `--network nile` |
| `--account / --password-stdin / --no-device-wait` *(情境全域)* | 簽名帳戶 / 解鎖 / Ledger | `--password-stdin` |

#### `tron contract info` — 取合約 ABI/metadata

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--contract <T...>` * | 合約地址 | `--contract TR7...` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |

> `auth=none`、`wallet=none`(`getContract` + `getContractInfo` 合一)。

### 2.7 `tron message`

#### `tron message sign` — TIP-191/V2 訊息簽名

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--message <text>` \| `--message-stdin` * | 待簽訊息;inline 或 stdin(互斥) | `--message "hello"` |
| `--network <net>` *(情境全域)* | 網路(`optional`,離線簽名) | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 簽名帳戶 | `--account main` |
| `--password-stdin` *(情境全域)* | software 帳戶解鎖(`auth=required`) | `--password-stdin` |
| `--no-device-wait` *(情境全域)* | Ledger 控制 | `--no-device-wait` |

> **fd 0 互斥**:`--message-stdin` 與 `--password-stdin` 都用 fd 0;要 pipe password 時訊息改走 inline `--message`。

---

## 3. `evm <resource> <action>`(綁鏈)

> ⚠️ **規格 §5 標記 EVM「一期不交付」,但當前代碼已實作下列 EVM 命令。** 詳見出入 §X。情境全域:`--network`、`--account`、`--rpc-url`(EVM 端點覆寫)、`--password-stdin`、`--no-device-wait`、`--dry-run`/`--sign-only`。

### `evm account balance` — 查原生 wei 餘額

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network base` |
| `--account <…>` *(情境全域,選用)* | 指定帳戶 | `--account main` |

### `evm tx send-native` — 發送原生幣(wei)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--to <0x...>` * | 收款 EVM 地址 | `--to 0x...` |
| `--amount-wei <n>` * | 金額(wei) | `--amount-wei 1000000` |
| `[--dry-run]` / `[--sign-only]` | 執行模式(互斥) | `--dry-run` |
| `--network <net>` *(情境全域)* | 網路(`required`) | `--network base` |
| `--account / --password-stdin / --no-device-wait` *(情境全域)* | 簽名帳戶 / 解鎖 / Ledger | `--password-stdin` |

### `evm tx send-token` — 發送 ERC-20

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--to <0x...>` * | 收款地址 | `--to 0x...` |
| `--amount-wei <n>` * | 金額(代幣最小單位) | `--amount-wei 1000000` |
| `--contract <0x...>` * | ERC-20 合約地址(**必填**) | `--contract 0x...` |
| `[--max-fee <wei>]` | EIP-1559 maxFeePerGas | `--max-fee 30000000000` |
| `[--max-priority-fee <wei>]` | EIP-1559 maxPriorityFeePerGas | `--max-priority-fee 1000000000` |
| `[--gas-price <wei>]` | legacy gas price | `--gas-price 20000000000` |
| `[--dry-run]` / `[--sign-only]` | 執行模式(互斥) | `--dry-run` |
| `--network <net>` *(情境全域)* | 網路(`required`) | `--network base` |
| `--account / --password-stdin / --no-device-wait` *(情境全域)* | 簽名帳戶 / 解鎖 / Ledger | `--password-stdin` |

### `evm tx status` — 查交易確認狀態

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--txid <0x...>` * | 交易 hash | `--txid 0x...` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network base` |

### `evm tx info` — 查交易詳情+receipt

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--txid <0x...>` * | 交易 hash | `--txid 0x...` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network base` |

### `evm message sign` — EIP-191 訊息簽名

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--message <text>` \| `--message-stdin` * | 待簽訊息;inline 或 stdin(互斥) | `--message "hello"` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network base` |
| `--account / --password-stdin / --no-device-wait` *(情境全域)* | 簽名帳戶 / 解鎖 / Ledger | `--password-stdin` |

> **代碼未實作**(規格 §5 列為未來、代碼亦未見):`evm contract call`、`evm contract send`。

---

## X. 規格 vs 代碼出入(待決策)

> 以下為「`phase1-command-spec.zh-TW.md` / 架構規格」與「當前 `ts/src` 代碼」對不上的點。每點附**現況**與**建議方向**,請決策。

### X.1 EVM 命令:規格說一期不做,代碼已做
- **規格**:§1 命令樹列 EVM、§5 明寫「**Phase 1 不交付**…一期命令面以 TRON 為準」。
- **代碼**:`EvmModule` 已註冊並可用 `evm account balance`、`evm tx send-native/send-token/status/info`、`evm message sign`(`evm contract call/send` 未做)。
- **決策**:(a) 把 EVM 正式納入一期、規格 §5 改寫;或 (b) 一期關閉 EVM 命令註冊(留 code 待後續);或 (c) 保留現狀並在規格註記「EVM 已提前落地、屬實驗性」。

### X.2 `config set` / `config get` 可用鍵與規格不符
- **規格**:§0/§3 假設可用 `defaults.network` 覆寫預設網路、`price:`(§3.1/§7)換行情源、`networks.<id>.tronGridUrl`(§7)設 indexer。
- **代碼**:`config set` 的 `--key` 是 enum,**只接受 `defaultOutput`、`timeoutMs`**;`config get` 只讀 `defaultOutput/timeoutMs/networks`。`defaults.network`、`price:`、`tronGridUrl` **無法經 CLI 設定**(只能手改 `config.yaml`)。
- **決策**:是否擴充 `config set/get` 支援 `defaults.network` / `price.*` / `networks.*.tronGridUrl`?還是這些刻意只走 `config.yaml` 手改、規格據此修正?

### X.3 簽名命令 `wallet` 需求:規格表寫 `req`,§0 與代碼皆為 `optional`
- **規格**:§0 明定 `wallet` 只有 `opt`/`—` 兩態(`--account` 永遠可退回 active,**從不必填**);但 §3.3/§3.4/§3.6 的「wallet · auth」欄卻寫 `req · req`(如 `tx send-native`、`resource freeze`、`contract send`)。
- **代碼**:這些命令一律 `wallet: "optional"`(與 §0 一致)。
- **決策**:確認以 §0/代碼為準(`wallet=optional`),並把 §3.3/§3.4/§3.6 表內的 `req` 改為 `opt`?(我判斷這是規格表筆誤,傾向改規格。)

### X.4 `wallet delete` / import 類「互動式」尚未落地
- **規格**:§2/§6 要求 `wallet delete` 互動式刪除確認;`import-mnemonic`/`import-private-key`/`backup` 走互動式隱藏輸入。
- **代碼**:互動式 prompt 子系統**未實作**。`delete` **無確認步驟**直接刪;import/backup 暫用 `--mnemonic-stdin`/`--private-key-stdin`/`--password-stdin`(標 `TODO:interactive`),且雙秘密命令(import-mnemonic/private-key)因 fd 0 只能餵一個,**非互動下實際不可完整執行**。
- **決策**:一期是否接受「過渡期 stdin 餵秘密 + delete 無確認」?還是把互動式 prompt 列為一期必交付?

### X.5 能力鍵 `account.tokenbook` / `account.portfolio` 未在規格 §7 列出
- **規格**:§7「能力鍵」清單未含 `account.tokenbook`、`account.portfolio`(但 §3.1 表格的 capability 欄有用)。
- **代碼**:`add-token/list-tokens/remove-token` 用 `capability: "account.tokenbook"`、`portfolio` 用 `account.portfolio`。
- **決策**:把這兩鍵補進規格 §7 能力鍵清單(純文件補齊)。

### X.6 `account history --limit` 上限
- **規格**:只說預設 20。
- **代碼**:`--limit` 預設 20、**上限 200**(超過 → 驗證錯)。
- **決策**:規格補上「上限 200」即可(純文件)。

### X.7 `tx send-token --fee-limit` 在代碼有 default
- **規格**:`[--fee-limit]` 選填,未述 default。
- **代碼**:default `100000000`(SUN)。`contract send` 同;`contract deploy` 的 `--fee-limit` **必填無 default**。
- **決策**:規格補上各自 default / 必填差異(純文件)。

> 另:已知 Nile 實測 bug(resource freeze/unfreeze、contract send/deploy 的 flag 碰撞/default 問題)見記憶 `ts-cli-nile-test-findings`,與本文件 flag 設計對照時一併留意。
