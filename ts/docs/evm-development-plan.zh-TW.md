# wallet-cli EVM 支援開發計畫

> 狀態：待實作  
> 適用專案：`ts-refactor`  
> 目的：列出將現行 TRON-only CLI 擴充為 TRON + EVM 時，所有必須修改、增加與驗收的範圍。本文刻意不展開函式與 RPC payload 的實作細節。

## 1. 完成定義

EVM 支援不能只代表「可以連 Ethereum RPC」。完成後必須同時成立：

1. `evm` 是正式 `ChainFamily`，不再靠測試中的 type cast 模擬。
2. 可解析 Ethereum mainnet `evm:1`，以及設定檔新增的任意 `evm:<chainId>`，例如 `evm:11155111`、`evm:8453`、`evm:31337`。
3. EVM network 可用 canonical id 或唯一 alias 選取，也可設為 `defaultNetwork`。
4. seed、private key、watch-only 與 Ledger Ethereum app 都有明確 EVM 行為。
5. EVM 有自己的 gateway、signing strategy、use cases 與 CLI command module，不把 EVM 方法塞進 TRON gateway。
6. `wallet-cli --help`、family help、command help、`--json-schema` 與 `wallet-cli networks` 都能讓使用者／agent 發現 EVM。
7. text 與 JSON 輸出正確呈現 EVM address、chain id、native currency、gas、fee、nonce、transaction hash 與 receipt。
8. 原有 TRON 命令、輸出、秘密處理與 exit code 契約維持不變。

開發依賴順序：

```text
公開契約 → Domain → Persistence/Config → Application ports → EVM adapters
         → EVM use cases → CLI commands → Bootstrap → Help/Output → Tests/Docs
```

### 1.1 真正的程式異動分類

本文件後面出現的「涉及位置」包含修改、引用與驗證，不代表每個檔案都要改。依目前程式碼，實際分類如下。

#### 一定新增

- `application/ports/chain/evm-gateway.ts`
- `adapters/outbound/chain/evm/*`
- `application/use-cases/evm/*`
- `adapters/inbound/cli/commands/evm/*`
- `bootstrap/families/evm.ts`
- EVM confirmation、fixtures、unit/integration/live tests
- Explorer/history adapter（只有決定提供 EVM history/ABI metadata 時才新增）

#### 一定修改

- Domain family/address/network/wallet/transaction types
- Config builtins、custom-network validation 與 network 顯示
- Keystore schema migration 與舊 wallet EVM address backfill
- `ChainGatewayMap` 與 family plugin registry
- Generic gateway registry 的檔案歸屬（目前誤放在 `chain/tron/provider.ts`）
- Outbound Ledger dispatcher（若公開 Ledger EVM）
- Token builtin/normalization 與 CoinGecko network mapping
- Root/family/merged command help、global `--network` 說明與 wallet help examples
- Family renderer、EVM transaction/fee text output
- Dependencies、架構文件、help/golden baselines

#### 原則上不修改，只新增 EVM 測試驗證可重用性

- `application/services/transaction-mode.ts`
- `application/services/pipeline/index.ts`
- `application/services/signer/index.ts`
- `application/services/signer/software.ts`
- `application/services/signer/ledger.ts`
- `application/services/target/index.ts`
- `application/contracts/execution-policy.ts`
- `application/contracts/execution-scope.ts`
- `application/ports/chain/broadcaster.ts`
- `application/ports/ledger-device.ts`
- `application/ports/network-registry.ts`
- `application/ports/token-repository.ts`
- `application/ports/price-provider.ts`
- `adapters/inbound/cli/registry/index.ts`
- `adapters/inbound/cli/shell/index.ts`
- `adapters/inbound/cli/command-id.ts`
- `adapters/inbound/cli/context/index.ts`
- `adapters/inbound/cli/arity/index.ts`
- `adapters/inbound/cli/output/envelope.ts`
- stream、secret、prompt 與 output formatter infrastructure

#### 視公開決策才修改

- `CapabilityRegistry` 與 bootstrap capability composition：只有 history/indexer、legacy/EIP-1559 等要做 per-network gate 時才需改。
- Help catalog：EVM commands 會由 registry 自動進入 catalog；只有要在 catalog 頂層增加 families/networks 摘要時才需改。
- `WalletService`：現有 family detection 與 repository delegation 可重用；通常只需測試，migration 應留在 persistence adapter。
- Shared transaction types/pipeline：types 必須擴充顯示欄位，但 pipeline control flow 原則上不改。

若實作過程必須修改上述「原則上不修改」的模組，應先指出目前 abstraction 缺少的 family-neutral 能力；不能只因 EVM adapter 寫法不順就加入 `if (family === "evm")`。

## 2. 開發前先鎖定的公開決策

以下決策必須先寫入架構契約，否則 help、network schema、command schema 與測試會反覆修改。

### 2.1 Network identity

- EVM canonical network id 固定為 `evm:<十進位 chainId>`。
- `evm:xxx` 中的 `xxx` 是 EIP-155 chain id，不是名稱；實際值必須為正整數字串。
- 最低內建網路：
  - `evm:1`，aliases 建議為 `eth`、`ethereum`。
  - 一個公開測試網，建議 `evm:11155111`，alias `sepolia`。
- 其他網路透過 `config.yaml` 新增；是否額外內建 Base、Polygon、BSC 等由產品決策決定。
- alias 必須全域唯一；重複 alias 要維持 `ambiguous_network_alias` 錯誤。
- RPC 回報的 chain id 必須和設定值一致，簽名或 broadcast 前不得忽略 mismatch。
- `defaultNetwork` 仍建議保持 `tron:mainnet`，除非另有產品遷移決策。

建議的自訂網路公開形狀：

```yaml
defaultNetwork: evm:1
networks:
  evm:1:
    family: evm
    chainId: "1"
    aliases: [eth, ethereum]
    rpcUrl: https://example.invalid
    feeModel: eip1559
    nativeCurrency:
      name: Ether
      symbol: ETH
      decimals: 18

  evm:31337:
    family: evm
    chainId: "31337"
    aliases: [local]
    rpcUrl: http://127.0.0.1:8545
    feeModel: eip1559
    nativeCurrency:
      name: Ether
      symbol: ETH
      decimals: 18
```

### 2.2 第一版命令面

同一 logical path 由 `--network` 選擇 TRON 或 EVM implementation。不得為了 EVM 另造一套頂層 `ethereum ...` 執行文法。

| 命令群組 | EVM 第一版要求 | 備註 |
| --- | --- | --- |
| wallet lifecycle | 支援 | create/import/derive 後顯示 EVM address；watch 可辨識 `0x...`。 |
| `account balance` | 支援 | 使用 network native currency。 |
| `account info` | 支援 | EVM 語意由 EVM use case 定義，不仿造 TRON resource 欄位。 |
| `account history` | 明確決策 | 標準 JSON-RPC 無 address history；需 explorer/indexer adapter，否則不得在不支援的 network help/capability 中宣稱可用。 |
| `account portfolio` | 支援 | native coin + ERC-20 token book + price provider。 |
| `token add/list/remove/balance/info` | 支援 | EVM token kind 為 `erc20`。 |
| `tx send/broadcast/status/info` | 支援 | native/ERC-20、legacy/EIP-1559、raw signed tx。 |
| `contract call/send/deploy/info` | 支援或明確降級 | `contract info` 若需要 ABI metadata，必須有 explorer source；只有 bytecode 時 help 必須如實描述。 |
| `message sign` | 支援 | software 與 Ledger 行為一致。 |
| `block` | 支援 | latest 或指定 block。 |
| `stake ...` | 不提供 EVM implementation | 保持 TRON-only，root/family help 必須標記。 |

### 2.3 SDK 與硬體錢包

- 選定單一 EVM SDK；目前架構建議使用 `viem`，並加入 production dependencies。
- 若宣稱完整 Ledger EVM 支援，加入 Ethereum Ledger app adapter 與對應套件（例如 `@ledgerhq/hw-app-eth`）。
- 如果第一版不做 Ledger EVM，`FAMILIES.evm.ledger`、`import ledger --help` 與 README 都不得顯示 Ethereum app。

## 3. 分階段開發清單

### Phase 0：契約與測試基線

- [ ] 確認第 2 節的 network id、內建 networks、命令矩陣、Ledger 與 history/indexer 決策。
- [ ] 建立 EVM address、transaction、receipt、legacy fee、EIP-1559 fee、ERC-20、block 與 RPC error fixtures。
- [ ] 建立新的 multichain help/golden baseline；現有 TRON-only help parity 不可繼續當成整個 root help 的唯一真相。
- [ ] 定義舊 `wallets.json` 版本升級策略與 rollback 行為。

### Phase 1：Domain

涉及位置：

- `src/domain/family/index.ts`
- `src/domain/address/index.ts`
- `src/domain/types/network.ts`
- `src/domain/types/tx.ts`
- `src/domain/types/token.ts`
- `src/domain/types/wallet.ts`
- `src/domain/sources/index.ts`
- `src/domain/derivation/index.ts`
- `src/domain/wallet/index.ts`
- `src/domain/errors/index.ts`

工作清單：

- [ ] 將 `evm` 加入 `ChainFamily` 與 `FAMILIES`。
- [ ] 登記 EVM 的 BIP44 coin type `60`、smallest unit `wei`、address codec 與 Ledger metadata。
- [ ] 新增 EVM address derive、validate、normalize/checksum 規則及測試。
- [ ] 將 `NetworkDescriptor` 恢復為以 `family` 區分的 discriminated union。
- [ ] 新增 `EvmNetworkDescriptor`：`rpcUrl`、十進位 chain id、fee model、native currency，以及選配 explorer/history 設定。
- [ ] 驗證 canonical id 的 family 與 chain id 和 descriptor 一致。
- [ ] 擴充 transaction view：gas、gas price、max fee、priority fee、effective gas price、nonce、EVM receipt/status 等欄位。
- [ ] 移除共用 view 中只適用 TRON 的命名假設；保留向後相容的 TRON JSON 欄位時要明確記錄。
- [ ] 確認 `erc20` token kind 的 family 約束與 contract address normalization。
- [ ] 更新 seed/private-key address derivation、dedup、account projection 與 family detection 測試。
- [ ] 補齊 network/chain mismatch、invalid chain id、invalid EVM address 等 typed error。

### Phase 2：Wallet persistence 與 migration

涉及位置：

- `src/adapters/outbound/keystore/index.ts`
- `src/domain/types/wallet.ts`
- `src/domain/wallet/index.ts`
- `src/application/ports/account-store.ts`
- `src/application/ports/wallet-repository.ts`
- `src/application/use-cases/wallet-service.ts`
- `src/adapters/outbound/persistence/backup-writer.ts`
- wallet/keystore tests 與 migration fixtures

工作清單：

- [ ] 提升 `wallets.json` schema version。
- [ ] 處理既有 seed/private-key wallet 只有 TRON cached address 的資料；不能因 `ChainAddresses` 新增 `evm` 就讓舊檔失效。
- [ ] 定義 EVM address 的 lazy backfill／顯式 migration 時機，以及需要 master password 時的 UX。
- [ ] 確保 migration 使用 atomic write、lock，失敗不破壞原檔。
- [ ] 新建與新匯入的 seed/private-key wallet 同時產生 TRON 與 EVM address。
- [ ] `derive` 新 account 同時產生兩個 family address。
- [ ] watch-only 自動辨識 TRON／EVM；EVM address 儲存前正規化。
- [ ] Ledger/watch 仍為 single-family source。
- [ ] list/current/use/rename/delete/backup 與 address lookup 支援 EVM address。
- [ ] backup metadata 同時包含已知的 TRON/EVM addresses，舊 wallet 尚未 backfill 時不得偽造欄位。
- [ ] 驗證同一 private key、不同 BIP44 seed path、舊資料 migration 與 dedup 行為。

### Phase 3：Config 與 NetworkRegistry

涉及位置：

- `src/adapters/outbound/config/builtins.ts`
- `src/adapters/outbound/config/index.ts`
- `src/adapters/outbound/config/yaml-config-document.ts`
- `src/application/ports/network-registry.ts`
- `src/application/use-cases/config-service.ts`
- `src/adapters/inbound/cli/commands/config.ts`
- `src/adapters/inbound/cli/commands/network.ts`

工作清單：

- [ ] 加入 `evm:1` 與選定測試網 builtin descriptor。
- [ ] 對使用者自訂 network 做 runtime schema validation，不再直接 cast 成 `NetworkDescriptor`。
- [ ] 支援任意合法 `evm:<chainId>`，並拒絕 `family`、id、chain id 不一致。
- [ ] 驗證 `rpcUrl`、native currency、fee model、aliases 與選配 indexer/explorer 欄位。
- [ ] `NetworkRegistry.resolve()` 支援 EVM canonical id、case-insensitive alias 與 ambiguity 檢查。
- [ ] `config defaultNetwork evm:1`、alias 設定與持久化可用。
- [ ] `wallet-cli networks` 顯示 builtin 與 custom EVM networks、native symbol、RPC/fee model/capabilities 的安全摘要。
- [ ] 不在一般輸出洩漏 RPC URL 中可能包含的 API key；需要 redaction 規則。
- [ ] network RPC client 首次使用時驗證遠端 chain id。

### Phase 4：Application ports 與共用 services

涉及位置：

- `src/application/ports/chain/evm-gateway.ts`（新增）
- `src/application/ports/chain/gateway-provider.ts`
- `src/application/services/evm-confirmation.ts`（新增）
- `src/application/services/capability/index.ts`（只有 per-network capability 需要時修改）

下列共用模組預期只補 EVM reuse tests，不修改 production code：`Broadcaster`、`LedgerDevice`、
`TxPipeline`、`SignerResolver`、software/device signer、`TargetResolver`、`transactionMode`。

工作清單：

- [ ] 定義 `EvmGateway`，只放 EVM 所需的 read/build/estimate/broadcast 能力。
- [ ] 將 `evm` 加入 `ChainGatewayMap`，保持 typed family lookup。
- [ ] 用 EVM fixtures 驗證共用 `Broadcaster`、`TxPipeline`、`Signer`、`SignStrategy` 可直接承載 EVM transaction；預期不修改 control flow。
- [ ] 實作 EVM confirmation normalization，保持 `--wait` timeout 後回 submitted receipt 的既有契約。
- [ ] 支援 legacy 與 EIP-1559 fee model；network-specific trait 不得被 family-wide command capability 誤判為所有 EVM network 都支援。
- [ ] 調整 capability 註冊方式，區分「family 有這個 command」與「此 network 有 indexer／EIP-1559 等能力」。
- [ ] 保持 watch-only 禁止簽名、wrong-family account 阻擋、dry-run 不解密私鑰等 invariant。

### Phase 5：EVM outbound adapters

新增位置建議：

```text
src/adapters/outbound/chain/evm/
├── index.ts
├── provider.ts
├── evm.ts
├── signing-strategy.ts
├── evm-responses.ts
└── history-reader.ts       # 僅在決定支援 history/indexer 時加入
```

工作清單：

- [ ] 實作 per-network EVM JSON-RPC client/gateway。
- [ ] 實作 native balance、nonce/code、block、transaction、receipt 與 fee/gas reads。
- [ ] 實作 native/ERC-20 transfer、contract call/send/deploy、estimate 與 raw transaction broadcast。
- [ ] 實作 software transaction signing 與 personal-message signing。
- [ ] 所有 RPC response 先驗證再 normalize，避免將 provider-specific shape 傳入 use case。
- [ ] 統一處理 revert reason、replacement/nonce、insufficient funds、underpriced fee、chain mismatch、timeout 等錯誤。
- [ ] 如支援 account history／ABI metadata，新增獨立 explorer/indexer adapter，不假裝標準 JSON-RPC 能提供。
- [ ] 加入 EVM adapter unit tests，mock transport，不依賴公開 RPC。

### Phase 6：Ledger EVM adapter

涉及位置：

- `src/adapters/outbound/ledger/index.ts` 或拆成 family-specific device adapters
- `src/application/ports/ledger-device.ts`
- `src/application/services/signer/ledger.ts`
- `src/application/services/ledger-account.ts`
- `src/adapters/inbound/cli/commands/wallet.ts`
- `src/bootstrap/composition.ts`
- package dependencies 與 tsup bundling 設定

工作清單：

- [ ] 加入 Ethereum Ledger app transport、address、transaction signing 與 message signing。
- [ ] EVM derivation path 使用 coin type 60，並支援 index/path/address scan 的既有流程。
- [ ] `import ledger --app ethereum` 出現在 schema、help、interactive choices 與 tests。
- [ ] precheck 比對裝置 address 與 cached address。
- [ ] 分類 user rejection、wrong app、locked device、wrong seed 與 transport error。
- [ ] 更新 tsup `noExternal`／native addon 設定與 Ledger emulator/實機驗證。

### Phase 7：EVM application use cases

新增位置建議：

```text
src/application/use-cases/evm/
├── account-service.ts
├── token-service.ts
├── transaction-service.ts
├── contract-service.ts
└── block-service.ts
```

工作清單：

- [ ] 實作 EVM account balance/info/portfolio；history 依第 2 節決策處理。
- [ ] 實作 ERC-20 metadata、balance 與 token book workflows。
- [ ] 實作 native/ERC-20 send、signed raw tx broadcast、status/info。
- [ ] 實作 contract call/send/deploy/info 的既定第一版語意。
- [ ] 實作 EVM block query。
- [ ] 重用 `MessageService`、`TxPipeline`、`TransactionMode`、token repository 與 price port；不要重用帶 TRON 語意的 use case。
- [ ] 所有回傳 shape 使用 family-aware、可穩定輸出的 normalized view。

### Phase 8：EVM CLI command module

新增位置建議：

```text
src/adapters/inbound/cli/commands/evm/
├── index.ts
├── account.ts
├── token.ts
├── tx.ts
├── contract.ts
├── message.ts
└── block.ts
```

涉及的共用位置：

- `src/adapters/inbound/cli/commands/shared.ts`
- `src/adapters/inbound/cli/schemas/index.ts`
- `src/adapters/inbound/cli/arity/index.ts`
- `src/adapters/inbound/cli/registry/index.ts`
- `src/adapters/inbound/cli/shell/index.ts`
- `src/adapters/inbound/cli/context/index.ts`
- `src/adapters/inbound/cli/command-id.ts`

工作清單：

- [ ] 每個 EVM command 登記 `family: "evm"`、logical path、capability、requirements、Zod fields、examples 與 formatter。
- [ ] EVM address、hash、hex data、ABI、quantity、gas、fee、nonce、block identifier 使用 EVM-specific schema。
- [ ] `tx send` 同時處理 native 與 ERC-20，但不暴露 TRC10/TRC20 flags。
- [ ] legacy/EIP-1559 的 command flags、互斥條件與 defaults 由單一 schema 驅動 help 與 JSON Schema。
- [ ] EVM 不註冊 `stake` commands。
- [ ] logical routing 由 `--network evm:<chainId>` 選到 EVM implementation；TRON/EVM 同 path 不互相污染 fields 或 examples。
- [ ] command id 穩定為 `evm.<path>`，例如 `evm.tx.send`。

### Phase 9：Bootstrap 與 family composition

涉及位置：

- `src/bootstrap/families/evm.ts`（新增）
- `src/bootstrap/families/types.ts`
- `src/bootstrap/family-registry.ts`
- `src/bootstrap/composition.ts`
- `src/bootstrap/runner.test.ts`
- `src/adapters/outbound/chain/tron/provider.ts`（可改名為 family-neutral gateway registry 位置）

工作清單：

- [ ] 建立 `evmFamily` plugin：meta、gateway factory、sign strategy、use cases、command module。
- [ ] 將 `evmFamily` 加入 `FAMILY_REGISTRY`。
- [ ] `familyMap()` 對 TRON/EVM factories 與 signing strategies 都完整。
- [ ] gateway cache 仍以 canonical network id 隔離，不共用不同 chain 的 client。
- [ ] capability composition 依 family command + per-network traits 正確產生。
- [ ] bootstrap tests 期望 enabled families 為 `tron`、`evm`，並驗證兩者 command registration。

### Phase 10：Help、discovery 與 machine catalog

這一階段是公開 EVM 支援的必要條件，不可視為文件收尾。

涉及位置：

- `src/adapters/inbound/cli/help/index.ts`
- `src/adapters/inbound/cli/help/catalog.ts`
- `src/adapters/inbound/cli/globals/index.ts`
- `src/adapters/inbound/cli/registry/index.ts`
- `src/adapters/inbound/cli/commands/network.ts`
- help/golden tests 與 baselines

必須支援並測試：

- [ ] `wallet-cli --help`
  - 顯示支援 families：TRON、EVM。
  - 說明 command implementation 由 `--network` 選擇。
  - 至少有一個 `--network evm:1` 範例。
  - `stake` 明確標示 TRON-only。
- [ ] `wallet-cli evm --help`
  - 顯示 EVM 可用 command tree，不出現 `stake`。
  - 如果 `evm` prefix 只用於 help/catalog discovery，而不能用於一般執行，必須在輸出中明說。
- [ ] `wallet-cli evm tx send --help`
  - 只顯示 EVM fields、EVM examples、fee model 說明與 EVM address 格式。
- [ ] `wallet-cli tx send --help`
  - merged logical help 必須清楚標示 family-specific flags/examples，不能只拿 registry 第一個 family 的 metadata。
- [ ] `wallet-cli tx send --network evm:1 --help`
  - meta parsing 必須正確消耗 `--network` value，並解析成 EVM help；不得把 `evm:1` 當 command positional。
- [ ] `wallet-cli networks --help`
  - 說明 canonical id `evm:<chainId>`、aliases 與 custom network 來源。
- [ ] `wallet-cli --json-schema`
  - 完整 catalog 包含 `evm.*` commands。
  - catalog 頂層建議增加 enabled families 與可用 networks 摘要。
- [ ] `wallet-cli evm --json-schema`
  - 只輸出 EVM chain commands，schema 與 examples 不含 TRON-only flags。
- [ ] 每個 EVM leaf 的 `--json-schema`
  - input schema、requires、capability、examples 與 stdin flags 正確。
- [ ] global `--network` description
  - 範例至少包含 `tron:nile`、`evm:1`、alias 與 config fallback。
- [ ] unknown/disabled family、unknown EVM network、family/network mismatch 都輸出明確 usage error 與 exit 2。

### Phase 11：Text 與 JSON output

涉及位置：

- `src/adapters/inbound/cli/render/index.ts`
- `src/adapters/inbound/cli/render/scalars.ts`
- `src/adapters/inbound/cli/output/envelope.ts`
- `src/adapters/inbound/cli/contracts/envelope.ts`
- formatter/envelope/golden tests

工作清單：

- [ ] 在 `FAMILY_RENDER` 加入 EVM hooks。
- [ ] native amount 依 network `nativeCurrency` 顯示，不假設所有 EVM network 都是 ETH。
- [ ] EVM transaction info/receipt 顯示 hash、from/to/value、nonce、gas、fee、status、block 與 contract address。
- [ ] legacy 與 EIP-1559 fee text 都能正確呈現。
- [ ] wallet/list/current/import/derive 顯示 TRON 與 EVM address，且 address 不被錯誤縮寫或標錯 family。
- [ ] `networks` text table 顯示 EVM chain id、native symbol 與 fee model。
- [ ] JSON envelope 保持 `wallet-cli.result.v1`，並輸出：
  - `command: "evm...."`
  - `chain.family: "evm"`
  - `chain.networkId: "evm:<chainId>"`
  - `chain.chainId: "<chainId>"`
- [ ] 所有 wei、gas、fee、nonce 與 block quantity 避免 JavaScript number precision loss；JSON 中使用穩定字串規則。
- [ ] error、warning、progress 仍遵守 stdout/stderr 與單一 terminal frame 契約。

### Phase 12：Token book 與 price provider

涉及位置：

- `src/adapters/outbound/tokenbook/builtins.ts`
- `src/adapters/outbound/tokenbook/index.ts`
- `src/application/ports/token-repository.ts`
- `src/adapters/outbound/price/coingecko.ts`
- `src/application/ports/price-provider.ts`

工作清單：

- [ ] 為選定 builtin EVM networks 加入官方 ERC-20 token entries；測試網可維持空清單。
- [ ] ERC-20 contract id 使用一致的 normalized/checksummed comparison，避免大小寫重複。
- [ ] 確認 token book scope 仍為 `(networkId, accountRef)`，不同 EVM chain 不共用清單。
- [ ] CoinGecko native coin id 與 asset platform 不可只用 `evm:` prefix 推導；必須按實際 network mapping/config 決定。
- [ ] custom EVM network 沒有 price mapping 時回 null/warning，不讓 portfolio command 失敗。
- [ ] token price lookup、official/user merge、remove protection 與 portfolio tests 涵蓋 EVM。

### Phase 13：測試與品質門檻

#### Unit tests

- [ ] EVM address derive/validate/checksum。
- [ ] BIP44 coin type 60 與 seed/private-key address derivation。
- [ ] network descriptor validation、canonical id、arbitrary chain id、aliases、RPC chain mismatch。
- [ ] wallet migration、backfill、dedup、watch/Ledger family pinning。
- [ ] EVM gateway RPC normalization 與 typed errors。
- [ ] software/Ledger transaction與 message signing。
- [ ] legacy/EIP-1559 transaction build、estimate、broadcast、confirmation。
- [ ] ERC-20、contract、block、account 與 portfolio use cases。
- [ ] EVM commands、registry routing、target/capability gates、renderers、envelopes。

#### CLI/golden tests

- [ ] root/family/group/leaf `--help`。
- [ ] root/family/leaf `--json-schema`。
- [ ] `networks` text + JSON 包含 `evm:1` 與 custom `evm:31337`。
- [ ] `config defaultNetwork evm:1` 與 alias round trip。
- [ ] `--network evm:1` 路由成 `evm.*` command id。
- [ ] 同一 logical command 在 TRON/EVM 下得到不同 schema、client 與 output。
- [ ] wrong-family account、unknown chain、alias collision、unsupported network trait。
- [ ] JSON one-frame、exit `0/1/2`、stderr progress、secret redaction。
- [ ] 舊 TRON golden tests 全部維持通過；root help 的預期輸出改用新的 multichain baseline。

#### Integration/live tests

- [ ] 新增本機 EVM suite，建議使用 Anvil，覆蓋 account、native/ERC-20 send、contract、block、sign-only、broadcast、`--wait`。
- [ ] 新增公開 EVM testnet smoke suite，使用隔離 wallet home 與秘密來源，不記錄 private key。
- [ ] 保留 Nile live suite，確認 EVM 變更沒有造成 TRON regression。
- [ ] 如支援 Ledger EVM，加入 Speculos 或實機 smoke tests。

#### Required commands

```bash
npm run typecheck
npm run depcruise
npm test
npm run build
npm run test:parity:help
npm run test:live:nile
# 新增：EVM local integration suite
# 新增：EVM public-testnet smoke suite
```

### Phase 14：使用者文件與發布

涉及位置：

- `README.md`
- `docs/architecture.md`
- network/config 範例文件
- command/help baselines
- release notes 與 migration notes

工作清單：

- [ ] README 改為 TRON + EVM，加入 `evm:1`、custom chain、wallet 與 send 範例。
- [ ] 架構圖與 family extension 章節標記 EVM 已實作，不再寫成未來項目。
- [ ] 文件列出 builtin networks、canonical id、aliases、custom network schema 與 defaultNetwork 設定方式。
- [ ] 說明同一 wallet 的 TRON/EVM derivation path 不同，以及 watch/Ledger 為 single-family。
- [ ] 說明 EVM history、contract metadata、price、Ledger 等選配能力及其 network requirements。
- [ ] 提供從舊 wallets schema 升級的行為、備份建議與失敗復原方式。
- [ ] 發布前以全新 home 與舊版 home 各跑一次 end-to-end 驗收。

## 4. 主要檔案異動總表

| Layer | 修改 | 新增 |
| --- | --- | --- |
| Domain | family、address、network、wallet、tx、token、errors | EVM codec/types（可依現有模組內聚） |
| Application contracts/ports | gateway map、ledger/transaction contracts、capabilities | `evm-gateway.ts` |
| Application services | signer、pipeline、target、capability | `evm-confirmation.ts` |
| Application use cases | shared message/wallet integration | `use-cases/evm/*` |
| Outbound adapters | config、keystore、ledger、tokenbook、price、gateway registry | `chain/evm/*` |
| Inbound CLI | schemas、shell、registry、help、render、output、wallet/network commands | `commands/evm/*` |
| Bootstrap | family types、registry、composition、tests | `families/evm.ts` |
| Tooling | dependencies、tsup、test scripts、baselines | EVM local/live scripts與 fixtures |
| Docs | README、architecture、network/config docs | migration/release notes |

## 5. 不可接受的捷徑

- 不可只把 `evm` 加入 union，卻不處理舊 wallet address cache migration。
- 不可在 `ConfigLoader` 對自訂 network 直接 type cast 而不驗證。
- 不可將 EVM RPC methods 加進 `TronGateway` 或建立包含所有鏈方法的 universal gateway。
- 不可讓所有 EVM networks 因為 family 有 command 就自動獲得 explorer、history 或 EIP-1559 capability。
- 不可讓 root help、leaf help、JSON Schema 仍只顯示 TRON examples。
- 不可硬編碼所有 EVM native currency 為 ETH。
- 不可將 bigint fee/value 轉成不安全的 JavaScript number。
- 不可在 RPC URL、error、verbose log、JSON envelope 或 test artifact 洩漏 API key／private key。
- 不可因新增 EVM 而改壞 TRON command ids、JSON envelope、exit code 或 stdout/stderr discipline。

## 6. 最終驗收範例

以下行為全部成立，才可宣告 EVM 已公開支援：

```bash
wallet-cli --help
wallet-cli evm --help
wallet-cli evm tx send --help
wallet-cli tx send --network evm:1 --help
wallet-cli --json-schema
wallet-cli evm --json-schema

wallet-cli networks
wallet-cli config defaultNetwork evm:1
wallet-cli account balance --network evm:1
wallet-cli account balance --network evm:31337
wallet-cli tx send --network evm:1 --to 0x... --amount 0.01
wallet-cli token balance --network evm:1 --contract 0x...
wallet-cli contract call --network evm:1 --contract 0x... ...
wallet-cli block --network evm:1
wallet-cli message sign --network evm:1 --message hello
```

其中 `evm:31337` 必須能由使用者 config 提供；不要求每個 chain id 都成為 builtin network。
