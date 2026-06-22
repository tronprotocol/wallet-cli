# 互動式 TTY 流程 Demo

這份文件示範 wallet-cli 的**互動式輸入**實際長怎樣。核心是一條統一規則:

> **外部給了就用、沒給才問。** 每個輸入先看外部來源(argv flag / `--*-stdin`),缺漏且在 TTY 環境才互動詢問;非 TTY(agent / pipe / CI)缺漏則直接報錯。秘密在 TTY 隱藏輸入,**永不回顯、不進 argv / log / stdout**。

支援互動的命令:`wallet create`、`import-mnemonic`、`import-private-key`、`import-ledger`、`delete`、`backup`。
(簽名類命令 `tx send` / `message sign` 等**不**走互動密碼,維持 `--password-stdin`。)

## 兩個串流分開

| 內容 | 去向 | 格式 |
|------|------|------|
| `Set master password:` 等 prompt、`✗` 提示、`✓ via pipe` | **stderr** | 永遠人類可讀 |
| 最終結果(下面的 `✓ wallet.*` 區塊) | **stdout** | 預設 **text**;`--output json` 才換 JSON |

> 下面的範例都是**預設 text 輸出**(人類在終端機看到的樣子)。輸出格式由 `--output` / `config.yaml` 的 `defaultOutput` 決定,**與是否 TTY 無關**。

---

## 1. `wallet create` — 首次建立(設定密碼)

第一次建立錢包時 keystore 還沒有 master password → 走**設定 + 二次確認 + 密碼政策**,助記詞固定 12 字。

```console
$ wallet-cli wallet create --label main
Set master password:
  ✗ password too weak: must include a special character (!@#$%^&*()-_=+[]{};:,.?)
Set master password:
Confirm:
✓ wallet.create
  status: created
  accountId: wlt_p7waj9jm.0
  label: main
  type: seed
  index: 0
  active: true
  addresses: {"tron":"TG2G2vEseEJL8fF6sjDLkice514Z3npDKe","evm":"0x5AA6b25f257872356FA89e46692DB2C971D7AA59"}
```

- 密碼隱藏輸入、不回顯;不符政策(長度 ≥ 8、含大小寫、數字、特殊字元)會即時提示並重問。
- 助記詞不上螢幕(加密存檔,需要時用 `wallet backup` 取出)。

**非互動(agent / CI)**:帶 `--password-stdin` 直接跳過互動。

```console
$ printf '%s' 'Str0ng!pw' | wallet-cli wallet create --label main --password-stdin
✓ wallet.create
  status: created
  accountId: wlt_p7waj9jm.0
  ...
```

---

## 2. `wallet import-private-key` — 兩個秘密,必進 TTY

匯入需要**私鑰 + master password 兩個秘密**;`fd 0` 一次只能餵一個,所以至少一個一定走 TTY。
(下例是**第一個錢包**,keystore 還沒密碼 → 先設定密碼,再輸入私鑰。)

```console
$ wallet-cli wallet import-private-key --label hot
Set master password:
Confirm:
Private key:
✓ wallet.import-private-key
  status: created
  accountId: wlt_db5ks58t
  label: hot
  type: privateKey
  index:
  active: true
  addresses: {"tron":"TP5gxuZj6Pj5ciM6B8fMJwytZwWAJ66sat","evm":"0x8fd379246834eac74B8419FfdA202CF8051F7A03"}
```

- 私鑰即時驗證:64 hex(可帶 `0x`);不合法重問。
- **escape hatch**:帶 `--password-stdin` → 跳過密碼步驟、只問 `Private key:`;帶 `--private-key-stdin` → 先問密碼、跳過私鑰步驟。

```console
# 私鑰走 pipe,密碼走 TTY
$ wallet-cli wallet import-private-key --private-key-stdin < key.txt
Master password:
✓ wallet.import-private-key
  ...
```

---

## 3. `wallet import-mnemonic` — keystore 已有密碼時只驗證

當 keystore **已經初始化**(之前建過錢包),密碼改為**驗證既有**(只問一次 `Master password:`,錯誤最多重試 3 次);助記詞做 BIP39 校驗。

```console
$ wallet-cli wallet import-mnemonic --label restored
Master password:
Recovery phrase:
✓ wallet.import-mnemonic
  status: created
  accountId: wlt_a1b2c3d4.0
  label: restored
  type: seed
  index: 0
  active: true
  addresses: {"tron":"T...","evm":"0x..."}
```

- 助記詞字數由輸入自然判定(12 / 24 等),不合法重問。
- escape hatch 同上(`--mnemonic-stdin` / `--password-stdin`)。

---

## 4. `wallet import-ledger` — 用方向鍵選,不用手打

沒有秘密。互動只發生在「有既定選項」的地方,一律**方向鍵選擇**:

```console
$ wallet-cli wallet import-ledger
app (↑/↓, Enter):
› tron
  ethereum
Select tron account (↑/↓, Enter):
› [0] TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
  [1] TKHuVq1oKVruCGLvqVexFs6dawKv6fQgFs
  [2] TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwb
  [3] TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH
  [4] TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL
```
(移到最後一項再按 ↓ 載入下 5 個;選定後印出 `✓ wallet.import-ledger`。)

- 未帶 `--app` → 先選鏈(`tron` / `ethereum`)。
- 未帶定位旗標 → 一次衍生 5 個地址,可翻頁。
- **逃生口**:帶 `--index <n>` / `--path <m/44'/...>` / `--address <addr>` 其一 → 直接定位,完全不互動。

```console
$ wallet-cli wallet import-ledger --app ethereum --index 0 --label cold
```

---

## 5. `wallet delete` — 方向鍵選帳號 + 重打 ref 確認

未帶 `--account` → **方向鍵選要刪的帳號**(顯示 label / active / 各鏈地址);選定後是破壞性操作 → 要求**重新輸入該帳號的 ref**(打錯即中止,不刪)。

```console
$ wallet-cli wallet delete
account (↑/↓, Enter):
  main (active) — tron:TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6 / evm:0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
› hot — tron:TLEaY8XoqpBmndLsjcfThgdKLN1ssNuUcF / evm:0x70997970C51812dc3A010C7d01b50e0d17dc79C8
type the ref to delete (wlt_vk2ybr4f): wlt_vk2ybr4f
✓ wallet.delete
  accountId: wlt_vk2ybr4f
  scope: wallet
  secretRemoved: true
  newActive: wlt_ebzxme75.0
```

帶 `--account <ref>` 則跳過選單,直接進確認步驟:

```console
$ wallet-cli wallet delete --account wlt_p7waj9jm.0
type the ref to delete (wlt_p7waj9jm.0): wlt_p7waj9jm.0
✓ wallet.delete
  ...
```

打錯時:

```console
$ wallet-cli wallet delete --account wlt_p7waj9jm.0
type the ref to delete (wlt_p7waj9jm.0): wlt_xxxx
error: deletion not confirmed          # exit 1, code: aborted
```

- **逃生口**:`--yes` 跳過確認。
- 非 TTY 且未帶 `--yes` → `tty_required`(不會默默刪)。

---

## 6. `wallet backup` — 驗證既有密碼 → 選帳號 → 寫檔

密碼**先問**(驗證既有);未帶 `--account` 再**方向鍵選帳號**(顯示地址),`--out` 為 optional(回車用預設路徑)。

```console
$ wallet-cli wallet backup
Master password:
account (↑/↓, Enter):
› main (active) — tron:TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6 / evm:0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  hot — tron:TLEaY8XoqpBmndLsjcfThgdKLN1ssNuUcF / evm:0x70997970C51812dc3A010C7d01b50e0d17dc79C8
out (optional, Enter to skip):
✓ wallet.backup
  accountId: wlt_ebzxme75.0
  label: main
  type: seed
  index: 0
  active: true
  addresses: {"tron":"TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6","evm":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"}
  secretType: mnemonic
  passphraseSet: false
  out: <root>/backups/wlt_ebzxme75.0-1782112621801.json
  fileMode: 0600
  bytes: 330
```

- 密碼在所有欄位之前,只問一次(驗證既有),錯誤重試。
- 秘密**只寫進 0600 檔**(`out` 路徑),stdout 只回 metadata + 路徑;秘密永不上螢幕。
- **逃生口**:`--password-stdin`。

---

## 缺漏才補問(非秘密 option)

同一條規則也適用一般必填 option:TTY 下缺漏會被詢問,有既定選項用方向鍵選,其餘自由輸入(會顯示你打的字)。

```console
$ wallet-cli wallet rename --account main
label: primary          # --label 缺漏 → 補問(可見輸入)
✓ wallet.rename
  ...
```

非 TTY(agent / pipe)缺漏則維持既有行為,直接報 `missing_option`(exit 2),不會卡住等輸入。

---

## 一句話總結

| 來源 | 行為 |
|------|------|
| argv flag 有給 | 直接用 |
| `--*-stdin` 有給(秘密) | 從 fd 0 讀,跳過該步驟 |
| 缺漏 + 有 TTY | 互動詢問(秘密隱藏、選項用方向鍵、即時驗證、可重問) |
| 缺漏 + 無 TTY | 報錯(`missing_option` / `auth_required` / `tty_required`) |

- 密碼:首次(keystore 未初始化)→ **設定 + 確認 + 政策**;之後 → **驗證既有**(錯誤重試 3 次)。
- 秘密全程隱藏輸入,不回顯、不入 shell history、不進 argv / log / stdout。
- 結果預設 **text**;要機器解析用 `--output json`(prompt 仍在 stderr,不污染 stdout)。
