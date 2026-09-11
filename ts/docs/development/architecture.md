# TypeScript 架構與 Feature 開發指南

這份文件給要在 `ts/` 新增功能的人。wallet-cli 是一個 **agent-first、多鏈、hexagonal architecture** 的 CLI：每個命令都必須可預測、可被程式呼叫，且私鑰等秘密不能穿過不安全的輸入或輸出邊界。

## 先記住這張圖

```text
argv
  ↓
bootstrap/runner.ts
  ├─ migration preflight
  └─ 建立 CLI、統一處理錯誤與結束碼
       ↓
adapters/inbound/cli
  解析參數 → Zod 驗證 → 選 network/family → command binding
       ↓
application
  use case / service → port
       ↓                    ↓
domain                adapters/outbound
純規則與型別          RPC、檔案、Ledger、外部服務
```

依賴只能往內：

```text
bootstrap → inbound/outbound adapters → application → domain
```

Inbound 與 outbound adapter 不能互相 import；兩者只在 `bootstrap/composition.ts` 組裝。這些規則由 `.dependency-cruiser.cjs` 強制檢查。

## 每一層負責什麼

| 目錄 | 放這裡 | 不要放這裡 |
|---|---|---|
| `src/domain/` | address、amount、wallet、derivation、fee、error 等純規則與 value types | 檔案、網路、Ledger、CLI、application import |
| `src/application/use-cases/` | 一個使用情境的編排；TRON/EVM 差異放在各自子目錄 | yargs、console、TronWeb/ethers、具體檔案系統 |
| `src/application/services/` | 多個 use case 共用的流程，例如 signer resolution、transaction pipeline | adapter 實作 |
| `src/application/ports/` | application 所需要的 I/O interface | 具體 SDK/client |
| `src/adapters/inbound/cli/` | command spec、Zod schema、argv mapping、文字 render | RPC、持久化與鏈上商業邏輯 |
| `src/adapters/outbound/` | port 的實作：chain RPC、keystore、Ledger、config、price 等 | CLI command 或 render |
| `src/bootstrap/` | dependency wiring、family 註冊、process lifecycle | domain 規則或 feature 邏輯 |

Composition root 是 `src/bootstrap/composition.ts`。若不確定物件在哪裡建立，從這裡往回找。

## 一次命令如何執行

1. `src/index.ts` 呼叫 `bootstrap/runner.ts`。
2. runner 先解析 global flags，執行資料 migration preflight，再建立 runtime。
3. CLI shell 從 `CommandRegistry` 找到命令，解析 network 與 account。
4. 命令的 Zod schema 驗證輸入；capability、family、互動與認證限制在執行前檢查。
5. Inbound binding 呼叫 application use case；use case 只透過 port 做 I/O。
6. formatter 將結果輸出為 text，或輸出唯一一個 `wallet-cli.result.v1` JSON envelope。
7. 所有錯誤回到 runner，正規化成穩定 error code 與 exit code。

Machine-facing 行為以 [`machine-interface.md`](../machine-interface.md) 為準：stdout、stderr、JSON shape 或 exit code 的改動都視為 public API 變更。

## 新增 feature 時怎麼切

### 1. 先判斷命令類型

- **不接觸鏈**：使用 `CommandDefinition`，例如 wallet、config、contact。
- **接觸鏈**：使用一份共用 `ChainSpec`，再為支援的 family 加 `FamilyBinding`。

`ChainSpec` 定義共同命令語意、欄位、help、capability 與 renderer；`FamilyBinding` 只補該 family 的欄位、驗證與執行方式。共用命令不要複製成 TRON/EVM 兩份 spec。參考：

- 共用 spec 與 binding：`src/adapters/inbound/cli/commands/tx.ts`
- family wiring：`src/bootstrap/families/tron.ts`、`evm.ts`
- registry：`src/adapters/inbound/cli/registry/index.ts`

### 2. 把邏輯放對位置

一般 feature 的最小垂直切片是：

```text
commands/<feature>.ts
  → application/use-cases/[family]/<feature>-service.ts
  → application/ports/<needed-io>.ts       （只有需要新 I/O 時）
  → adapters/outbound/<implementation>.ts （只有需要新 I/O 時）
  → bootstrap/composition.ts 或 bootstrap/families/<family>.ts
```

判斷原則：

- 不需要 I/O 的規則放 `domain`。
- 描述「要完成什麼」的流程放 application。
- 描述「如何呼叫 RPC / SDK / filesystem」的程式放 outbound adapter。
- CLI 層只做輸入契約、dispatch 與 presentation。

### 3. 交易命令必須走共用 pipeline

由 CLI 建構與廣播的鏈上交易使用 `application/services/pipeline/TxPipeline`，不要在 command 或 use case 另寫一套流程。標準順序是：

```text
resolve signer → build → prepare → estimate → dry/build-only
               → preflight → sign → authorization → broadcast → confirm
```

這裡統一保證 software/Ledger signer、`--dry-run`、`--sign-only`、`--build-only`、permission、timeout 與 `--wait` 的語意。

### x402 協議支付的邊界

`x402 pay`、`x402 roundtrip` 與 `bai recharge` 使用協議支付流程：SDK 處理 challenge、付款簽名及 facilitator 結算，並非 CLI 自行建構和廣播一筆普通交易。因此不套用 `TxPipeline` 的整套 build / estimate / broadcast 流程，也不承諾其 sign-only、build-only、wait 語意。ERC-8004 寫入及一般 transfer / approve 仍必須使用 `TxPipeline`。

x402 必須沿用 application 的 `SignerResolver` 與 `obtainSignature`，不得自行解密 vault 或讀取私鑰。outbound adapter 負責 SDK 協定轉換；application 負責充值編排與 port。SDK 要求簽署授權交易時仍經相同 signer 邊界，不能視為一般交易 pipeline 已提供完整保障。

`x402 pay --dry-run` 只檢查 challenge，不簽名或付款。roundtrip 與 BAI recharge 不宣告 dry-run / sign-only / build-only，CLI 必須拒絕這些未支援的旗標。付款狀態未知時保留可用交易證據、禁止自動重付；BAI 已付款但未確認入帳時，只能查詢或對原交易補報。

### 4. Schema 是命令介面的單一來源

每個 command 的 Zod schema 同時驅動：

- argv arity 與型別轉換
- validation
- `--help`
- JSON Schema discovery

因此不要另外維護參數表，也不要在 use case 才補做可由 schema 表達的輸入驗證。金額與鏈上大整數必須用 decimal string / `bigint`，不可經過 JavaScript `number`。若外部 API 強制要求 JSON number（例如 BAI），只可在 outbound adapter 的序列化邊界轉換，並檢查範圍與十進位往返一致性；application port 與付款數量保持 decimal string。

## 不可破壞的邊界

- **Secrets**：private key、mnemonic、BIP39 passphrase 不得出現在 argv、env、log 或 result，且只能由 hidden TTY 輸入；master password 只有在命令明確允許時才能走專用 stdin。是否允許互動由 command metadata 宣告。
- **JSON contract**：JSON mode 的 stdout 只能有一個 terminal envelope；progress 與 diagnostic 走 stderr。不要直接 `console.log`。
- **Errors**：預期錯誤使用 `domain/errors` 的 typed error。新增 error code 時同步更新 `domain/errors/codes.ts`；exit `1` 是執行失敗，exit `2` 是呼叫方式錯誤。
- **Dry run**：標示 `broadcasts` 的命令在 `--dry-run` 下不能碰 broadcaster；不要繞過既有 guard。
- **Network identity**：儲存與 machine output 使用 canonical network id；alias 只在選擇 network 時解析。family 是 `tron | evm`，不是 CAIP-2 namespace。
- **Persistence**：預設 root 是 `~/.wallet-cli`，測試可用 `WALLET_CLI_HOME` 隔離。寫入沿用 `AtomicFileStore` 的 lock、atomic write 與權限檢查，不要直接覆寫 wallet files。
- **Composition**：constructor 不應執行 command side effect；外部 I/O 發生在 use case 執行期間。

文件與程式碼統一使用以下核心詞彙：

| 詞彙 | 定義 |
|---|---|
| Wallet | 一個 key source；HD wallet 可衍生多個 account |
| Account | CLI 實際選取與操作的身份，以 `accountId` 識別 |
| Family | 共用地址格式、derivation 與簽名方式的鏈族，目前是 `tron` 或 `evm` |
| Canonical network id | 儲存與 machine output 使用的永久 network id，例如 `tron:3448148188`；alias 只供 CLI 輸入解析 |
| Keystore | 可互通的 Web3 V3 單一私鑰檔案，不是 wallet-cli 的內部儲存 |
| Vault | wallet-cli 內部的加密 secret blob，可能保存 seed，不可稱為 Keystore |

## 完成定義

測試與 feature 放在一起：`src/**/*.test.ts` 是單元/邊界測試，`test/**/*.test.ts` 是從 CLI process 驗證的 golden/E2E 測試。至少執行：

```bash
cd ts
npm run depcruise
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

送出前確認：新命令可由 `--help` 與 `--json-schema` 發現、text/JSON 都有覆蓋、錯誤碼穩定、沒有 secret 洩漏，且交易功能至少覆蓋 dry-run 與失敗路徑。
