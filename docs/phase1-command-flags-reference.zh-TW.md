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
  - **情境全域**(`--network`、`--account`、`--grpc-endpoint`、`--rpc-url`、`--password-stdin`、`--*-stdin`)——只在語意成立的命令才有意義,故**逐命令表內會列出該命令適用者**。
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

### 0.2 輸出區塊的讀法與資料來源標記

每個命令表後附一段 **輸出**,內容為 `--output json` 的 `data` 欄位(去掉統一外殼)。標記說明:

- **JSON envelope 外殼固定**,各命令只列 `data`。成功:
  ```json
  {"schema":"wallet-cli.result.v1","success":true,"command":"<id>","data":{ /* 下列各表所示 */ },"meta":{"durationMs":0,"warnings":[]},"chain":{"family":"tron","networkId":"tron:nile","network":"nile","chainId":"nile"}}
  ```
  失敗:`{"schema":"…","success":false,"command":"<id>","error":{"code":"…","message":"…"},"meta":{…}}`。`chain` 欄只在綁鏈命令出現。
- 🟢 **實測**:輸出為 2026-06-22 對 **Nile 測試網 / Sepolia / CoinGecko** 實跑捕獲(帳戶 `TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB`)。簽名命令以 software 帳戶 + `--password-stdin` 跑;`--dry-run`/`--sign-only` 不廣播,真實廣播者已於測試網確認。
- 🔵 **模擬**:無法非互動實跑(互動式 create/import、需硬體的 ledger、或需鏈上餘額的 EVM 簽名),輸出形狀由**當前代碼**推導。
- 📡 **RPC 原文直通**:標註欄位為節點 RPC / TronGrid 索引器**原樣回傳**(僅做 key 包裝,不重塑內容),欄位集合隨節點版本而變。

---

## 1. 中立群組(`wallet` / `config` / `chains`,無 `--network` 連線)

> 中立命令 `network: "none"`,不連鏈。其中 `wallet export-address` 例外:它接受一個 `--network` **命令欄位**當「鏈選擇器」(轉成 family),並不真的連線。

> **統一帳戶 descriptor(max-disclosure)**:`create`/`import-*`/`active`/`export-address`/`set-active`/`rename`/`add-account`/`backup`/`list` 一律回傳同一形狀,只在語意成立時帶對應欄位:
> | 欄位 | 說明 |
> | --- | --- |
> | `accountId` | canonical 帳戶識別,直接回灌 `--account`(`wlt_x.0` seed / `wlt_k` privateKey·ledger·watch)。**錢包 id 不另外輸出**——就是 `accountId` 去掉 `.index`。 |
> | `label` | 顯示名(自動產生 `wallet-N` 或使用者指定) |
> | `type` | `seed` / `privateKey` / `ledger` / `watch` |
> | `index` | seed 的 HD 子索引;其餘 `null` |
> | `active` | 是否為目前 active 帳戶 |
> | `addresses` | `{tron?,evm?}`;software 兩鏈、ledger/watch 單鏈 |
> | `family`? | 單鏈帳戶(ledger/watch)的 family |
> | `path`? | ledger 的 BIP32 衍生路徑 |
> | `siblings`? | seed 同錢包的其他已知 index |
>
> 另:`create`/`import-*`/`add-account` 額外帶 `status`(`created`/`existing`),揭露 dedup / 冪等命中;`set-active` 帶 `previous`,`rename` 帶 `previousLabel`,`delete`/`backup` 見各自表格。**秘密(助記詞/私鑰)永不進 envelope。**

### `wallet create` — 產生新 HD 錢包(助記詞)並加密存檔

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--label <name>]` | 新錢包顯示名 | `--label main` |
| `--password-stdin` *(情境全域)* | 由 stdin 餵 master password,加密 keystore(`auth=required`) | `echo "$PW" \| wallet-cli wallet create --label main --password-stdin` |

> **輸出** 🔵 模擬(互動式產生助記詞,無法非互動實跑;形狀同 `import-mnemonic`)。回傳統一帳戶 descriptor + `status`(`created`=新建 / `existing`=既有 dedup 命中);助記詞**永不**回傳(只進加密 vault,用 `wallet backup` 取出)。
> ```json
> {"status":"created","accountId":"wlt_62dk5gdt.0","label":"main","type":"seed","index":0,"active":true,"addresses":{"tron":"TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB","evm":"0xe4aAd11792F7E74f1B5cbce65f9a1E207c952961"}}
> ```

### `wallet import-mnemonic` — 匯入既有 BIP39 助記詞(加密存檔)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--label <name>]` | 新錢包顯示名 | `--label main` |
| `--mnemonic-stdin` *(情境全域)* | 由 stdin 餵助記詞。缺漏時改走互動式隱藏輸入;此 flag 為非互動來源(agent/CI) | `wallet-cli wallet import-mnemonic --mnemonic-stdin < phrase.txt` |
| `--password-stdin` *(情境全域)* | master password(`auth=required`) | 見下方「雙秘密」註記 |

> **雙秘密限制**:助記詞與 password 都要走 fd 0,目前**無法在同一次非互動調用同時餵兩者**(過渡期限制,待互動式 prompt 落地)。

> **輸出** 🔵 模擬(雙秘密無法非互動實跑;seed 帳戶 ref 帶 `.0` 子索引)。descriptor + `status`:
> ```json
> {"status":"created","accountId":"wlt_62dk5gdt.0","label":"main","type":"seed","index":0,"active":true,"addresses":{"tron":"TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB","evm":"0xe4aAd11792F7E74f1B5cbce65f9a1E207c952961"}}
> ```

### `wallet import-private-key` — 匯入既有私鑰(加密存檔)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--label <name>]` | 新錢包顯示名 | `--label hot` |
| `--private-key-stdin` *(情境全域)* | 由 stdin 餵私鑰。缺漏時改走互動式隱藏輸入;此 flag 為非互動來源(agent/CI) | `wallet-cli wallet import-private-key --private-key-stdin < key.txt` |
| `--password-stdin` *(情境全域)* | master password(`auth=required`) | 同「雙秘密」限制 |

> **輸出** 🔵 模擬(雙秘密無法非互動實跑;privateKey 帳戶 ref **不帶**子索引、無 `index`/`siblings`)。descriptor + `status`:
> ```json
> {"status":"created","accountId":"wlt_879y8ktf","label":"hot","type":"privateKey","index":null,"active":true,"addresses":{"tron":"TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB","evm":"0x8c7145112ac207cc95544A930C769D468d01cD4E"}}
> ```

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

> **輸出** 🔵 模擬(需 Ledger 硬體)。descriptor + `status`;`family`/`path` 揭露衍生路徑,`addresses` 只含該 app 對應 family。
> ```json
> {"status":"created","accountId":"wlt_xxxxxxxx","label":"cold","type":"ledger","index":null,"active":true,"addresses":{"evm":"0x8c7145112ac207cc95544A930C769D468d01cD4E"},"family":"evm","path":"m/44'/60'/0'/0/0"}
> ```

### `wallet import-watch` — 登記觀察地址(無秘密)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--address <addr>` * | 觀察地址,family 由格式自動判(`T...`→tron、`0x...`→evm) | `--address T...` |
| `[--label <name>]` | 帳戶顯示名 | `--label team-vault` |

> **輸出** 🟢 實測(family 由地址格式自動判,`T...`→tron)。descriptor + `status`;再匯入同地址 → `status:"existing"`(dedup,同一 ref)。
> ```json
> {"status":"created","accountId":"wlt_pkywft0z","label":"vault","type":"watch","index":null,"active":false,"addresses":{"tron":"TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax"},"family":"tron"}
> ```

### `wallet list` — 列出所有錢包/帳戶與 active 標記

| Flag | 說明 | 示例 |
| --- | --- | --- |
| (無命令 flag) | 僅通用全域 | `wallet-cli wallet list -o json` |

> **輸出** 🟢 實測(`data` 為 descriptor 陣列;seed 含 `index`/`siblings`,privateKey/watch `index=null`)。**注意**:主鍵是 `accountId`(舊版叫 `id`/`ref`,已統一)。
> ```json
> [{"accountId":"wlt_62dk5gdt.0","label":"main","type":"seed","index":0,"active":true,"addresses":{"tron":"TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB","evm":"0xe4aAd11792F7E74f1B5cbce65f9a1E207c952961"}}]
> ```

### `wallet set-active` — 設定 active 帳戶

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--account <accountId\|label\|address>` * | 要設為 active 的帳戶(此處為**命令必填欄位**,非全域選擇器) | `--account main` |

> **輸出** 🟢 實測(回新 active 帳戶的完整 descriptor + `previous` 舊 active ref)。
> ```json
> {"previous":"wlt_62dk5gdt.0","accountId":"wlt_pkywft0z","label":"vault","type":"watch","index":null,"active":true,"addresses":{"tron":"TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax"},"family":"tron"}
> ```

### `wallet active` — 顯示目前 active 帳戶

| Flag | 說明 | 示例 |
| --- | --- | --- |
| (無命令 flag) | `wallet=optional`;讀目前 active 並印兩鏈地址 | `wallet-cli wallet active` |
| `--account <…>` *(情境全域,選用)* | 覆寫 active 來查指定帳戶 | `--account main` |

> **輸出** 🟢 實測(完整 descriptor;`--account` 可覆寫 active)。
> ```json
> {"accountId":"wlt_62dk5gdt.0","label":"main","type":"seed","index":0,"active":true,"addresses":{"tron":"TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB","evm":"0xe4aAd11792F7E74f1B5cbce65f9a1E207c952961"}}
> ```

### `wallet export-address` — 輸出帳戶收款地址

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--network <net>]` | **鏈選擇器**(命令欄位,轉成 family;省略=兩條鏈都印)。不連線 | `--network nile`(只印 tron 地址) |
| `--account <…>` *(情境全域,選用)* | 指定要輸出地址的帳戶(覆寫 active) | `--account main` |

> **注意**:此命令的 `--network` 是**命令欄位**,語意與一般綁鏈命令的全域 `--network` 不同(不連節點)。

> **輸出** 🟢 實測(完整 descriptor;`addresses` 依 `--network` family 過濾)。帶 `--network nile`(只印 tron):
> ```json
> {"accountId":"wlt_62dk5gdt.0","label":"main","type":"seed","index":0,"active":true,"addresses":{"tron":"TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB"},"siblings":[1]}
> ```
> 省略 `--network`(兩鏈都印):`addresses` 含 `tron`+`evm`。

### `wallet rename` — 改帳戶/錢包顯示名

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--account <accountId\|label\|address>` * | 要改名的目標 | `--account main` |
| `--label <name>` * | 新的唯一顯示名 | `--label primary` |

> **輸出** 🟢 實測(完整 descriptor + `previousLabel` 舊名;`label` 已是新名)。
> ```json
> {"previousLabel":"vault","accountId":"wlt_pkywft0z","label":"vault2","type":"watch","index":null,"active":true,"addresses":{"tron":"TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax"},"family":"tron"}
> ```

### `wallet add-account` — seed 衍生子帳戶

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--account <accountId\|label\|address>` * | 要衍生的 seed 錢包 | `--account main` |
| `[--index <n>]` | 指定 HD 子帳戶 index(省略=下一個空位;重複=冪等) | `--index 3` |
| `[--label <name>]` | 新子帳戶顯示名 | `--label sub-1` |
| `--password-stdin` *(情境全域)* | master password(`auth=required`,衍生需解鎖 seed) | `echo "$PW" \| wallet-cli wallet add-account --account main --password-stdin` |

> **輸出** 🟢 實測(完整 descriptor + `status`;新衍生 → `created`,重複同 index → `existing`(冪等)。`addresses` 為**新衍生**的地址,`siblings` 列其他已知 index)。
> ```json
> {"status":"created","accountId":"wlt_62dk5gdt.1","label":"sub-1","type":"seed","index":1,"active":false,"addresses":{"tron":"TEv8xSwqstXML15y86WaJPB8zUAdNvF8HS","evm":"0x7aCB64fAC39406e7a4e6cb14Ce90911D3282dA05"},"siblings":[0]}
> ```

### `wallet delete` — 刪除錢包/帳戶並清孤兒 label

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--account <accountId\|label\|address>` * | 要刪除的帳戶或錢包 | `--account old` |

> 規格定為互動式刪除確認;當前代碼**未做確認 prompt**(見出入 §X)。

> **輸出** 🟢 實測(回 canonical `accountId`、`scope`(account/wallet)、`secretRemoved`、刪除後的 `newActive`)。刪最後一個子帳戶會連帶移除整個 wallet+vault → `scope:"wallet"`、`secretRemoved:true`。
> ```json
> {"accountId":"wlt_62dk5gdt.1","scope":"account","secretRemoved":false,"newActive":"wlt_pkywft0z"}
> ```
> 註:子帳戶須用 `wlt_x.N` ref(`label` 解析到 `.0`,`label.1` 無法解析)。

### `wallet backup` — 匯出帳戶秘密+metadata 到 0600 檔

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--account <accountId\|label\|address>` * | 要備份的帳戶 | `--account main` |
| `[--out <path>]` | 輸出檔路徑(省略=`<root>/backups/<accountId>-<ts>.json`);拒覆蓋既有檔(`output_exists`) | `--out ~/main-backup.json` |
| `--password-stdin` *(情境全域)* | master password(`auth=required`,讀出秘密) | `echo "$PW" \| wallet-cli wallet backup --account main --password-stdin` |

> 秘密只寫進 0600 檔,**永不上 stdout/log/envelope**;watch/ledger 帳戶 → `watch_only_no_signer`。

> **輸出** 🟢 實測(完整 descriptor + `secretType`/`passphraseSet`/`out`/`fileMode`/`bytes`;**秘密永不在 envelope**,只寫進 0600 檔)。
> ```json
> {"accountId":"wlt_62dk5gdt.0","label":"main","type":"seed","index":0,"active":false,"addresses":{"tron":"TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB","evm":"0xe4aAd11792F7E74f1B5cbce65f9a1E207c952961"},"siblings":[1],"secretType":"mnemonic","passphraseSet":false,"out":"/path/to/backups/main-<ts>.json","fileMode":"0600","bytes":358}
> ```

### `config get` — 讀使用者設定

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--key <k>]` | 要讀的設定鍵(省略=全部);未知鍵 → `invalid_value` | `--key defaultOutput` |

> **可讀鍵僅**:`defaultOutput`、`timeoutMs`、`networks`(代碼硬編碼;見出入 §X)。

> **輸出** 🟢 實測。省略 `--key`(全部):
> ```json
> {"defaultOutput":"text","timeoutMs":30000,"networks":["tron:mainnet","tron:nile","tron:shasta","evm:1","evm:56","evm:11155111","evm:8453","evm:10","evm:42161"]}
> ```
> 帶 `--key defaultOutput`:`{"key":"defaultOutput","value":"text"}`

### `config set` — 寫使用者設定

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--key defaultOutput\|timeoutMs` * | 設定鍵(**僅此二鍵**,enum 限制) | `--key defaultOutput` |
| `--value <v>` * | 設定值(`defaultOutput`∈`text\|json`;`timeoutMs`≥0) | `--value json` |

> **可寫鍵僅** `defaultOutput`、`timeoutMs`;規格提到的 `defaults.network`、`price:` **無法用 `config set` 寫**(見出入 §X)。

> **輸出** 🟢 實測(回寫入的 key/value)
> ```json
> {"key":"defaultOutput","value":"json"}
> ```

### `chains list` — 列出已知網路與別名

| Flag | 說明 | 示例 |
| --- | --- | --- |
| (無命令 flag) | 印 `id/family/chainId/aliases/feeModel` | `wallet-cli chains list` |

> **輸出** 🟢 實測(`data` 為陣列,內建網路表;節錄頭兩筆)
> ```json
> [{"id":"tron:mainnet","family":"tron","chainId":"mainnet","aliases":["tron"],"feeModel":"tron-resource"},{"id":"tron:nile","family":"tron","chainId":"nile","aliases":["nile"],"feeModel":"tron-resource"},{"id":"evm:1","family":"evm","chainId":"1","aliases":["eth","ethereum"],"feeModel":"eip1559"}]
> ```

---

## 2. `tron <resource> <action>`(綁鏈)

> **情境全域**:綁鏈命令一律可帶 `--network`(動鏈命令 `required`、讀類/離線 `optional`,省略則用 family 預設網路)、`--grpc-endpoint`(單次覆寫端點);會用帳戶者可帶 `--account`;簽名命令(`auth=required`)需 `--password-stdin`(software 帳戶);Ledger 帳戶簽名時硬體按鍵確認,等待上界由 `--timeout` 控制(無人值守逾時即 abort)。

### 2.1 `tron account`

#### `tron account balance` — 查 TRX 餘額

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--network <net>` *(情境全域)* | 網路(`optional`,省略用預設) | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 查指定帳戶餘額(覆寫 active) | `--account main` |

> **輸出** 🟢 實測(`balance` 為 SUN 字串)
> ```json
> {"address":"TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB","balance":"13146375164","unit":"sun"}
> ```

#### `tron account resources` — 帶寬/能量 + 質押彙總

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 指定帳戶 | `--account main` |

> 回傳含 `bandwidth/energy/frozenV2/unfreezing/withdrawableSun/availableUnfreezeCount`(吸收 can-withdraw / available-unfreeze-count)。

> **輸出** 🟢 實測(`frozenV2` 為 `getAccount` 原文片段 📡;其餘為彙總計算)
> ```json
> {"address":"TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB","bandwidth":{"used":0,"limit":711},"energy":{"used":0,"limit":133497852},"frozenV2":[{"amount":176000000},{"type":"ENERGY","amount":1800238000000},{"type":"TRON_POWER"}],"unfreezing":[{"amountSun":"1000000","expireTime":1781802819000}],"withdrawableSun":"1000000","availableUnfreezeCount":31}
> ```

#### `tron account assets` — 指定代幣逐個查餘額

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--tokens <list>]` | 逗號分隔的 TRC20 合約 / TRC10 asset-id 清單 | `--tokens TR7...,1002000` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 指定帳戶 | `--account main` |

> **輸出** 🟢 實測(逐個 token 查餘額;TRC10 用 asset-id、TRC20 用合約)
> ```json
> {"address":"TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB","assets":[{"token":"TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj","kind":"trc20","balance":"0"}]}
> ```

#### `tron account info` — 原始帳戶彙總(`getAccount` 直通)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 指定帳戶 | `--account main` |

> **輸出** 🟢 實測 · 📡 `account` 欄為 `getAccount` **原文直通**(欄位隨帳戶狀態而異:`balance/frozenV2/unfrozenV2/votes/assetV2/*_permission/account_resource…`,地址為 hex)。節錄:
> ```json
> {"address":"TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB","account":{"address":"418c7145112ac207cc95544a930c769d468d01cd4e","balance":13146375164,"create_time":1753860222000,"frozenV2":[{"amount":176000000},{"type":"ENERGY","amount":1800238000000},{"type":"TRON_POWER"}],"unfrozenV2":[{"type":"ENERGY","unfreeze_amount":1000000,"unfreeze_expire_time":1781802819000}],"assetV2":[{"key":"1005416","value":498118518}],"owner_permission":{"permission_name":"owner","threshold":1,"keys":[{"address":"418c7145112ac207cc95544a930c769d468d01cd4e","weight":1}]},"active_permission":[{"type":"Active","id":2,"permission_name":"active","threshold":1,"operations":"7fff1fc0033efb0f00…","keys":[{"address":"418c7145112ac207cc95544a930c769d468d01cd4e","weight":1}]}]}}
> ```

#### `tron account history` — 交易歷史(依賴 TronGrid)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--limit <n>]` | 筆數(預設 20,上限 200) | `--limit 50` |
| `[--only native\|token]` | 歷史類型過濾 | `--only token` |
| `--network <net>` *(情境全域)* | 網路;缺 `tronGridUrl` → `indexer_not_configured` | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 指定帳戶 | `--account main` |

> **輸出** 🟢 實測(Nile builtin 已設 `tronGridUrl`,故 history 可跑)· 📡 `records[]` 為 **TronGrid `/v1/accounts/.../transactions` 原文直通**(每筆含 `ret/raw_data/raw_data_hex/net_fee/energy_usage_total…`)。節錄首筆:
> ```json
> {"address":"TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB","only":"all","count":20,"records":[{"ret":[{"contractRet":"SUCCESS","fee":345000}],"txID":"4dad2a5f0e9ea5b0c80a7522d523b6de7473a7e6ec61ac063d0323c0104d4123","net_usage":0,"net_fee":345000,"energy_usage_total":29650,"blockNumber":68406553,"block_timestamp":1781716446000,"raw_data":{"contract":[{"parameter":{"value":{"data":"a9059cbb…","owner_address":"418c7145112ac207cc95544a930c769d468d01cd4e","contract_address":"41eca9bc828a3005b9a3b909f2cc5c2a54794de05f"},"type_url":"type.googleapis.com/protocol.TriggerSmartContract"},"type":"TriggerSmartContract"}],"fee_limit":100000000,"timestamp":1781716444656},"internal_transactions":[]}]}
> ```
> 缺 `tronGridUrl` → 失敗 `{"code":"indexer_not_configured",…}`。

#### `tron account add-token` — 加自訂代幣到地址簿

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--contract <T...>` \| `--asset-id <id>` * | TRC20 合約 / TRC10 asset-id(互斥擇一);抓 symbol/decimals 入簿 | `--contract TR7...` |
| `--network <net>` *(情境全域)* | 網路(地址簿範圍 = network+account) | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 地址簿所屬帳戶 | `--account main` |

> 抓不到 metadata → `token_metadata_unavailable`;已在官方層 → `token_already_listed`;使用者層則冪等刷新。

> **輸出** 🟢 實測(`action` ∈ `added|refreshed`)
> ```json
> {"network":"tron:nile","account":"wlt_gqakbznp.0","action":"added","token":{"kind":"trc20","id":"TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj","symbol":"USDT","decimals":6,"name":"Tether USD"}}
> ```

#### `tron account list-tokens` — 列地址簿(官方+使用者)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--network <net>` *(情境全域)* | 網路 | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 地址簿所屬帳戶 | `--account main` |

> **輸出** 🟢 實測(`tokens[].source` ∈ `official|user`,無餘額)
> ```json
> {"network":"tron:nile","account":"wlt_gqakbznp.0","tokens":[{"kind":"trc20","id":"TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj","symbol":"USDT","decimals":6,"name":"Tether USD","source":"user"}]}
> ```

#### `tron account remove-token` — 從地址簿移除使用者層代幣

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--contract <T...>` \| `--asset-id <id>` * | 要移除的代幣(互斥擇一) | `--contract TR7...` |
| `--network <net>` *(情境全域)* | 網路 | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 地址簿所屬帳戶 | `--account main` |

> 移官方層 → `token_is_official`;不在簿 → `token_not_in_book`。

> **輸出** 🟢 實測(回被移除的 entry)
> ```json
> {"network":"tron:nile","account":"wlt_gqakbznp.0","removed":{"kind":"trc20","id":"TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj","symbol":"USDT","decimals":6,"name":"Tether USD"}}
> ```

#### `tron account portfolio` — 原生+地址簿代幣餘額 + best-effort USD

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--network <net>` *(情境全域)* | 網路 | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 指定帳戶 | `--account main` |

> 行情失敗不影響餘額(回 `priceSource` + 選填 `priceError`,個別 `valueUsd=null`)。

> **輸出** 🟢 實測(餘額來自 Nile RPC,行情來自 CoinGecko;TRC20 無價 → `priceUsd/valueUsd=null`)
> ```json
> {"network":"tron:nile","account":"wlt_gqakbznp.0","address":"TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB","priceSource":"coingecko","holdings":[{"kind":"native","symbol":"TRX","decimals":6,"rawBalance":"13146375164","balance":"13146.375164","priceUsd":0.327816,"valueUsd":4309.592121},{"kind":"trc20","symbol":"USDT","decimals":6,"rawBalance":"0","balance":"0","priceUsd":null,"valueUsd":null,"id":"TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj","name":"Tether USD","source":"user"}],"totalValueUsd":4309.592121}
> ```

### 2.2 `tron token`

#### `tron token balance` — 單代幣餘額

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--contract <T...>` \| `--asset-id <id>` * | TRC20 / TRC10(互斥擇一) | `--contract TR7...` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 查指定帳戶 | `--account main` |

> **輸出** 🟢 實測(`balance` 為最小單位字串)
> ```json
> {"address":"TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB","token":"TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj","balance":"0"}
> ```

#### `tron token info` — 代幣 metadata

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--contract <T...>` \| `--asset-id <id>` * | TRC20 / TRC10(互斥擇一) | `--contract TR7...` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |

> `wallet=none`(純 RPC 讀,不碰帳戶)。

> **輸出** 🟢 實測(TRC20:contract/name/symbol/decimals/totalSupply;TRC10 形狀不同,來自 `getTrc10Info`)
> ```json
> {"contract":"TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj","name":"Tether USD","symbol":"USDT","decimals":6,"totalSupply":"1000000000000000035993266846000000"}
> ```

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

> **輸出** 🟢 實測(三種模式形狀不同;`tx`/`signed` 為 TRON SDK 建出的交易物件 📡 含 `raw_data/raw_data_hex/txID`)
>
> `--dry-run`(只回 plan+費用):
> ```json
> {"mode":"dry-run","fee":{"feeModel":"tron-resource","bandwidthBurnSunIfNoFreeze":100000},"tx":{"visible":false,"txID":"0d14e76b…","raw_data_hex":"0a02c461…","raw_data":{"contract":[{"parameter":{"value":{"to_address":"416e0617…","owner_address":"418c7145…","amount":1000000},"type_url":"type.googleapis.com/protocol.TransferContract"},"type":"TransferContract"}],"ref_block_bytes":"c461","ref_block_hash":"c582f895d23fb521","expiration":1782104367000,"timestamp":1782104307000}}}
> ```
> `--sign-only`(回已簽 hex,餵 broadcast):
> ```json
> {"mode":"sign-only","signed":{"visible":false,"txID":"488eb888…","raw_data_hex":"0a02c480…","raw_data":{ /* 同上 contract */ },"signature":["67d451cd…1B"]},"fee":{"feeModel":"tron-resource","bandwidthBurnSunIfNoFreeze":100000}}
> ```
> 預設(真實廣播,已於 Nile 確認):
> ```json
> {"stage":"broadcast","txId":"f84450d4e2aa0bbfa0481ecb3c07bbfbe0790620e013c4e59ff7ce84092b3474","raw":{"result":true,"txid":"f84450d4…","transaction":{"visible":false,"txID":"f84450d4…","raw_data_hex":"…","raw_data":{…},"signature":["…"]}}}
> ```

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
| `--password-stdin` *(情境全域)* | software 帳戶解鎖(`auth=required`) | `--password-stdin` |

> **輸出** 🟢 實測(`--dry-run`;TRC20 費用走 energy,`fee` 含 `energy/energyPriceSun/availableEnergy`)。真實廣播形狀同 send-native 預設模式。
> ```json
> {"mode":"dry-run","fee":{"feeModel":"tron-resource","energy":13430,"energyPriceSun":"0:100,…,1754644200000:100","availableEnergy":133497830},"tx":{"raw_data":{"ref_block_bytes":"c45e","ref_block_hash":"98b9cce7de926d66","expiration":1782104412000,"contract":[{"parameter":{"value":{"owner_address":"418c7145…","contract_address":"41ea51342dabbb928ae1e576bd39eff8aaf070a8c6","data":"a9059cbb…"},"type_url":"type.googleapis.com/protocol.TriggerSmartContract"},"type":"TriggerSmartContract"}],"timestamp":1782104352161,"fee_limit":100000000},"raw_data_hex":"0a02c45e…","txID":"db8f8e61…","visible":false}}
> ```

#### `tron tx broadcast` — 廣播預簽交易(不簽名)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--transaction <hex>` \| `--tx-stdin` * | 預簽交易(TRON 為 JSON);argv inline 或 stdin(互斥) | `--tx-stdin < signed.json` |
| `--network <net>` *(情境全域)* | 網路(`required`) | `--network nile` |

> `auth=none`(不持私鑰)、`wallet=none`。

> **輸出** 🟢 實測 · 📡 `raw` 為節點 `broadcastTransaction` **原文直通**(`result/txid/transaction{…}`)
> ```json
> {"stage":"broadcast","txId":"488eb8880912ad25ec2e49fa5046d24dfd69fc7ffa63094af7ccb936ffb4b3d6","raw":{"result":true,"txid":"488eb888…","transaction":{"visible":false,"txID":"488eb888…","raw_data_hex":"0a02c480…","raw_data":{"contract":[{"parameter":{"value":{"to_address":"416e0617…","owner_address":"418c7145…","amount":1000000},"type_url":"type.googleapis.com/protocol.TransferContract"},"type":"TransferContract"}],"ref_block_bytes":"c480","ref_block_hash":"da0747ab4ef534a7","expiration":1782104460000,"timestamp":1782104400000},"signature":["67d451cd…1B"]}}}
> ```

#### `tron tx status` — 查交易確認狀態

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--txid <hash>` * | 交易 id | `--txid abc123` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |

> **輸出** 🟢 實測(`confirmed=false` 時無 `blockNumber`;確認後帶 `blockNumber`)
> ```json
> {"txid":"488eb8880912ad25ec2e49fa5046d24dfd69fc7ffa63094af7ccb936ffb4b3d6","confirmed":true,"blockNumber":68535425}
> ```

#### `tron tx info` — 查交易詳情/receipt

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--txid <hash>` * | 交易 id | `--txid abc123` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |

> **輸出** 🟢 實測 · 📡 `transaction` 為 `getTransactionById`、`info` 為 `getTransactionInfoById` **原文直通**(`info` 含 `blockNumber/blockTimeStamp/receipt{net_usage,energy_usage…}/contractResult/log`)。節錄:
> ```json
> {"txid":"488eb888…","transaction":{"raw_data":{"contract":[{"parameter":{"value":{"owner_address":"418c7145…","to_address":"416e0617…","amount":1000000},"type_url":"type.googleapis.com/protocol.TransferContract"},"type":"TransferContract"}],"ref_block_bytes":"c480","ref_block_hash":"da0747ab4ef534a7","expiration":1782104460000,"timestamp":1782104400000},"signature":["67d451cd…1b"],"ret":[{"contractRet":"SUCCESS"}],"raw_data_hex":"0a02c480…","txID":"488eb888…"},"info":{"id":"488eb888…","blockNumber":68535425,"blockTimeStamp":1782104403000,"contractResult":[""],"receipt":{"net_usage":267}}}
> ```

### 2.4 `tron resource`

> `freeze/unfreeze/withdraw/cancel-unfreeze/delegate/undelegate` 皆 `network=required`、`auth=required`;共通情境全域:`--network`(必)、`--account`(選)、`--password-stdin`(software)、`--dry-run`/`--sign-only`(互斥)。

#### `tron resource freeze` — 質押換能量/帶寬

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--amount-sun <n>` * | 凍結額(SUN) | `--amount-sun 1000000000` |
| `[--resource energy\|bandwidth]` | 資源類型(預設 bandwidth) | `--resource energy` |
| `[--dry-run]` / `[--sign-only]` | 執行模式(互斥) | `--dry-run` |

> **輸出** 🟢 實測(`--dry-run`;質押類費用走帶寬,`fee.note="staking ops cost bandwidth"`;`tx` 為 `FreezeBalanceV2Contract`)
> ```json
> {"mode":"dry-run","fee":{"feeModel":"tron-resource","note":"staking ops cost bandwidth"},"tx":{"visible":false,"txID":"ccce6d16…","raw_data_hex":"0a02c463…","raw_data":{"contract":[{"parameter":{"value":{"owner_address":"418c7145…","frozen_balance":1000000,"resource":"ENERGY"},"type_url":"type.googleapis.com/protocol.FreezeBalanceV2Contract"},"type":"FreezeBalanceV2Contract"}],"ref_block_bytes":"c463","ref_block_hash":"8833496a1763b80a","expiration":1782104373000,"timestamp":1782104313000}}}
> ```

#### `tron resource unfreeze` — 解押

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--amount-sun <n>` * | 解押額(SUN) | `--amount-sun 1000000000` |
| `[--resource energy\|bandwidth]` | 資源類型(預設 bandwidth) | `--resource energy` |
| `[--dry-run]` / `[--sign-only]` | 執行模式(互斥) | `--sign-only` |

> **輸出** 🟢 實測(`--dry-run`;`tx` 為 `UnfreezeBalanceV2Contract`,`unfreeze_balance` 為解押額)
> ```json
> {"mode":"dry-run","fee":{"feeModel":"tron-resource","note":"staking ops cost bandwidth"},"tx":{"visible":false,"txID":"53557b45…","raw_data_hex":"0a02c463…","raw_data":{"contract":[{"parameter":{"value":{"owner_address":"418c7145…","unfreeze_balance":1000000,"resource":"ENERGY"},"type_url":"type.googleapis.com/protocol.UnfreezeBalanceV2Contract"},"type":"UnfreezeBalanceV2Contract"}],"ref_block_bytes":"c463","ref_block_hash":"8833496a1763b80a","expiration":1782104373000,"timestamp":1782104313000}}}
> ```

#### `tron resource withdraw` — 提領已過等待期的解押 TRX

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--dry-run]` / `[--sign-only]` | 執行模式(互斥) | `--dry-run` |

> **輸出** 🟢 實測(`--dry-run`;`tx` 為 `WithdrawExpireUnfreezeContract`,無金額欄)
> ```json
> {"mode":"dry-run","fee":{"feeModel":"tron-resource","note":"staking ops cost bandwidth"},"tx":{"visible":false,"txID":"2c5e98cc…","raw_data_hex":"0a02c464…","raw_data":{"contract":[{"parameter":{"value":{"owner_address":"418c7145…"},"type_url":"type.googleapis.com/protocol.WithdrawExpireUnfreezeContract"},"type":"WithdrawExpireUnfreezeContract"}],"ref_block_bytes":"c464","ref_block_hash":"1ae9a6bb6df32d82","expiration":1782104376000,"timestamp":1782104316000}}}
> ```

#### `tron resource cancel-unfreeze` — 取消全部待解押(回滾 frozen)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--dry-run]` / `[--sign-only]` | 執行模式(互斥) | `--dry-run` |

> **輸出** 🟢 實測(`--dry-run`;`tx` 為 `CancelAllUnfreezeV2Contract`,無金額欄)
> ```json
> {"mode":"dry-run","fee":{"feeModel":"tron-resource","note":"staking ops cost bandwidth"},"tx":{"visible":false,"txID":"81e3c174…","raw_data_hex":"0a02c464…","raw_data":{"contract":[{"parameter":{"value":{"owner_address":"418c7145…"},"type_url":"type.googleapis.com/protocol.CancelAllUnfreezeV2Contract"},"type":"CancelAllUnfreezeV2Contract"}],"ref_block_bytes":"c464","ref_block_hash":"1ae9a6bb6df32d82","expiration":1782104376000,"timestamp":1782104316000}}}
> ```

#### `tron resource delegate` — 代理資源給他人

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--amount-sun <n>` * | 代理的資源額(質押 TRX 的 SUN 值) | `--amount-sun 1000000000` |
| `--receiver <T...>` * | 代理對象(須 ≠ owner,否則 `invalid_value`) | `--receiver T...` |
| `[--resource energy\|bandwidth]` | 資源類型(預設 bandwidth) | `--resource energy` |
| `[--lock]` | 鎖定代理(鎖定期間不可提前 undelegate) | `--lock` |
| `[--lock-period <blocks>]` | 鎖定區塊數(每塊 3s;**須搭 `--lock`**,否則 `invalid_value`) | `--lock-period 28800` |
| `[--dry-run]` / `[--sign-only]` | 執行模式(互斥) | `--dry-run` |

> **輸出** 🟢 實測(`--dry-run`;`tx` 為 `DelegateResourceContract`,含 `receiver_address/balance`)
> ```json
> {"mode":"dry-run","fee":{"feeModel":"tron-resource","note":"staking ops cost bandwidth"},"tx":{"visible":false,"txID":"1a73d0a0…","raw_data_hex":"0a02c465…","raw_data":{"contract":[{"parameter":{"value":{"owner_address":"418c7145…","receiver_address":"416e0617…","balance":1000000,"resource":"ENERGY"},"type_url":"type.googleapis.com/protocol.DelegateResourceContract"},"type":"DelegateResourceContract"}],"ref_block_bytes":"c465","ref_block_hash":"a4d883fc333bfea2","expiration":1782104379000,"timestamp":1782104319000}}}
> ```

#### `tron resource undelegate` — 收回代理出去的資源

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--amount-sun <n>` * | 收回的資源額(SUN) | `--amount-sun 1000000000` |
| `--receiver <T...>` * | 原代理對象(須 ≠ owner) | `--receiver T...` |
| `[--resource energy\|bandwidth]` | 資源類型(預設 bandwidth) | `--resource energy` |
| `[--dry-run]` / `[--sign-only]` | 執行模式(互斥) | `--sign-only` |

> **輸出** 🟢 實測(`--dry-run`;`tx` 為 `UnDelegateResourceContract`)
> ```json
> {"mode":"dry-run","fee":{"feeModel":"tron-resource","note":"staking ops cost bandwidth"},"tx":{"visible":false,"txID":"c5995e5d…","raw_data_hex":"0a02c466…","raw_data":{"contract":[{"parameter":{"value":{"owner_address":"418c7145…","receiver_address":"416e0617…","balance":1000000,"resource":"ENERGY"},"type_url":"type.googleapis.com/protocol.UnDelegateResourceContract"},"type":"UnDelegateResourceContract"}],"ref_block_bytes":"c466","ref_block_hash":"e3f2bf5c4745aa8a","expiration":1782104382000,"timestamp":1782104322000}}}
> ```

#### `tron resource prices` — 能量/帶寬單價

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |

> `auth=none`、`wallet=none`(純 RPC)。

> **輸出** 🟢 實測 · 📡 `energyPrices`/`bandwidthPrices` 為 `getEnergyPrices`/`getBandwidthPrices` **原文直通**(`時間戳:單價SUN` 的歷史序列字串)
> ```json
> {"energyPrices":"0:100,1572597600000:10,…,1726283400000:210,1754644200000:100","bandwidthPrices":"0:10,1606282800000:40,1612778400000:140,1625815200000:100,1626253800000:1000"}
> ```

### 2.5 `tron block`

#### `tron block get` — 查區塊(省略=最新)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `[--number <n>]` | 區塊號(省略=最新) | `--number 12345` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |

> **輸出** 🟢 實測 · 📡 `block` 為 `getBlock`/`getNowBlock` **原文直通**(`blockID/block_header/transactions[]`,每筆交易為節點原文)。節錄:
> ```json
> {"block":{"blockID":"000000000415c44f02ef45114f2f38e642830f1a9c2f2cf6e6bad6dca7f44207","block_header":{"raw_data":{"number":68535375,"txTrieRoot":"b45078f6…","witness_address":"41a234e405a2c6fd67cdd4d0ea2f6188f65534c8b1","parentHash":"000000000415c44e…","version":36,"timestamp":1782104253000},"witness_signature":"eb1448dd…00"},"transactions":[{"ret":[{"contractRet":"SUCCESS"}],"signature":["8697516…01"],"txID":"0d7068d6…","raw_data":{"contract":[{"parameter":{"value":{"amount":5000000000,"owner_address":"41d093f2…","to_address":"410aa09e…"},"type_url":"type.googleapis.com/protocol.TransferContract"},"type":"TransferContract"}],"ref_block_bytes":"c43c","ref_block_hash":"65ec28d5…","expiration":1782104310000,"timestamp":1782104250589},"raw_data_hex":"0a02c43c…"}]}}
> ```

### 2.6 `tron contract`

#### `tron contract call` — 唯讀呼叫(triggerConstantContract)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--contract <T...>` * | 合約地址 | `--contract TR7...` |
| `--method <sig>` * | 方法簽名 | `--method "balanceOf(address)"` |
| `[--params <json>]` | 方法參數,JSON 陣列 `[{type,value}]` | `--params '[{"type":"address","value":"T..."}]'` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |

> `auth=none`、`wallet=none`(固定 read owner,不選帳戶)。

> **輸出** 🟢 實測 · 📡 `result[]` 為 `triggerConstantContract` 回傳的 **ABI-encoded hex 原文**(未解碼;此例 `balanceOf` 回 0)
> ```json
> {"contract":"TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj","method":"balanceOf(address)","result":["0000000000000000000000000000000000000000000000000000000000000000"]}
> ```

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
| `--account / --password-stdin` *(情境全域)* | 簽名帳戶 / 解鎖 | `--password-stdin` |

> **輸出** 🟢 實測(`--dry-run`;`tx` 為 `TriggerSmartContract`,費用走 energy)。真實廣播形狀同 send-native 預設。
> ```json
> {"mode":"dry-run","fee":{"feeModel":"tron-resource","energy":13430,"energyPriceSun":"0:100,…","availableEnergy":133497830},"tx":{"raw_data":{"ref_block_bytes":"c45e","ref_block_hash":"98b9cce7de926d66","expiration":1782104412000,"contract":[{"parameter":{"value":{"owner_address":"418c7145…","contract_address":"41ea51342dabbb928ae1e576bd39eff8aaf070a8c6","data":"a9059cbb…"},"type_url":"type.googleapis.com/protocol.TriggerSmartContract"},"type":"TriggerSmartContract"}],"timestamp":1782104354525,"fee_limit":100000000},"raw_data_hex":"0a02c45e…","txID":"42873ed7…","visible":false}}
> ```

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
| `--account / --password-stdin` *(情境全域)* | 簽名帳戶 / 解鎖 | `--password-stdin` |

> **輸出** 🟢 實測(`--dry-run`;`tx` 為 `CreateSmartContract`,並回**預測 `contract_address`**)
> ```json
> {"mode":"dry-run","fee":{"feeModel":"tron-resource","note":"deploy energy depends on bytecode size"},"tx":{"visible":false,"txID":"530d6ec2…","raw_data_hex":"0a02c467…","raw_data":{"contract":[{"parameter":{"value":{"owner_address":"418c7145…","new_contract":{"abi":{"entrys":[{"inputs":[],"stateMutability":"nonpayable","type":"constructor"}]},"consume_user_resource_percent":100,"origin_energy_limit":10000000,"origin_address":"418c7145…","bytecode":"6080604052","name":""}},"type_url":"type.googleapis.com/protocol.CreateSmartContract"},"type":"CreateSmartContract"}],"ref_block_bytes":"c467","ref_block_hash":"9e7a5c95e2ae6f39","expiration":1782104385000,"timestamp":1782104325000,"fee_limit":1000000000},"contract_address":"412c4ccc5e138f775e740af0b22098468ca3fa88e0"}}
> ```

#### `tron contract info` — 取合約 ABI/metadata

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--contract <T...>` * | 合約地址 | `--contract TR7...` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network nile` |

> `auth=none`、`wallet=none`(`getContract` + `getContractInfo` 合一)。

> **輸出** 🟢 實測 · 📡 `contract` 為 `getContract` **原文直通**(`abi.entrys[]/bytecode/code_hash/origin_address/origin_energy_limit`);`info` 為 `getContractInfo` 直通,取不到時省略。節錄(abi 25 項):
> ```json
> {"address":"TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj","contract":{"origin_address":"414698ca96dd198ae04e6c45b199516c17c31dbc95","contract_address":"41ea51342dabbb928ae1e576bd39eff8aaf070a8c6","abi":{"entrys":[{"inputs":[{"name":"name_","type":"string"},{"name":"symbol_","type":"string"}],"stateMutability":"nonpayable","type":"constructor"}]},"bytecode":"…","name":"USDT","origin_energy_limit":1000000,"code_hash":"…"}}
> ```

### 2.7 `tron message`

#### `tron message sign` — TIP-191/V2 訊息簽名

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--message <text>` \| `--message-stdin` * | 待簽訊息;inline 或 stdin(互斥) | `--message "hello"` |
| `--network <net>` *(情境全域)* | 網路(`optional`,離線簽名) | `--network nile` |
| `--account <…>` *(情境全域,選用)* | 簽名帳戶 | `--account main` |
| `--password-stdin` *(情境全域)* | software 帳戶解鎖(`auth=required`) | `--password-stdin` |

> **fd 0 互斥**:`--message-stdin` 與 `--password-stdin` 都用 fd 0;要 pipe password 時訊息改走 inline `--message`。

> **輸出** 🟢 實測(`signature` 為 65-byte hex,`0x` 前綴;離線簽名,不廣播)
> ```json
> {"address":"TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB","message":"hello","signature":"0xff17e7a816cf3126606f703dafa0a50068d4152e9ee580979707af8f69fe450230d55971f3392ecc9a841b706173d77aa7e43186e14099d4ade38f2f3dc5e4161c"}
> ```

---

## 3. `evm <resource> <action>`(綁鏈)

> ⚠️ **規格 §5 標記 EVM「一期不交付」,但當前代碼已實作下列 EVM 命令。** 詳見出入 §X。情境全域:`--network`、`--account`、`--rpc-url`(EVM 端點覆寫)、`--password-stdin`、`--dry-run`/`--sign-only`。

### `evm account balance` — 查原生 wei 餘額

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network base` |
| `--account <…>` *(情境全域,選用)* | 指定帳戶 | `--account main` |

> **輸出** 🟢 實測(Sepolia;`balance` 為 wei 字串)
> ```json
> {"address":"0xe4aAd11792F7E74f1B5cbce65f9a1E207c952961","balance":"0","unit":"wei"}
> ```

### `evm tx send-native` — 發送原生幣(wei)

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--to <0x...>` * | 收款 EVM 地址 | `--to 0x...` |
| `--amount-wei <n>` * | 金額(wei) | `--amount-wei 1000000` |
| `[--dry-run]` / `[--sign-only]` | 執行模式(互斥) | `--dry-run` |
| `--network <net>` *(情境全域)* | 網路(`required`) | `--network base` |
| `--account / --password-stdin` *(情境全域)* | 簽名帳戶 / 解鎖 | `--password-stdin` |

> **輸出** 🔵 模擬(測試帳戶 Sepolia 餘額 0,`--dry-run` 實跑得 `{"code":"insufficient_funds",…}`;以下為代碼推導的成功形狀,`fee.feeWei=gas×price`)
> ```json
> {"mode":"dry-run","fee":{"feeModel":"eip1559","gas":"21000","feeWei":"<gas×maxFeePerGas>"},"tx":{ /* viem prepared tx: to/value/maxFeePerGas/maxPriorityFeePerGas/nonce/gas/chainId */ }}
> ```

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
| `--account / --password-stdin` *(情境全域)* | 簽名帳戶 / 解鎖 | `--password-stdin` |

> **輸出** 🔵 模擬(同 send-native;帳戶無 Sepolia ETH 時 `--dry-run` 得 `insufficient_funds`)。成功形狀:`{"mode":"dry-run","fee":{"feeModel":"eip1559","gas":"…","feeWei":"…"},"tx":{…ERC-20 transfer calldata…}}`

### `evm tx status` — 查交易確認狀態

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--txid <0x...>` * | 交易 hash | `--txid 0x...` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network base` |

> **輸出** 🟢 實測(Sepolia 真實 tx;`status` 來自 receipt;查無此 tx → `confirmed=false` 無其餘欄)
> ```json
> {"txid":"0xfcaf14c3a8531cafdfe81868effd73a2d05980f842951a9f497ff1cf1b049225","confirmed":true,"blockNumber":"11113579","status":"success"}
> ```

### `evm tx info` — 查交易詳情+receipt

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--txid <0x...>` * | 交易 hash | `--txid 0x...` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network base` |

> **輸出** 🟢 實測(Sepolia 真實 tx)· 📡 `transaction` 為 viem `getTransaction`、`receipt` 為 `getTransactionReceipt` **原文直通**(bigint 已轉字串;含 `logs/logsBloom/effectiveGasPrice/status…`)。節錄:
> ```json
> {"txid":"0xfcaf14c3…","transaction":{"blockNumber":"11113579","blockTimestamp":"1782104556","from":"0x7d2e967c…","to":"0x94a9d9ac…","gas":"46597","gasPrice":"6035845689","maxFeePerGas":"8000000000","maxPriorityFeePerGas":"5000000000","hash":"0xfcaf14c3…","input":"0x095ea7b3…","nonce":935,"value":"0","type":"eip1559","chainId":11155111,"yParity":0},"receipt":{"blockNumber":"11113579","cumulativeGasUsed":"46215","effectiveGasPrice":"6035845689","gasUsed":"46215","status":"success","contractAddress":null,"logs":[{"address":"0x94a9d9ac…","topics":["0x8c5be1e5…","0x0000…7d2e967c…","0x0000…e815718d…"],"data":"0x0000…77359400","logIndex":0,"removed":false}],"logsBloom":"0x00…","type":"eip1559"}}
> ```

### `evm message sign` — EIP-191 訊息簽名

| Flag | 說明 | 示例 |
| --- | --- | --- |
| `--message <text>` \| `--message-stdin` * | 待簽訊息;inline 或 stdin(互斥) | `--message "hello"` |
| `--network <net>` *(情境全域)* | 網路(`optional`) | `--network base` |
| `--account / --password-stdin` *(情境全域)* | 簽名帳戶 / 解鎖 | `--password-stdin` |

> **輸出** 🟢 實測(EIP-191 `personal_sign`;`signature` 為 65-byte hex)
> ```json
> {"address":"0xe4aAd11792F7E74f1B5cbce65f9a1E207c952961","message":"hello","signature":"0x407f38b349eec2e1f103e02559190b9bb8b1b70450fafef69e2a558b092e94183e0f2c789813b1f463c94af44a4b02343d1e2298de47828dde4484acb3129cd11c"}
> ```

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

### X.8 `--no-device-wait` 廢除(已定案,2026-06-22)
- **背景**:原為自動化場景設計——Ledger 帳戶簽名時不等待人工按鍵、立即丟 `signing_rejected`。三份文件(架構 plan、command-spec §4、本手冊各簽名命令)原皆列為情境全域。
- **決策理由**:(1) `--timeout` 本就是 Ledger 等待的上界(逾時 → `ac.abort()`),無人值守不會永久阻塞,後盾已存在;(2) agent 端依「是否有人值守」決定是否選用 Ledger 帳戶,等待行為由呼叫者的帳戶選擇控制即可;(3) `--no-device-wait` 剩餘價值僅「fail-fast + 語意化錯誤」,在「接受 agent 等待」的前提下不足以保留一個跨 ~10 命令的契約 flag。
- **結果**:**移除** `--no-device-wait`。已同步刪除代碼(`core/types`、`runtime/context`、`runtime/pipeline`、`app/runner`、`cli/shell` 及相關測試)與三份文件所有引用。Ledger 等待行為改為「印等待提示 + `--timeout` 上界 + abort」,不再有立即拒絕路徑。`signing_rejected` 錯誤碼保留(`message sign` 等仍用)。

> 另:已知 Nile 實測 bug(resource freeze/unfreeze、contract send/deploy 的 flag 碰撞/default 問題)見記憶 `ts-cli-nile-test-findings`,與本文件 flag 設計對照時一併留意。
