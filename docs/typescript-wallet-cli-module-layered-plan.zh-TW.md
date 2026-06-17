# TypeScript Wallet CLI — 模組分層開發計劃(依依賴關係分層)

> 本文件以**模組(Object / Class)為單位**描述 TypeScript Wallet CLI 的設計,
> 並依**模組間的依賴關係**做嚴格分層,讓「先開發什麼、什麼能獨立測、加東西動到誰」一目了然。
>
> **需求基線**:Standard CLI only、JSON envelope、0/1/2 exit code、彈性 flag 位置、
> wallet-centric keystore、strict stream discipline、TRON+EVM、Ledger watch-only。
>
> **本文件為唯一開發 source of truth。** 架構與分層看 §1–§6;磁碟結構、`wallets.json`/`config.yaml`
> 範例與規則、加密 envelope、輸出契約、error code、capability 鍵、flag 分類、命令清單、多鏈差異、
> Ledger 套件、函式庫/測試/里程碑等實作規格集中在 [§7 開發參考資料](#7-開發參考資料具體規格)。

---

## 鎖定的決策(讀之前先看)

| 決策 | 內容 |
| --- | --- |
| **命令文法 = B(family-positional)** | 綁鏈命令:`wallet-cli <family> <resource> <action> --network <net> [flags]`;`family` ∈ `{tron, evm}`。命令身分由 positional 決定。 |
| **flag 位置 = kubectl 式** | global flag 兩邊都收(command 前後皆可);command 專屬 flag 放 command 後(**非完全位置無關**)。 |
| **CLI 框架 = yargs** | **yargs 管殼**(tokenize、路由、help 骨架、completion、interspersed flag);**zod 管契約**(驗證/型別/預設/跨欄/agent JSON-schema);**自寫 Output/Stream/Errors 管輸出與 exit**。必關掉 yargs 自帶 I/O 與 exit。 |

**命令樹(頂層 positional 只有一組固定保留字):**

```text
wallet-cli
├─ tron   <resource> <action> --network <tron-net>   # 綁鏈(需 --network)
├─ evm    <resource> <action> --network <evm-net>    # 綁鏈(需 --network)
├─ wallet  create | import | list | set-active | export-address | rename | add-account
├─ config  get | set
├─ chains  list
└─ capabilities --network <net>
```

- `tron` / `evm` = **鏈家族群組**(綁鏈命令,要 `--network`,且 `--network` 的 family 必須與此一致,否則 `network_family_mismatch`)。
- `wallet` / `config` / `chains` / `capabilities` = **中立群組**(不屬任何鏈、不帶 `--network`,`capabilities` 例外)。
- **Ledger / 匯入屬中立群組**:一把 seed / 私鑰 / Ledger **同時衍生 tron(195)+ evm(60)地址**,匯入不是「對某條鏈」的操作,放 `wallet`。
  ```text
  wallet-cli wallet import --type ledger        # 註冊 Ledger(watch-only,兩鏈地址都快取)
  wallet-cli wallet set-active --account ledger-main
  wallet-cli tron send-native --network nile --to T..   # 簽名才回鏈命令;是不是 ledger 由 SignerResolver 自己判斷
  ```

---

## 1. 怎麼讀這份文件

**分層規則(invariant):**

1. **依賴只能往下指。** 上層可以依賴下層,**下層永遠不依賴上層**。
2. **同一層的模組彼此不依賴。**
3. **最底層 = 零內部依賴的函式庫/型別**,集中寫在一起([§3 第 0 層](#第-0-層零內部依賴函式庫與型別))。

> **「依賴」的定義(重要)**:這裡的箭頭只算 **runtime/value 依賴**——「A import 並呼叫/實例化 B」。
> **type-only 參照不算依賴。** 所有跨層共用的**型別與介面**集中放在最底層 `SharedTypes`(L0),
> **實作**放在各自功能層。這樣任何模組都能拿到型別、可獨立 type-check 與測試,而箭頭只反映真正的執行期耦合。
> (例:`Contract` 的 `run(ctx: ExecutionContext)` 只是 type 參照;`ExecutionContext` 的**實作**在 L2,
> Contract 不 import 它,所以 Contract 仍在 L1。)

開發順序 = **由下往上**;閱讀順序 = **由上(進入點)往下(葉子)**。每個模組三段:**職責 / 依賴 / 物件**。

---

## 2. 依賴分層總覽

```mermaid
flowchart TD
    classDef l5 fill:#E8F0FE,stroke:#4C78A8,color:#1F2D3D;
    classDef l4 fill:#EAF7EA,stroke:#59A14F,color:#1F2D3D;
    classDef l3 fill:#FFF4E5,stroke:#F28E2B,color:#1F2D3D;
    classDef l2 fill:#F3E8FF,stroke:#9C6ADE,color:#1F2D3D;
    classDef l1 fill:#E6F7F5,stroke:#2CB1A1,color:#1F2D3D;
    classDef l0 fill:#FDEBEC,stroke:#E15759,color:#1F2D3D;

    subgraph T5["第 5 層 · 進入點"]
        RUN["Runner (main)"]
    end
    subgraph T4["第 4 層 · CLI 殼 + 命令實作"]
        YARGS["CliShell (yargs)"]
        HELP["HelpService"]
        TRON["TronModule"]
        EVM["EvmModule"]
        NEU["中立命令群組<br/>wallet/config/chains/capabilities"]
    end
    subgraph T3["第 3 層 · 路由 / 閘門 / 交易流程"]
        CREG["CommandRegistry"]
        CGATE["CapabilityGate"]
        TXP["TxPipeline"]
    end
    subgraph T2["第 2 層 · 整合服務"]
        CTX["ExecutionContext"]
        SIGN["SignerResolver"]
        CCORE["ChainCore"]
        FMT["OutputFormatter"]
        ADAPT["ZodYargsAdapter"]
    end
    subgraph T1["第 1 層 · 基礎服務"]
        CONTRACT["Contract"]
        KS["Keystore"]
        CFG["ConfigLoader / NetworkRegistry"]
        SECRET["SecretResolver"]
        RPC["RpcClient"]
        LED["Ledger"]
    end
    subgraph T0["第 0 層 · 零內部依賴函式庫與型別"]
        TYPES["SharedTypes"]
        ERR["Errors"]
        CRYPTO["CryptoEnvelope"]
        DERIV["Derivation"]
        ADDR["AddressCodec"]
        FILE["AtomicFileStore"]
        SM["StreamManager"]
    end

    RUN --> YARGS & HELP & FMT
    YARGS --> CREG & CGATE & CTX & ADAPT & FMT
    HELP --> CREG & CONTRACT
    TRON --> CCORE & ADDR & RPC & TXP & SIGN & CONTRACT
    EVM --> CCORE & ADDR & RPC & TXP & SIGN & CONTRACT
    NEU --> KS & CFG & CCORE & CONTRACT
    CREG --> CONTRACT & CCORE
    CGATE --> CCORE
    TXP --> SIGN & RPC
    CTX --> CFG & KS & SECRET & SM
    SIGN --> KS & DERIV & LED
    CCORE --> CONTRACT
    FMT --> CONTRACT
    ADAPT --> CONTRACT
    CONTRACT --> TYPES & ERR
    KS --> CRYPTO & DERIV & ADDR & FILE & ERR & TYPES
    CFG --> FILE & TYPES & ERR
    SECRET --> SM
    RPC --> TYPES
    LED --> ADDR & DERIV

    class RUN l5;
    class YARGS,HELP,TRON,EVM,NEU l4;
    class CREG,CGATE,TXP l3;
    class CTX,SIGN,CCORE,FMT,ADAPT l2;
    class CONTRACT,KS,CFG,SECRET,RPC,LED l1;
    class TYPES,ERR,CRYPTO,DERIV,ADDR,FILE,SM l0;
```

> **第 4 層的 `CliShell` 與 `TronModule`/`EvmModule`/中立群組同層,但彼此不依賴**:`CliShell` 透過
> `CommandRegistry` + `Contract` 介面在 runtime 拿到 `cmd` 並呼叫 `cmd.run`,**編譯期不 import 任何命令模組**;
> 命令模組只是 `registry.add()` 把自己插進去。這是依賴反轉——殼是 host、命令是 plugin,在 registry 交會。

**速查表**

| 層 | 模組 | 一句話 |
| --- | --- | --- |
| 5 | `Runner` | 攔 meta flag → HelpService;否則組 yargs、parse、收斂 error、回 exit code。 |
| 4 | `CliShell` `HelpService` `TronModule` `EvmModule` `中立群組` | CLI 殼、說明、各鏈完整命令面、錢包/設定等中立命令。 |
| 3 | `CommandRegistry` `CapabilityGate` `TxPipeline` | 具體命令解析、能力閘門、交易流程(含 Ledger 等待舞步)。 |
| 2 | `ExecutionContext` `SignerResolver` `ChainCore` `OutputFormatter` `ZodYargsAdapter` | 把第 1 層組起來的整合服務。 |
| 1 | `Contract` `Keystore` `ConfigLoader/NetworkRegistry` `SecretResolver` `RpcClient` `Ledger` | 只依賴第 0 層,彼此獨立。 |
| 0 | `SharedTypes` `Errors` `CryptoEnvelope` `Derivation` `AddressCodec` `AtomicFileStore` `StreamManager` | 零內部依賴,最先寫、可獨立測。 |

---

## 3. 模組逐一說明(由上而下)

### 第 5 層 · 進入點

#### `Runner`

**職責**:先攔 `--help`/`--version`/`--json-schema` 等 meta flag,短路給 `HelpService`;否則組 yargs CLI、`parseAsync`,把結果或 typed error 收斂成**一次執行只有一個終局輸出**,回 `0/1/2`。
**依賴**:`CliShell(yargs)`、`HelpService`、`OutputFormatter`、`Errors`。

```ts
async function main(argv: string[]): Promise<ExitCode> {
  const tokens = hideBin(argv)
  if (hasMeta(tokens)) return help.handleMeta(tokens)   // --help/--version/--json-schema 短路(保 JSON 乾淨)
  const cli = buildCli(registry)
  try {
    await cli.parseAsync(tokens)                          // yargs 只解析 + dispatch;不輸出、不 exit
    return EXIT.OK                                        // dispatch 內已寫出 result envelope
  } catch (e) {
    const err = normalizeError(e)                         // yargs .fail()/handler 拋出的都在此收斂
    formatter.error(err)
    return err.exitCode()                                 // 2=usage / 1=execution
  }
}
```

---

### 第 4 層 · CLI 殼 + 命令實作

#### `CliShell (yargs)`

**職責**:把 `CommandRegistry` 的命令樹註冊進 yargs(`tron`/`evm` family 群組 + 中立群組),宣告全域 flag(global-by-default = kubectl 式),**關掉 yargs 自帶 I/O 與 exit**,並提供 `dispatch`:解析具體命令 → 建 ctx → 解析網路(含 family 一致性檢查)→ zod 驗 → 能力閘門 → `cmd.run`。token 切分、flag 收集、help 排版一律交給 yargs。
**依賴**:`CommandRegistry`、`CapabilityGate`、`ExecutionContext`、`ZodYargsAdapter`、`OutputFormatter`、外部 `yargs`。

```ts
function buildCli(reg: CommandRegistry) {
  const cli = yargs()
    .exitProcess(false).help(false).version(false)        // exit/help 自己接,保 JSON stdout 乾淨
    .fail((msg, err) => { throw err ?? new UsageError("invalid_option", msg) })
    .options(GLOBAL_OPTS)                                  // yargs option 預設 global → kubectl 式

  for (const fam of reg.families())                        // ["tron","evm"];加鏈就多一圈
    cli.command(`${fam} <resource> <action>`, `${fam} commands`,
      y => ZodYargsAdapter.applyArity(y, reg.flagsOf(fam)),
      argv => dispatch(reg, fam, argv))

  for (const ns of ["wallet", "config", "chains", "capabilities"])  // 中立群組
    cli.command(`${ns} [action]`, `${ns}`, y => y, argv => dispatch(reg, ns, argv))
  return cli
}

async function dispatch(reg: CommandRegistry, ns: string, argv) {
  const family = (ns === "tron" || ns === "evm") ? ns as ChainFamily : undefined
  const path = [argv.resource, argv.action].filter(Boolean)        // chain:[resource,action] / neutral:[action]
  const cmd = reg.resolveConcrete(ns, path)
  if (!cmd) throw new UsageError("unknown_command")

  const ctx = buildExecutionContext(pickGlobals(argv))
  let net: NetworkDescriptor | undefined
  if (cmd.network === "required") {
    net = ctx.networkRegistry.resolve(argv.network)               // 缺值→missing_network;歧義→ambiguous_network_alias
    if (family && net.family !== family)                          // ★ 守門:tron --network bsc → 擋
      throw new UsageError("network_family_mismatch", `${family} 不支援網路 ${net.id}`)
  }
  const input = cmd.input.parse(argv)                             // ★ zod 才是真正驗證(yargs 只切對 token)
  capabilities.check(cmd, net)                                    // 同 family 跨網路能力差異
  const data = await cmd.run(ctx, net, input)
  ctx.streams.result(formatter.success(cmd, net, data))          // 恰好一個 stdout frame
}
```

> 必須 `.exitProcess(false)` + 自訂 `.fail()` + `.help(false)`,否則 yargs 會自己印 help/錯誤到 stdout、自己 exit,破壞 JSON 契約與 0/1/2。

#### `HelpService`

**職責**:`--help` / `--version` / `--json-schema`。**第一版即做完整 zod-driven help**——每 flag 的說明(zod `.describe()`)、必填/選填/預設、範例、以及 agent 用 JSON-schema 全部由命令的 zod `fields`/`input` 產;yargs 只負責排版骨架(群組列表、`Usage:`、`did you mean`)。一份 zod = 驗證 + 型別 + help + agent schema,永不漂移。
**依賴**:`CommandRegistry`、`Contract`(+ 外部 `zod-to-json-schema`)。

```ts
class HelpService {
  handleMeta(tokens: string[]): ExitCode   // 解析 positionals → 該命令/群組 → render 或 jsonSchema
  render(path: string[]): string           // 走訪 cmd.fields:欄名→--kebab、.describe()→說明、optional/default 標註 + examples
  jsonSchema(path: string[]): object       // zodToJsonSchema(cmd.input),agent 自省
}
```

> family 在 positional(`tron get-balance --help`),命令身分一看就定:不必先給 `--network` 就能解析 help 與自省。

#### `TronModule` / `EvmModule`

**職責**:每條鏈實作**自己完整的命令面**(無 universal provider,只共用 infra)。TRON ~100 命令、EVM ~20 命令。命令註冊到 `CommandRegistry`,自動掛在對應 yargs 群組。簽名類命令在 `run()` 裡呼叫 `TxPipeline`;讀類命令用 `ctx.resolveAddress(family)` 取地址、用 `net.rpc` 查詢。
**依賴**:`ChainCore`(實作 `ChainModule`)、`Contract`、`AddressCodec`、`RpcClient`、`TxPipeline`、`SignerResolver`(message sign 等不走 pipeline 的簽名)。

```ts
const tronSendNative: CommandDefinition = {
  id: "tron.tx.send-native", path: ["tx", "send-native"], family: "tron",
  network: "required", wallet: "required", auth: "required", capability: "tx.native.transfer",
  fields: tronSendNativeFields, input: tronSendNativeInput, examples: [...],
  run: (ctx, net, input) => txPipeline.run({
    ctx, net: net!, account: ctx.activeAccount,
    build:    (from) => tronBuildTransfer(net!.rpc!, from, input.to, input.amountSun),  // 鏈專屬
    estimate: (tx)   => tronEstimateBandwidth(net!.rpc!, tx),                           // 鏈專屬
    dryRun: input.dryRun, broadcast: input.broadcast,
  }),
}
// TronModule.registerCommands(reg) { reg.add(tronSendNative); reg.add(tronFreeze); … }
```

> **rule of three**:兩鏈相同 intent + 相同 input shape 才抽共用 factory;即便共用,回傳資料仍各自 chain-shaped。

#### 中立命令群組(`commands/`)

**職責**:不綁鏈的命令:`wallet`(含 import/ledger 註冊/list/set-active/rename/add-account)、`config`、`chains`、`capabilities`。直接用 `Keystore` / `ConfigLoader`,不走 `TxPipeline`。
**依賴**:`Keystore`、`ConfigLoader/NetworkRegistry`、`ChainCore`(capabilities 查詢)、`Contract`、`Ledger`(註冊時)。

```ts
const walletImportLedger: CommandDefinition = {
  id: "wallet.import", path: ["import"], network: "none", wallet: "none", auth: "optional",
  run: async (ctx, _net, input) => {
    if (input.type === "ledger") {
      const family = input.app === "ethereum" ? "evm" : "tron"            // --app tron|ethereum → family
      const path = await resolveLedgerPath(ledger, family, input)         // --index|--path|--address 三擇一(反查見 §7.14.1)
      ctx.emit({ type: "awaiting_device", reason: "verify_address" })     // 進度經 ctx.emit → stderr,Ledger 模組不印
      const address = await ledger.getAddress(family, path, { display: false })
      return keystore.registerLedger({ family, path, address, label: input.label })
    }
    // privateKey / seed:從 SecretResolver 讀 stdin,passphrase 選填
    return keystore.import({ type: input.type, secret: ctx.secrets.read(input.type),
                             passphrase: input.passphrase, label: input.label })
  },
}
```

---

### 第 3 層 · 路由 / 閘門 / 交易流程

#### `CommandRegistry`

**職責**:持有所有 `CommandDefinition`;`resolveConcrete(ns, path)` → 具體命令(`ns` = family 或中立群組名);提供 metadata 給 `CliShell` 建 yargs 樹、給 `HelpService` 產說明。切 token/收 flag/排 help 交給 yargs。
**依賴**:`Contract`、`ChainCore`。

```ts
class CommandRegistry {
  add(cmd: CommandDefinition): void
  families(): ChainFamily[]                                       // 給 CliShell 建 family 群組
  flagsOf(family: ChainFamily): FlagArityHints                    // 給 CliShell 餵 yargs arity
  resolveConcrete(ns: string, path: string[]): CommandDefinition | null   // "tron"+["account","balance"] → tron.account.balance
  tree(): CommandTreeMeta                                         // 給 HelpService
}
```

#### `CapabilityGate`

**職責**:只做**同一 family 內、跨網路的能力差異**檢查(Base 有 `fee.eip1559`、BSC 只有 legacy)。跨 family 的「命令不存在」由 `CommandRegistry` 處理(`unknown_command`),`family↔network` 不符由 `CliShell` 擋(`network_family_mismatch`)。
**依賴**:`ChainCore`(CapabilityRegistry)。

```ts
class CapabilityGate {
  check(cmd: CommandDefinition, net?: NetworkDescriptor): void {
    if (!cmd.capability || !net) return
    if (!this.caps.supports(net.id, cmd.capability))             // 能力以「每網路」為準(見 ChainCore)
      throw new UsageError("unsupported_network_capability", `${net.id} 不支援 ${cmd.capability}`)
  }
}
```

#### `TxPipeline`

**職責**:所有簽名命令共用的流程:resolve signer → build unsigned → estimate → (dry-run?) → sign → (broadcast?)。**Ledger「印等待字 + timeout + abort」的舞步集中在此,不在各命令複製。** chain 專屬的 build/estimate 由 callback 傳入。
**依賴**:`SignerResolver`、`RpcClient`(經 `net.rpc`)。

```ts
class TxPipeline {
  async run(p: {
    ctx: ExecutionContext; net: NetworkDescriptor; account: AccountRef
    build: (signerAddr: string) => Promise<UnsignedTx>
    estimate: (tx: UnsignedTx) => Promise<FeeReport>
    dryRun: boolean; broadcast: boolean
  }): Promise<TxOutcome> {
    const { streams, timeoutMs, noDeviceWait } = p.ctx
    const signer = this.signers.resolve(p.account, p.net.family)   // 回 Signer(含 kind + address)
    const tx = await p.build(signer.address)                       // build/estimate 完全不碰裝置
    const fee = await p.estimate(tx)
    if (p.dryRun) return { stage: "plan", tx, fee }

    let signed: SignedTx
    if (signer.kind === "device") {
      await signer.precheck!()                                     // 沒連/鎖住/開錯 app → auth_required
      if (noDeviceWait) throw new ChainError("signing_rejected", "--no-device-wait")
      streams.diagnostic("warn", "等待裝置確認簽名…")              // ← stderr / meta.warnings
      const ac = new AbortController()
      signed = await withTimeout(signer.sign(tx, { signal: ac.signal }), timeoutMs, () => ac.abort())
    } else {
      signed = await signer.sign(tx, {})                           // software:in-process,無人值守 OK
    }
    if (!p.broadcast) return { stage: "signed", signed, fee }
    return { stage: "broadcast", ...(await p.net.rpc!.broadcast(signed)) }
  }
}
```

> `signer.kind` 決定要不要等裝置;印字在 `TxPipeline`(持有 `ctx.streams`)而非 `LedgerSigner`,維持 stream 紀律。
> 先 build/estimate 再 sign:**會失敗的交易絕不會要使用者去插 Ledger**。

---

### 第 2 層 · 整合服務

> 五個模組彼此不依賴,可平行開發。

#### `ExecutionContext`

**職責**:由 config/env/flags 組裝執行上下文;持有 config、networkRegistry、streams、secrets、output、timeout、`activeAccount`。**選取是 account-level**:`activeAccount` 由 `--account`/`--wallet` 全域旗標或 `wallets.json.activeAccount` **惰性**解析;`resolveAddress(family)` 取該帳戶在某鏈的快取地址。**build 期無副作用**;秘密不入可序列化表面。
**依賴**:`ConfigLoader/NetworkRegistry`、`Keystore`(經 DI)、`SecretResolver`、`StreamManager`。型別 `ExecutionContext` 在 `SharedTypes`。

```ts
function buildExecutionContext(globals: Globals, deps: RuntimeDeps): ExecutionContext
// deps 提供 resolveAccount(globals) → AccountRef(Keystore 介面),達成依賴反轉
// 回傳物件實作 SharedTypes 的 ExecutionContext 介面:
//   { config, networkRegistry, streams, secrets, output, timeoutMs, noDeviceWait,
//     get activeAccount(): AccountRef,           // lazy
//     resolveAddress(family): string }           // = walletAddress(keystore.resolveAccount(activeAccount).wallet, family, index)
```

#### `SignerResolver`

**職責**:把「`AccountRef` + family」變成 `Signer`(含已快取 `address`)。依 `source.type` 決定 software / ledger:active account 是否需要硬體確認在此判定。
**依賴**:`Keystore`、`Derivation`、`Ledger`。

```ts
class SignerResolver {
  resolve(ref: AccountRef, family: ChainFamily): Signer {
    const { wallet, index } = this.keystore.resolveAccount(ref)        // index 僅 seed 用;privateKey/ledger 無 index
    const address = walletAddress(wallet, family, index)              // ledger: source.address(family 不符回 undefined)
    if (!address) throw new WalletError("missing_wallet_address")     // 含 ledger family-match 失敗
    switch (wallet.source.type) {
      case "privateKey":
        return new SoftwareSigner(this.keystore.decryptKey(wallet.source.keyId), address)
      case "seed": {
        const kp = Derivation.derive(this.keystore.decryptSeed(wallet.source.vaultId),
                                     Derivation.path(family, index))
        return new SoftwareSigner(kp.privateKey, address)
      }
      case "ledger":
        return new LedgerSigner(this.ledger, wallet.source.family, wallet.source.path, address)  // path+address 自 source;無 deviceId
    }
  }
}
```

#### `ChainCore`

**職責**:`CapabilityRegistry`(能力以**每網路**為準:同 family 不同網路能力可不同,如 EIP-1559)。`ChainModule` 介面定義在 `SharedTypes`(讓鏈模組與 registry 都能參照)。
**依賴**:`Contract`(型別參照,實際只用 SharedTypes 的介面)。

```ts
class CapabilityRegistry {
  register(networkId: NetworkId, caps: string[]): void    // 由各 NetworkDescriptor.capabilities 灌入
  supports(networkId: NetworkId, capability: string): boolean
}
// interface ChainModule 見 SharedTypes:family / networks() / capabilities() / registerCommands(reg)
```

#### `OutputFormatter`(human/json 雙實作 + factory)

**職責**:把 outcome 轉成終局 frame、把中間事件轉成進度 frame,**不改變行為**。JSON 恰好一個終局 envelope;空資料 `{}`;大數字串化。中立命令省略 `chain` 欄位。
不在單一類別裡灑 `if (output === "json")`,而是拆成介面 + `HumanOutputFormatter` / `JsonOutputFormatter` 兩實作,由 `createOutputFormatter(output)` 依 `--output` 選一個;`dispatch` / `TxPipeline` / `Runner` 全程只持有介面、永不分支。職責切分:formatter 純算字串,`StreamManager` 管寫入與 stream 選擇——寫入不塞進 formatter。
**依賴**:`Contract`(envelope 型別,實為 SharedTypes)。

```ts
interface OutputFormatter {
  success(cmd: CommandDefinition, net: NetworkDescriptor | undefined, data: unknown): string  // 終局 frame
  error(err: CliError): void                    // json→stdout envelope;text→stderr 簡訊(維持原契約)
  event(e: ProgressEvent): string | null        // ★新增:中間進度 frame;null = 此模式不顯示該事件
}
class HumanOutputFormatter implements OutputFormatter {}   // 人讀文字行(無 spinner/TTY)、人讀錯誤
class JsonOutputFormatter  implements OutputFormatter {}   // success/error envelope、NDJSON 事件物件字串
function createOutputFormatter(output: "text" | "json"): OutputFormatter   // 由 Runner/ctx 依 --output 建一次
```

> 終局資料流不變(handler 回 data → `formatter.success` → `streams.result` 一個 frame)。新增的 `event()` 只服務 `TxPipeline` / Ledger 等待這類長流程的**中間進度**(見 `StreamManager` 兩段式事件 + §7.7)。`ProgressEvent`(discriminated union,如 `awaiting_device`/`signed`/`broadcasting`)型別放 `SharedTypes`。

#### `ZodYargsAdapter`

**職責**:從命令的 zod `fields` 推導 yargs 需要的**最小 arity 提示**(boolean→switch、其餘→吃值),套進 yargs builder。**驗證/型別/預設/跨欄仍只在 zod**,不在 yargs DSL,維持單一事實來源。
**依賴**:`Contract`(+ 外部 `yargs` 型別)。

```ts
class ZodYargsAdapter { static applyArity(y: Argv, fields: ZodObject): Argv }
```

---

### 第 1 層 · 基礎服務

> 六個模組彼此不依賴,可平行開發、各自單測。

#### `Contract`

**職責**:擁有「**怎麼定義一條 command**」的機制:共用 zod 原語(`Schemas.*`)、`OutputEnvelope` builder。逐 command schema 隨各 chain 命令寫。`CommandDefinition` 介面本身在 `SharedTypes`。
**依賴**:`SharedTypes`、`Errors`(+ 外部 `zod`)。

```ts
const Schemas = { evmAddress, base58Address, uintString, amount, feeFields }   // 共用原語(值)
const OutputEnvelope = {
  success(cmd, net, data, meta): ResultEnvelope,   // net=undefined → 省略 chain
  error(err: CliError): ErrorEnvelope,
}
```

> `fields`(逐欄)餵 `ZodYargsAdapter` 產 yargs arity、供 HelpService;`input`(`fields.superRefine`)在 dispatch 一次驗(含跨欄)。

#### `Keystore`

**職責**:wallet-centric 儲存。加密 envelope(scrypt + aes-128-ctr + keccak MAC,每檔自帶 salt)、vault/key 獨立加密檔、`wallets.json` 註冊表、root `labels`、選取解析(`--account`/`--wallet`)。寫入經 `AtomicFileStore`(原子替換 + lock)。import 支援 BIP39 passphrase。資料形狀(`Wallet`/`Source`/`WalletsFile`/`AccountRef`)在 `SharedTypes`。
**依賴**:`CryptoEnvelope`、`Derivation`、`AddressCodec`、`AtomicFileStore`、`Errors`、`SharedTypes`。

```ts
class Keystore {
  generateId(prefix: "wlt"|"vlt"|"key"): string        // CSPRNG base32,撞庫重生;不含時間、不由秘密推導
  import(p: { secret; type: "seed"|"privateKey"; passphrase?: string; label?: string }): AccountRef
  registerLedger(p: { family: ChainFamily; path: string; address: string; label?: string }): AccountRef  // 單鏈單 path watch-only
  addAccount(walletId: string): AccountRef             // 僅 seed:append 下一 index;ledger 來源 → WalletError(改用 import)
  resolveAccount(refOrLabel: string): { wallet: Wallet; index: number }   // index 僅 seed 有意義(privateKey/ledger 無)
  resolveWallet(idOrLabel: string): Wallet
  rename(refOrLabel: string, label: string): void; setActive(ref: AccountRef): void
  list(): WalletView[]                                 // 明文,免解鎖
  delete(refOrWallet: string): void                    // 連帶清 labels 孤兒
  decryptSeed(vaultId: string): Bytes; decryptKey(keyId: string): Bytes
}
```

> 磁碟結構、`WALLET_CLI_HOME` 整棵搬移、`wallets.json` 範例、加密 envelope、id/ref/label 三者分離與選取規則:
> 詳見 [§7.2–§7.4](#72-磁碟版面與-wallet_cli_home)。
> **Ledger 等待提醒由中立命令印**(見上),Keystore/Ledger 不印。

#### `ConfigLoader / NetworkRegistry`

**職責**:先解析根目錄(`WALLET_CLI_HOME ?? ~/.wallet-cli`,bootstrap);分層合併 config(builtins < file < env < flags);建 network registry;`alias → canonical`,歧義→`ambiguous_network_alias`。`resolve` 時把對應的 `RpcClient` 實例掛上 `NetworkDescriptor.rpc`。只擁有 `config.yaml`。
**依賴**:`AtomicFileStore`(`config set` 也原子)、`RpcClient`(建實例掛上 descriptor)、`SharedTypes`、`Errors`(+ 外部 `yaml`)。

```ts
class ConfigLoader { static resolveRoot(env): Path; load(globals): Config }
class NetworkRegistry {
  constructor(config: Config, rpcFactory: (d: NetworkDescriptor) => RpcClient)
  resolve(idOrAlias: string): NetworkDescriptor        // 缺值→missing_network;回傳已掛 .rpc 的 descriptor
  all(): NetworkDescriptor[]
}
```

#### `SecretResolver`

**職責**:集中讀秘密,**每來源只讀一次並 memoize**(`MASTER_PASSWORD` / `--*-stdin`)。handler 不得直接讀 `process.stdin`。秘密不入 log/envelope。
**依賴**:`StreamManager`。

```ts
class SecretResolver { masterPassword(): string; read(kind: SecretKind): string }
```

#### `RpcClient`

**職責**:對節點發請求的薄包裝(TRON gRPC / EVM JSON-RPC),可對 mock 測。第三方 client 雜散輸出不得污染 stdout。**介面 `RpcClient` 在 `SharedTypes`**,此處只放實作。
**依賴**:`SharedTypes`(+ 外部 `tronweb`/`viem`)。

```ts
class TronRpcClient implements RpcClient { constructor(grpcEndpoint, solidityEndpoint?) }
class EvmRpcClient  implements RpcClient { constructor(rpcUrl) }
```

#### `Ledger`

**職責**:HID transport + 各鏈 app 封裝 + `LedgerSigner`。watch-only,簽名時 block 在硬體按鍵。前置條件經 `appConfig()` 檢查回 actionable error。**本模組不印任何提醒**(由呼叫者經 StreamManager 印);需精準時機可收 `onWait` callback。`Signer`/`LedgerSigner` 介面在 `SharedTypes`。
**依賴**:`AddressCodec`、`Derivation`(+ 外部 `@ledgerhq/*`)。

```ts
class Ledger {
  getAddress(family, path, opts?: { display?: boolean; onWait?: () => void }): Promise<string>  // display:false=靜默(import 反查 / precheck 用)
  signTransaction(family, path, tx, signal?): Promise<Signature>
  appConfig(family): Promise<AppConfig>
}
class LedgerSigner implements Signer {           // kind="device";address 建構時帶入
  precheck(): Promise<void>                        // ① appConfig 未 ready → auth_required
                                                   // ② getAddress(display:false) 比對 cache address,不符 → wrong_device_seed
  sign(tx, { signal }): Promise<SignedTx>          // 委派 Ledger;拒絕/abort → signing_rejected
}
class SoftwareSigner implements Signer {         // kind="software";constructor(privateKey, address);忽略 signal
}
```

---

### 第 0 層 · 零內部依賴函式庫與型別

> 只依賴 npm 外部套件,彼此不依賴,最先寫、最容易測。

#### `SharedTypes`(純型別 / 介面 — 全系統共用)

**所有跨層型別與介面的唯一家**,讓上層只依賴介面、可獨立 type-check。無執行碼。

```ts
// 識別與網路
type ChainFamily = "tron" | "evm"
type NetworkId = string                              // "evm:56" / "tron:nile"
type AccountRef = string                             // "wlt_x.0"(HD) / "wlt_k"(privateKey)
interface NetworkDescriptor { id: NetworkId; family: ChainFamily; chainId: string; aliases: string[]
  rpcUrl?: string; grpcEndpoint?: string; solidityGrpcEndpoint?: string
  feeModel?: "legacy"|"eip1559"|"tron-resource"; capabilities: string[]; rpc?: RpcClient }
interface CapabilityDescriptor { key: string; summary: string }
interface Config { defaultOutput: "text"|"json"; timeoutMs: number; networks: Record<NetworkId, NetworkDescriptor> }

// 錢包資料形狀
type ChainAddresses = { tron: string; evm: string }   // 一把秘密兩鏈皆派生 → 兩格恆有(非 optional)
type Source = { type:"seed";       vaultId:string; addresses: Record<string, ChainAddresses> }  // index(字串)→ 兩鏈;已知 index = Object.keys(addresses)
            | { type:"privateKey"; keyId:string;   addresses: ChainAddresses }                  // 無 index,兩鏈攤平
            | { type:"ledger";     family:ChainFamily; path:string; address:string }            // 單鏈單 path;address 同住、無 deviceId
interface Wallet { id: string; source: Source }   // 所有 address cache 收進 source,無頂層 addresses 欄位
// 讀地址一律經 helper:walletAddress(wallet, family, index?) — seed→addresses[index][family]、privateKey→addresses[family]、ledger→family 符回 address 否則 undefined
// 已知 index:accountIndices(source) = seed 取 Object.keys(addresses).map(Number).sort();privateKey/ledger 無 index
interface WalletsFile { version:number; activeAccount: AccountRef; wallets: Wallet[]; labels: Record<AccountRef,string> }
type KeystoreBlob = { id:string; type:"bip39-seed"|"raw-privkey"; version:number; crypto: CryptoParams }

// 簽名 / 交易 / RPC 介面(實作在上層)
type Bytes = Uint8Array; type KeyPair = { privateKey: Bytes; publicKey: Bytes }
interface Signer { kind:"software"|"device"; address:string; precheck?(): Promise<void>
  sign(tx: UnsignedTx, opts:{ signal?: AbortSignal }): Promise<SignedTx> }
interface RpcClient { call(method:string, params:unknown): Promise<unknown>; broadcast(s: SignedTx): Promise<BroadcastResult> }
type UnsignedTx = unknown; type SignedTx = unknown; type FeeReport = object; type TxOutcome = object

// 執行上下文 / 命令 / 鏈模組介面(實作在上層)
interface ExecutionContext { config: Config; networkRegistry: NetworkRegistry; streams: StreamManager
  secrets: SecretResolver; output:"text"|"json"; timeoutMs:number; noDeviceWait:boolean
  activeAccount: AccountRef; resolveAddress(family: ChainFamily): string }
interface CommandDefinition<I=any,O=any> { id:string; path:string[]; family?: ChainFamily
  network:"none"|"required"; wallet:"none"|"optional"|"required"; auth:"none"|"optional"|"required"
  capability?: string; fields: ZodObject; input: ZodType<I>; examples: Example[]
  run(ctx: ExecutionContext, net: NetworkDescriptor|undefined, input: I): Promise<O> }
interface ChainModule { family: ChainFamily; networks(): NetworkDescriptor[]
  capabilities(): CapabilityDescriptor[]; registerCommands(reg: CommandRegistry): void }

// 輸出契約
type ResultEnvelope = { schema:string; success:true; command:string; chain?: ChainView; data:unknown; meta: Meta }
type ErrorEnvelope  = { schema:string; success:false; command:string; chain?: ChainView
  error:{ code:string; message:string; details?:object }; meta: Meta }

// 中間進度事件(長流程:Ledger 等待 / 簽名 / 廣播);走 StreamManager.event,非終局;帶 type 與終局 envelope 區分
type ProgressEvent =
  | { type:"awaiting_device"; reason:"sign"|"verify_address"|"open_app"|"unlock" }
  | { type:"pre-verify-address"; address:string }
  | { type:"signed" } | { type:"broadcasting" } | { type:"dry-run" }
```

#### `Errors`(純)— classify ↔ render 雙層

把「**把任意底層 throw 收斂成 canonical 錯誤**」(classify)與「**canonical 錯誤 → message / exitCode / JSON code**」(render)徹底分開,讓 §7.8 的 error code 表成為**唯一事實**:同一個 `CliError` 同時決定 exit code、JSON `error.code`、human 訊息,三者永不漂移。

```ts
abstract class CliError { code:string; message:string; details?:object; abstract kind:"usage"|"execution"
  exitCode(){ return this.kind==="usage"?2:1 }                                            // render①:0/1/2
  toEnvelope(){ return { code:this.code, message:this.message, details:this.details } } } // render②:JSON code/訊息
class UsageError extends CliError { kind="usage" as const }       // exit 2 (含 network_family_mismatch)
class ExecutionError extends CliError { kind="execution" as const } // exit 1
class TransportError extends ExecutionError {}; class ChainError extends ExecutionError {}; class WalletError extends ExecutionError {}

// classify:純函式、零 I/O,把 tronweb / viem / Ledger / RPC 的雜散 throw 比對成 canonical CliError。
// 只靠 error 形狀(instanceof / 屬性 / SW code)比對,不 import 上層模組 → 維持 L0(外部 lib 依賴可,如 @ledgerhq/errors)。
type ClassifyContext = { command?: string; expected?: string; rejected?: "sign"|"verify_address"|"open_app" }
function normalizeError(raw: unknown): CliError                          // 通用入口(已存在)
function classifyError(raw: unknown, ctx?: ClassifyContext): CliError    // table-driven 擴充版(RPC/鏈錯誤)
function classifyDeviceError(raw: unknown, ctx?: ClassifyContext): CliError  // Ledger 專屬:鎖機/拒簽/開錯 app/逾時/未安裝
```

> 呼叫端(`TxPipeline`、`Ledger`、`RpcClient`)在 catch 時帶 `ctx`(如 `expected:"Tron app"`、`rejected:"sign"`)交給 `classify*`,得到帶正確 `code` 的 `CliError`;`Runner` 只負責 render(`formatter.error` + `exitCode()`)。新增 code 一律**先進 §7.8 表**,再讓 classify 對應、render 自動跟上。

#### `CryptoEnvelope`(純)
```ts
class CryptoEnvelope {
  static encrypt(plaintext: Bytes, password: string): KeystoreBlob   // scrypt → aes-128-ctr → keccak MAC
  static decrypt(blob: KeystoreBlob, password: string): Bytes        // MAC 不符 → auth_failed
}
```
外部:`@noble/hashes`、`@noble/ciphers`。

#### `Derivation`(純)
```ts
const COIN_TYPE = { tron: 195, evm: 60 }
class Derivation {
  static mnemonicToSeed(mnemonic: string, passphrase?: string): Bytes   // 選填 BIP39 passphrase
  static derive(seed: Bytes, path: string): KeyPair
  static path(family: ChainFamily, account: number): string            // m/44'/{coin}'/{account}'/0/0
}
```
外部:`@scure/bip39`、`@scure/bip32`。

#### `AddressCodec`(純)
```ts
interface AddressCodec { family: ChainFamily; fromPublicKey(pub: Bytes): string; validate(addr: string): boolean }
class TronAddress implements AddressCodec {}   // Base58Check
class EvmAddress  implements AddressCodec {}   // EIP-55
```

#### `AtomicFileStore`(零內部依賴,有副作用)
tmp 檔 + `rename()` 原子替換 + 選擇性 lockfile,避免平行 process 互蓋。
```ts
class AtomicFileStore { readJson<T>(p): T|null; writeJson(p, v): void; withLock<T>(p, fn): T }
```

#### `StreamManager`(零內部依賴,有副作用)— 兩段式事件

明確區分**中間事件**(長流程進度:等待裝置、已簽名、廣播中)與**終局 frame**(整個執行唯一一次的 result/error)。中間事件讓監看的 agent 能在最終結果前就 react(例:Ledger 等待簽名)。

```ts
class StreamManager {
  constructor(output:"text"|"json", quiet:boolean, verbose:boolean, stream:boolean)
  result(text: string): void                                   // 終局 → stdout,整個執行僅一次
  event(frame: string | null): void                            // ★新增:中間事件 frame(plain 逐行);null 跳過
  diagnostic(level:"info"|"debug"|"warn", msg: string): void   // → stderr,受 quiet/verbose gate
  readStdinOnce(): string                                      // 第二次拋錯
}
```

> **stream 政策(定案 A,集中於此)**:中間事件 **`event()` 一律 plain 逐行寫 stderr**(`stderr.write(line + "\n")`),**無 spinner / 無 TTY 偵測**——本專案是 Standard CLI / agent-first,動畫零價值且徒增分支;event 內容由 `formatter.event(e)` 決定(text 回人讀一行、json 回一行 NDJSON 帶 `type`)。
> - **stdout 永遠恰好一個終局 envelope**(`result()`),保住 §7.7 鎖定不變式;agent 要看即時進度就 streaming 讀 stderr,buffered 抓 stdout 一行 parse 即可。
> - **逃生門 `--stream`(僅 `--output json` 生效)**:才把中間 NDJSON 事件改寫 **stdout**(末行為終局 envelope),供想單一管線消費的 agent;此時 stdout 放寬為「多行 NDJSON,末行為終局」。`--output text` 下 `--stream` 為 no-op。
> 命令 / pipeline 只丟 `ProgressEvent` 給 `formatter.event()` → `streams.event()`,選 stream 的政策不外洩。

---

## 4. 關鍵設計決策

| # | 設計考量 | 決策 | 落點 |
| --- | --- | --- | --- |
| ① | argv 切分需要 flag arity 資訊 | yargs + B 文法(身分在 positional);arity 由 `ZodYargsAdapter` 從 zod 餵 | `CliShell`/`ZodYargsAdapter` |
| ② | 命令身分若取決於 `--network`,help/自省會無解 | B 文法把 family 放 positional 自然消解 | (文法決策) |
| ③ | `wallets.json`/`config.yaml` 需並發保護 | `AtomicFileStore`(原子替換+lock) | `AtomicFileStore` |
| ④ | 存在性、family↔network、能力差異須分屬不同關卡 | 三分:存在性→`CommandRegistry`;family↔network→`CliShell`;同 family 跨網路能力→`CapabilityGate` | 三者 |
| ⑤ | 支援 BIP39 passphrase | `Derivation`/`Keystore.import` 帶 `passphrase?` | `Derivation`/`Keystore` |
| ⑥ | 中立命令不應帶 `chain` 欄位 | `chain?` optional,中立命令省略 | `Contract`/`SharedTypes` |

> **取捨**:flag 位置採 **kubectl 式**(非完全位置無關)以換取套用 yargs。
> **固定約束**:aes-128-ctr + keccak MAC、clean break、0/1/2、綁鏈命令一律須 `--network`(無預設網路)、per-chain namespace。

---

## 5. 兩個擴展場景

**新增一條命令** → 只動該 chain module:寫 `CommandDefinition` + `registerCommands` 加一行(自動掛 yargs 群組、ZodYargsAdapter 自動納入新 flag)。CLI 殼、`Contract`、`OutputFormatter`、`StreamManager` 全不動。

**新增一條鏈**(已有 tron 加 evm) → 新增 `EvmModule` + bootstrap 註冊 + 小縫:`ChainFamily` 加 `"evm"`、`Derivation` 確認 coin type 60(secp256k1 共用,`derive()` 不改)、`Keystore` 衍生地址多算 evm、`AddressCodec` 多一實作。`CliShell` 的 `reg.families()` 迴圈自動多註冊 `evm` 群組;框架層不動。

---

## 6. 分層決策的理由

分層嚴格依 runtime 依賴拓樸;以下記錄每個落點的理由:

1. **`TxPipeline` 在 L3**(鏈模組之下)——它被鏈模組呼叫,不能在其上。
2. **`CliShell` 在 L4、`CommandRegistry`/`CapabilityGate` 在 L3**——避免 `CliShell → CommandRegistry` 的同層依賴;鏈模組與殼同在 L4 但靠依賴反轉互不 import。
3. **`SharedTypes` 是「全系統型別/介面之家」**——`ExecutionContext`/`Signer`/`RpcClient`/`CommandDefinition`/`ChainModule`/`Wallet` 等介面放 L0,實作留上層;確立「依賴 = runtime/value 依賴,type-only 不算」。
4. **`CliShell.dispatch` 設 `network_family_mismatch` 守門**——`tron … --network bsc` 被擋。
5. **`Runner` 攔 meta flag 短路 HelpService**——`.help(false)` 後 `--help` 由此路由。
6. **`ExecutionContext` 為 account-level**(`activeAccount` + `resolveAddress`)——對齊「簽名是 account 粒度」。
7. **`Signer.address` 對所有 kind 都帶入**(SignerResolver 從快取取)——build 階段才有地址可用。
8. **Ledger 註冊的等待提醒由中立命令印、Ledger 模組不印**——與簽名一致的 stream 紀律。
9. **能力以「每網路」為準**——`CapabilityRegistry` 由各 `NetworkDescriptor.capabilities` 灌入。
10. **`OutputFormatter` 為 human/json 雙實作 + factory**——避免單一類別內 `if (json)` 分支;formatter 只算字串,寫入留 `StreamManager`。
11. **`Errors` 拆 classify ↔ render 雙層**——§7.8 error code 表為唯一事實,exit / JSON code / 訊息不漂移;`classifyDeviceError` 收 Ledger 雜散 throw。
12. **`StreamManager` 採兩段式事件**——中間事件**一律 plain 逐行走 stderr(無 spinner/TTY)**,stdout 永遠一個終局 frame;`--stream`(僅 json)為次要逃生門,放行 stdout NDJSON。

---

## 7. 開發參考資料(具體規格)

> 此節為**實作要直接照抄/對照的具體規格**。架構面看 §1–§6,資料/格式面看這裡。

### 7.1 第一個里程碑(窄而完整)

在高風險簽名之前驗證架構:

- TS 腳手架,僅 Standard CLI;`--output text|json`、`--quiet`、`--verbose`、`--help`、`--version`。
- 穩定 JSON envelope、`0/1/2` 結束碼契約。
- 以 master password 解鎖的 seed/vault keystore;`wallet create/import/list/set-active`。
- `chains list`、`capabilities --network <id|alias>`。
- `tron account balance --network nile` 與 `evm account balance --network base` **來自同一共享錢包身分**。
- Golden 測試驗證 stdout/stderr 行為與 keystore 往返。

### 7.2 磁碟版面與 `WALLET_CLI_HOME`

根目錄預設 `~/.wallet-cli/`,可由 `WALLET_CLI_HOME` 覆寫為任意路徑(測試/CI 隔離、無 `$HOME` 沙箱、多 profile)。覆寫的是**整棵樹**(`wallets.json` 的 `source` 指向同樹下 `vaults/`/`keys/`,必須同住);只改位置不改加密。

```text
$WALLET_CLI_HOME/ 或 ~/.wallet-cli/   # 後者為預設;前者覆寫整棵樹
  config.yaml              # 明文使用者設定 — 無秘密
  wallets.json             # 明文註冊表 — 無秘密
  vaults/<vaultId>.json    # 加密的 BIP39 seed/entropy
  keys/<keyId>.json        # 加密的 raw private key
  # ledger 無獨立檔:watch-only 條目(family/path/address)全存 wallets.json 的 source(無秘密、無 deviceId)
```

> 根目錄解析是 bootstrap,**早於** config 分層(必須先知道根在哪才找得到 `config.yaml`)。對應模組:`ConfigLoader.resolveRoot`。

### 7.3 `wallets.json` — 結構、範例、規則

```json
{
  "version": 1,
  "activeAccount": "wlt_x.0",
  "wallets": [
    {
      "id": "wlt_x",
      "source": {
        "type": "seed", "vaultId": "vlt_9f3a",
        "addresses": {
          "0": { "tron": "T...", "evm": "0x..." },
          "1": { "tron": "T...", "evm": "0x..." }
        }
      }
    },
    {
      "id": "wlt_k",
      "source": { "type": "privateKey", "keyId": "key_7b2c", "addresses": { "tron": "T...", "evm": "0x..." } }
    },
    {
      "id": "wlt_lt",
      "source": { "type": "ledger", "family": "tron", "path": "m/44'/195'/0'/0/0", "address": "T..." }
    },
    {
      "id": "wlt_le",
      "source": { "type": "ledger", "family": "evm", "path": "m/44'/60'/0'/0/0", "address": "0x..." }
    }
  ],
  "labels": {
    "wlt_x":   "main-seed",
    "wlt_x.0": "main",
    "wlt_x.1": "savings",
    "wlt_k":   "hot",
    "wlt_lt":  "ledger-tron",
    "wlt_le":  "ledger-eth"
  }
}
```

規則:

- **定址單位是 account,不是錢包。** 一個錢包(`wlt_x`)= 一個秘密來源。seed 為 HD,**已知 index = `source.addresses` 的 keys**(不再另存 `accounts`);privateKey 非 HD,`source.addresses` 兩鏈攤平、無 index;ledger 單鏈單 path(見 §7.14.1)。
- **account ref** 貫穿全結構:`wlt_x.<index>`(seed HD)/ `wlt_k`(privateKey)/ `wlt_lt`(ledger)。同時是 `activeAccount`、`labels` 的 key、`--account` 選的。
- **seed/privateKey 路徑不存字串**,由模板 `m/44'/{coinType}'/{account}'/0/0` 算出(coin type tron=195/evm=60,purpose/change/address_index 寫死);已知 index 由 `source.addresses` keys 表示。**ledger 例外:path 字串直接存 `source.path`**(見 §7.14.1)。
- `source.addresses` 為衍生公開識別的明文 cache(seed 按 index 鍵 `Record<index, {tron,evm}>`、privateKey 兩鏈攤平 `{tron,evm}`、ledger 為單一 `address`),利秒列 `wallet list`;解鎖或查裝置後可重算。
- `activeAccount` 指 account ref 而非整個錢包(簽名單位是 account)。缺該鏈視圖 → `missing_wallet_address`。

**身分 / 顯示名(`id`、account ref、`labels`)**

| 欄位 | 角色 | 特性 |
| --- | --- | --- |
| `id`(`wlt_3f9k2p7q`) | 錢包層穩定鍵 | 系統生成、不可變、不可重用、opaque |
| account ref(`wlt_x.0`/`wlt_k`) | 定址單位 | `id` + index;privateKey 無 index |
| `labels[ref]`(`"main"`) | 人類顯示名 | 使用者取、**唯一**、可改名;住 root `labels` map |

- **`id` 生成**:`wlt_` + Crockford base32(CSPRNG,如 `randomBytes(5)`)。**不用時間當 seed**;唯一性靠「生成後比對註冊表、撞到重生」;**絕不由秘密衍生**(免在明文留指紋)。`vaultId`/`keyId` 同原則。
- **`labels` 唯一性橫跨整張 map**(wallet 層 + account 層同命名空間),`--account main` 才能反查唯一;trim + 大小寫不敏感比對撞名即拒絕;label 不得以 `wlt_` 開頭。刪 account/wallet 要**主動清** `labels[ref]` 孤兒。
- **為何 label 已唯一仍保留 id/ref**:唯一只在某時刻成立,不跨時間(刪 `main` 再建同名 `main` 是不同私鑰);用 ref 釘死才能「精確命中或報錯」,不靜默改指。
- **選取解析**:`--account <ref|label>` 為 tx/sign 主選擇器(`wlt_` 開頭當 ref;否則當 label,0=not-found、1=用它、**≥2 歧義硬報錯**,簽名路徑絕不替使用者猜);`--wallet <id|label>` 選整個錢包用其預設 account。
- **import 分工**:使用者給秘密(`--*-stdin`)+ 選填 `--label`;CLI 自動生 `id`、建 account 0、衍生 `addresses`、寫加密檔回填 `vaultId`/`keyId`、寫 root `labels`;`--label` 省略給預設(`wallet-N`);重複 import 比對 `addresses` 去重。
- **Ledger(單鏈單 path)**:每個 `(family, path, address)` 為**獨立條目**,ref 同 privateKey 用 `wlt_id`(無 index);address 存 `source`、**不填 `addresses` map**。tron/ethereum、不同 index 一律各自條目;去重以 `(family, path)` 為準。**ledger 失去跨鏈共享身分**(software 維持)。`add-account` 不適用 ledger(用 import 增 path)。選取時命令 family 須等於 `source.family`,否則 `missing_wallet_address`(訊息點明 family 不符)。匯入規則見 [§7.14.1](#7141-ledger-import-模型唯一進入點ledger-無-deriveadd-account)。

### 7.4 加密 envelope(`vaults/*.json`、`keys/*.json`)

每檔為獨立加密 blob,標準 Web3 風格(選用因密碼學品質,非為相容);每檔自帶 `salt`,單一 master password 對每檔衍生不同金鑰。

```json
{
  "id": "vlt_1",
  "type": "bip39-seed",          // keys/*.json 為 "raw-privkey"
  "version": 1,
  "crypto": {
    "cipher": "aes-128-ctr",
    "ciphertext": "…",
    "cipherparams": { "iv": "…" },
    "kdf": "scrypt",
    "kdfparams": { "n": 262144, "r": 8, "p": 1, "dklen": 32, "salt": "…" },
    "mac": "keccak256(dk[16:32] || ciphertext)"
  }
}
```

- Master password 由 `MASTER_PASSWORD` env 或 `--password-stdin` 解析;秘密永不記錄、不入任何 JSON envelope。
- 明文為 BIP39 entropy(vault)或 32-byte private key(key)。seed 衍生時可帶選填 BIP39 passphrase。

### 7.5 `config.yaml` — 範例與解析規則

明文,僅供非秘密的使用者級預設(輸出模式、RPC 端點、逾時、網路別名、自訂網路)。**不得含**任何秘密。

分層優先(後者覆蓋前者):**1. 內建預設 → 2. `config.yaml` → 3. 專案設定檔(若啟用)→ 4. 環境變數 → 5. 全域 CLI 選項 → 6. 命令區域選項。**

```yaml
defaultOutput: text
timeoutMs: 30000
networks:
  "tron:mainnet":
    family: tron
    chainId: mainnet
    aliases: [tron]
    grpcEndpoint: grpc.trongrid.io:50051

  "tron:nile":
    family: tron
    chainId: nile
    aliases: [nile]
    grpcEndpoint: grpc.xxx.example:50051
    solidityGrpcEndpoint: grpc-solidity.xxx.example:50051

  "tron:shasta":
    family: tron
    chainId: shasta
    aliases: [shasta]
    grpcEndpoint: grpc.shasta.trongrid.io:50051

  "evm:1":
    family: evm
    chainId: "1"
    aliases: [eth, ethereum]
    rpcUrl: https://ethereum-rpc.example
    feeModel: eip1559

  "evm:56":
    family: evm
    chainId: "56"
    aliases: [bsc, bnb]
    rpcUrl: https://bsc-dataseed.binance.org
    feeModel: legacy

  "evm:11155111":
    family: evm
    chainId: "11155111"
    aliases: [sepolia]
    rpcUrl: https://sepolia-rpc.example
    feeModel: eip1559
```

解析規則:

- `--network nile` → canonical `tron:nile`;config 定義的 `grpcEndpoint` 覆寫內建。`--network bsc` → `evm:56`;`--network evm:56` 跳過別名直接解析。
- 端點旗標(`--grpc-endpoint`/`--rpc-url`)對該次執行覆寫內建與 config。
- 自訂網路需用 canonical id 當 key,並含該 family 必要欄位(TRON 需 `grpcEndpoint`;EVM 需 `rpcUrl` + `chainId`)。
- 別名僅面向使用者;執行期/鏈模組/能力檢查/快取/輸出一律用 canonical id。別名須全域唯一,否則 `ambiguous_network_alias`。

### 7.6 網路別名與 `NetworkDescriptor`

```text
tron      -> tron:mainnet      eth       -> evm:1
nile      -> tron:nile         bsc       -> evm:56
shasta    -> tron:shasta       sepolia   -> evm:11155111
                               base      -> evm:8453
                               optimism  -> evm:10
```

(`NetworkDescriptor` 型別定義見 §3 第 0 層 `SharedTypes`。)

### 7.7 輸出契約(envelope 範例與規則)

JSON 模式向 `stdout` 恰好輸出一個物件。

成功:
```json
{
  "schema": "wallet-cli.result.v1",
  "success": true,
  "command": "tron.account.balance",
  "chain": { "family": "tron", "networkId": "tron:nile", "network": "nile", "chainId": "nile" },
  "data": {},
  "meta": { "durationMs": 123, "warnings": [] }
}
```
錯誤:
```json
{
  "schema": "wallet-cli.result.v1",
  "success": false,
  "command": "evm.tx.send-native",
  "chain": { "family": "evm", "networkId": "evm:8453", "network": "base", "chainId": "8453" },
  "error": { "code": "insufficient_funds", "message": "…", "details": {} },
  "meta": { "durationMs": 98, "warnings": [] }
}
```

規則:

- JSON 模式只把最終 envelope 寫 `stdout`;診斷只進 `stderr`。文字模式錯誤寫簡短訊息到 `stderr`。
- 一次執行恰好一個終端結果。空資料為 `{}` 非 `null`。
- **中間事件(長流程進度,如 Ledger 等待簽名)**:**plain 逐行走 `stderr`(無 spinner/TTY)**——json 模式為 NDJSON 行(帶 `type` 與終局 envelope 的 `success` 區分),text 模式為人讀一行;**stdout 仍恰好一個終局 envelope**(不破上條)。僅 `--stream`(json)時才把中間事件改寫 stdout(末行為終局 envelope)。見 `StreamManager` 兩段式事件。
- 金額在可能超出 JS 安全整數時為**字串**(wei/sun 恆為真)。binary 宣告編碼(`hex`/`base64`/鏈原生)。
- `chain.networkId` 為穩定 canonical 身分;`chain.network` 僅供可讀。中立命令(`wallet`/`config`/`chains`)省略 `chain` 欄位。
- 警告:JSON 下結構化於 `meta.warnings`,文字模式印 `stderr`。

### 7.8 結束碼與錯誤碼分類

| 碼 | 意義 |
| --- | --- |
| `0` | 成功 |
| `1` | 執行錯誤(RPC 失敗、簽名失敗、餘額不足、交易拒絕、驗證/秘密錯誤) |
| `2` | 用法錯誤(旗標格式錯誤、缺必填、命令形狀無效) |

詳細原因放 `error.code`:

```text
usage_error  unknown_command  invalid_option  missing_option  invalid_value
missing_network  unsupported_chain  unsupported_network  ambiguous_network_alias  network_family_mismatch
unsupported_capability  unsupported_network_capability
auth_required  auth_failed  secret_source_error  wrong_device_seed  ledger_address_not_found
rpc_error  rate_limited  timeout
insufficient_funds  transaction_rejected  signing_rejected
invalid_address  missing_wallet_address  invalid_amount  encoding_error
execution_error  internal_error
```

> `network_family_mismatch` 為本設計特有(B 文法下 `tron … --network bsc` 被擋),屬 usage(exit 2)。
> 此表是 `Errors` 的 **classify ↔ render 雙層唯一事實**:`classifyError`/`classifyDeviceError` 把底層 throw 對到這些 `code`,`CliError.toEnvelope()`/`exitCode()` 由 `code`/`kind` 推出 JSON code 與 0/1/2。新增原因先擴此表。

### 7.9 能力鍵清單(capability keys)

```text
account.balance.native    account.balance.token
tx.native.transfer        tx.token.transfer
tx.estimate  tx.sign  tx.broadcast  message.sign
contract.call  contract.deploy
resources.energy  resources.bandwidth      # 僅 TRON
staking.freeze  staking.delegate            # 僅 TRON
governance.vote  governance.proposal        # 僅 TRON
fee.eip1559                                   # 僅 EVM
```

### 7.10 Flag 分類(使用者面向)

> B 文法:`wallet-cli <family> <resource> <action> --network <net> [flags]`;flag 位置為 **kubectl 式**(global 兩邊都收)。
> 開發者分類見下;`--account`/`--wallet` 解析規則見 §7.3。

**Option taxonomy(誰擁有、能否記錄/持久化)**

| 類別 | 擁有層 | 值來源 | 可記日誌? | 可存設定? | 範例 |
| --- | --- | --- | --- | --- | --- |
| 全域執行期 | Runtime/CliShell | argv/env/config | 是(非秘密) | 是(網路預設除外) | `--output`、`--network`、`--account`、`--wallet`、`--timeout`、`--quiet`、`--verbose` |
| 命令選項 | 鏈/中立命令 | argv | 是(非秘密) | 否 | `--to`、`--amount-sun`、`--token`、`--contract`、`--method` |
| 端點覆寫 | ConfigLoader | argv/env/config | 是(消毒) | 是 | `--grpc-endpoint`、`--rpc-url` |
| 含秘密 | SecretResolver | stdin/env/加密檔 | 否 | 否 | `--password-stdin`、`--private-key-stdin`、`--mnemonic-stdin`、`--tx-stdin` |
| 元選項 | CLI | argv | 是 | 否 | `--help`、`-h`、`--version`、`--json-schema` |

**Global runtime flags**

| Flag | 說明 |
| --- | --- |
| `--output text\|json` | 輸出格式;`json` 走固定 envelope。 |
| `--network <id\|alias>` | 選網路(canonical 或 alias);綁鏈命令必帶,且 family 須與 positional 一致。 |
| `--account <ref\|label>` | tx/sign 主選擇器,精確到 account;未指定用 `activeAccount`。 |
| `--wallet <id\|label>` | 選整個錢包 → 用其預設 account。高風險建議用 `--account`。 |
| `--quiet` / `--verbose` | 抑制 / 增加 diagnostics(不影響 command data)。 |
| `--timeout <ms>` | 操作逾時(含 Ledger 等待確認)。 |
| `--no-device-wait` | Ledger 不等待,立即失敗(自動化用)。 |
| `--stream` | (次要 opt-in,**僅 `--output json` 生效**)把長流程中間事件改寫 stdout(NDJSON,末行為終局 envelope);預設中間事件 plain 逐行走 stderr、stdout 維持一個 frame;`--output text` 下為 no-op。 |
| `--help` / `-h` / `--version` | 元選項。 |

**Endpoint override**:`--grpc-endpoint <host:port>`(TRON)、`--rpc-url <url>`(EVM)— 單次執行覆寫,非業務輸入。

**Secret-bearing**:`--password-stdin`(解鎖 vault/key,可覆寫 `MASTER_PASSWORD`)、`--private-key-stdin`、`--mnemonic-stdin`(import 用)、`--tx-stdin`(明確交易輸入)— explicit opt-in,stdin 恰好讀一次。**不支援** argv raw 秘密值(`--private-key <v>` 等,會洩漏到 history/process list/log)。

**Command-input flag families**(由各命令 zod schema 定義):

| 家族 | 範例 | 備註 |
| --- | --- | --- |
| 目標地址 | `--address`、`--to`、`--receiver` | 依 resolved family address codec 驗。 |
| 金額 | `--amount`、`--amount-sun`、`--amount-wei` | 大數字串;單位依命令。 |
| 代幣/合約 | `--token`、`--contract`、`--method`、`--params` | 名稱共享、codec 不同。 |
| 費用/資源 | `--fee-limit`、`--gas-price`、`--max-fee`、`--max-priority-fee`、`--resource` | schema 管形狀;CapabilityGate 管 fee model 支援。 |
| 執行模式 | `--dry-run`、`--broadcast` | TxPipeline 控制回 plan / signed / broadcast。 |
| 錢包管理(software) | `--type`、`--label` | seed/privateKey;路徑由 index + 模板算出,故無 `--path-*`。 |
| Ledger import | `--app tron\|ethereum`、`--index`、`--path`、`--address`、`--scan-limit`(預設 20) | ledger 專屬;`--index`/`--path`/`--address` 三擇一互斥。見 §7.14.1。 |

### 7.11 命令清單(command inventory)

> B 文法下,綁鏈命令前綴 family:`tron account balance`、`evm tx send-native`;TRON-only 自然只在 `tron`。中立命令無 family、無 `--network`(`capabilities` 例外)。完整命令面待對照 Java CLI inventory + EVM 增補逐一列舉;以下為代表分組。

**中立(無 `--network`)**:`wallet create|import|list|set-active|export-address|rename|add-account`、`config get|set`、`chains list`、`capabilities --network <net>`。`add-account` 僅 seed;ledger 新增 path 走 `import`(`--index`/`--path`/`--address`,見 §7.14.1)。

**Account / Query(綁鏈)**:`account balance|info|resources`(chain-shaped:TRON 含 bandwidth/energy、EVM 含 nonce)、`get-block`、`tx status|receipt`、`token balance|info|allowance`。

**Transaction / Contract(綁鏈)**:`tx send-native`、`tx send-token`、`tx build|sign|broadcast`(pipeline:dry-run/離線簽)、`contract call|send|deploy|trigger`。

**TRON-only**:`freeze|unfreeze|delegate-resource|undelegate-resource`、`vote-witness|witness list|proposal create|approve|delete`、TRC10 `asset-issue|participate`、Bancor `exchange|market-order`、`gasfree`。

**EVM-only**:`tx send-native` 的 `--gas-price` / EIP-1559 fee 旗標、`message sign`(typed-data)、`contract deploy`(bytecode/ABI)。

### 7.12 多鏈差異(需保留)

| 關注點 | TRON | EVM 相容 |
| --- | --- | --- |
| 原生單位 | SUN/TRX | wei/ETH |
| 位址格式 | Base58Check `T...` | hex `0x...`(EIP-55) |
| 費用模型 | bandwidth/energy/TRX | gas、EIP-1559 |
| 代幣模型 | TRC-10 / TRC-20 | ERC-20 / ERC-721 |
| 交易形狀 | protobuf 衍生 | EIP-155 / EIP-1559 typed tx |
| 治理 | SR / 提案 | CLI 範圍內 n/a |
| 合約呼叫 | TVM、TRON 位址編碼 | EVM ABI |
| BIP44 coin type | 195 | 60 |

### 7.13 stdin / 串流規則

- 預設禁用 `stdin` 作業務輸入;僅 `--password-stdin`/`--private-key-stdin`/`--mnemonic-stdin`/`--tx-stdin` 為 opt-in。
- 任何消費 stdin 的旗標讀一次並 memoize(`SecretResolver` + `StreamManager.readStdinOnce`);命令 handler **不得**直接讀 `process.stdin`。
- 秘密不得記錄或入 envelope。JSON 模式中間進度**預設走 `stderr`**(NDJSON 事件);僅 `--stream` 時改寫 stdout(末行為終局 envelope)。見 §7.7 與 `StreamManager` 兩段式事件。
- 第三方 library(tronweb/viem)輸出不得污染 JSON stdout,經 StreamManager 抑制/轉向。

### 7.14 Ledger 整合研究(Node CLI)

| 需求 | 套件 | 備註 |
| --- | --- | --- |
| Transport | `@ledgerhq/hw-transport-node-hid` | Node HID 經 `node-hid`/`usb`。**WebHID 僅瀏覽器、需 click-context,CLI 不可用。** |
| Transport(CLI 重用) | `@ledgerhq/hw-transport-node-hid-singleton` | 單一重用連線,適合一次一裝置。 |
| TRON app | `@ledgerhq/hw-app-trx` | `getAddress`、`signTransaction`、`signTransactionHash`、`signPersonalMessage`、`signTIP712HashedMessage`、`getAppConfiguration`。 |
| EVM app | `@ledgerhq/hw-app-eth` | `getAddress`、`signTransaction`、`signPersonalMessage`、`signEIP712Message`。 |

- 保持 transport 與 app 模組版本對齊(版本漂移會導致 `undefined` 回應類 bug)。
- **不存 `deviceId`**:HID 無穩定序號,且「簽名前 derive + 比對 address」比 deviceId 更強(連 passphrase / 換 seed 都擋)。路由 = 連當下插著的裝置 + address 比對,不符 → `wrong_device_seed`;同時插多台不自動挑(連第一台、比對、錯就報錯)。
- 前置條件(解鎖、正確 app、blind-signing)經 `getAppConfiguration()` 檢查,回可操作錯誤而非不透明傳輸失敗。

### 7.14.1 Ledger import 模型(唯一進入點;ledger 無 derive/add-account)

- **`--app tron|ethereum`(必帶)**:決定派生模板 / codec。`ethereum → evm` family;EVM 一個地址通用所有 EVM 鏈(secp256k1 同 key、chainId 只在 tx)。裝置上請開對應 app。Ledger 無「EVM」app,evm 即 Ethereum app。
- **來源三擇一(強制互斥;帶 ≥2 個 → `invalid_option`, exit 2)**,全部解析成 path:
  - `--path m/44'/{coin}'/{i}'/0/0`:直接用;驗 coin_type 與 `--app` 一致,否則 `invalid_option`。
  - `--index N`:套 app 預設模板換 index(`m/44'/{coin}'/{N}'/0/0`)。
  - `--address <addr>`:**有界裝置反查**(見下)。
- **`--address` 反查(非 gap-limit)**:已知目標地址,做**有界線性搜尋**——先查 index 0(快路)→ 沒中掃 `0..--scan-limit`(**預設 20**)→ 找不到 → `ledger_address_not_found`。每個 index 一次 silent `getAddress`,需正確 app + 正確 seed/passphrase 啟用否則掃不到;**不用 gap-limit**(目標已知,gap-limit 只會更早停、更糟)。**error 訊息必含**:「前 N 個帳戶找不到此地址;可調 `--scan-limit <n>` 擴大範圍,或改用 `--index` / `--path` 直接指定」。
- **落地**:`registerLedger({ family, path, address, label? })` → 單鏈單 path 條目(address 存 `source`,不填 `addresses` map);dedup by `(family, path)`。
- **簽名前防呆(所有碰裝置的命令)**:`LedgerSigner.precheck` 先 `getAddress(family, path, display:false)` 比對 cache address,不符 → `wrong_device_seed`(裝置目前 seed/passphrase 與此帳戶不符)。讀類命令(餘額)用 cache、不碰裝置,無需比對。

### 7.15 建議函式庫 / 測試策略 / 功能里程碑

**函式庫**

| 需求 | 候選 |
| --- | --- |
| CLI 殼 | `yargs`(見 §3 `CliShell`) |
| Schema 驗證 / 型別 / help / agent schema | `zod` + `zod-to-json-schema` |
| EVM RPC/簽名 | `viem` |
| TRON | `tronweb` + 必要處自訂 codec/簽名 |
| Keystore 密碼學 | `@noble/hashes`(scrypt/keccak)、`@noble/ciphers`(aes-ctr) |
| BIP39/BIP32 | `@scure/bip39`、`@scure/bip32` |
| Ledger | `@ledgerhq/hw-transport-node-hid` + 鏈 app(見 §7.14) |
| 設定解析 | `yaml` |
| 測試 | `vitest` |
| Golden CLI 測試 | spawn 程序 + JSON snapshot fixture |
| 打包 | 開發 `tsx`,建置 `tsup`/`esbuild` |

**測試策略**

1. 解析/路由:flag 兩邊都收(kubectl)、meta 選項、缺 `--network`、別名→canonical、歧義別名、`network_family_mismatch`。
2. Schema:命令輸入驗證、條件式 zod 規則、穩定輸出 envelope。
3. Keystore:加解密往返、單一 vault 多鏈衍生、註冊表完整性(含並發/原子寫)、master password 失敗路徑。
4. Golden CLI:spawn 編譯後 CLI,比對成功/錯誤 JSON envelope。
5. 雜訊依賴:tronweb/viem 日誌不污染 stdout。
6. 精度:大整數金額保持字串。
7. 鏈整合:opt-in、網路標記、與單元測試隔離。

**功能里程碑順序**(模組由下而上完成後,功能依此推進;與 §5 擴展場景互補):

1. 定義 §3 第 0–1 層契約:`SharedTypes`(envelope/error/CommandDefinition/NetworkDescriptor/Wallet)、`Contract`、`Errors`。
2. 核心 CLI 殼:`CliShell`(yargs)+ `ZodYargsAdapter` + `CommandRegistry` + meta/exit + `HelpService`。
3. 執行期基礎:`ConfigLoader/NetworkRegistry`、`StreamManager`、`SecretResolver`、`AtomicFileStore`、timeout。
4. 錢包儲存:`Keystore`(加密 vault/key)、`wallet create/import/list/set-active/export-address`。
5. 內省:`chains list`、`capabilities --network`、JSON-schema 匯出、help。
6. 共享垂直切片:`tron account balance --network nile` 與 `evm account balance --network base`,golden 測試。
7. `TxPipeline` + 兩鏈 native transfer(`tron/evm tx send-native`)。
8. token transfer、contract call/send(codec/fee/tx 形狀留各鏈模組)。
9. 擴 TRON-only:resources/staking、governance、TRC10、exchange、GasFree。
10. 擴 EVM:fee model、message/typed-data sign、deploy、BSC legacy gas 等。
11. `Ledger`(軟體簽名管線穩定後再加,作為 signer source 而非獨立命令模式)。

### 7.16 互動式輸入(opt-in,**如需要**才做)

> **狀態:可選、預設不做。** 本專案鎖定 Standard CLI / agent-first / 非互動;此節描述「**若日後想讓真人在終端機少打幾個 flag**」時,如何在**不破壞 agent 契約**下加一層互動 prompt。不影響任何既有命令與測試,未做也完全可運作。

**目標**:某些命令在缺 required option 時,於真終端機**逐欄 prompt 使用者輸入**,每輸入一個值就**只對那個 option 做一次契約驗證**(立即回饋),收齊後再走原本的整包驗證。

**架構為何天然支援**:`CommandDefinition` 已把契約拆成 `fields`(逐欄 zod)與 `input`(整包 + 跨欄 `superRefine`)。`fields.shape[key]` 就是單一 option 的契約,直接拿來逐欄驗。

**逐欄 verify 的邊界(重要)**:跨欄規則(如 `--amount` 與 `--amount-sun` 二擇一、`--dry-run` 時 `--broadcast` 無意義)住在 `input` 的 `superRefine`,**逐欄驗不到**。故流程必為:

```text
逐欄 prompt + fields.shape[key] 驗(即時回饋,缺的 required 才問)
  → 收齊全部值
  → 仍跑一次 cmd.input.parse(argv)（整包 + 跨欄,維持現狀不變）
  → run()
```

逐欄是「即時回饋層」,**不取代**最後那道整包驗證(`input === fields` 的命令,最後一道等同 no-op)。

**硬性 gating(維持 deterministic agent 契約)**:

| 條件 | 行為 |
| --- | --- |
| `output === "text"` 且 `stderr.isTTY` 且 `stdin.isTTY` | 才開 prompt |
| `--output json` / 非 TTY(pipe、CI、agent) | **一律不 prompt**,維持現狀:缺 required → `missing_option`(exit 2) |
| prompt 文字去向 | **stderr 或 `/dev/tty`,絕不 stdout**(stdout 仍只留單一終局 frame,§7.7 不破) |
| stdin 衝突 | 互動讀走 **`/dev/tty`**,不碰 fd0;若 stdin 被 pipe(`SecretResolver.readStdinOnce` 的秘密/資料通道)則**不 prompt** |

只要守住上表,**agent/非 TTY/JSON 行為與現在 100% 相同**;互動只在真人坐在終端機跑 text 模式時浮現。

**落點(如需要時)**:新增 L4 元件 `InteractivePrompter`,插在 `CliShell.dispatch` 的 `resolveConcrete` 之後、`parseInput` 之前:

```ts
const cmd = registry.resolveConcrete(ns, path)
// ...
if (interactiveAllowed(globals, streams))            // gating:text + 雙向 TTY
  argv = await prompter.fillMissing(cmd, argv)       // 逐欄 prompt + fields.shape[key] 驗,只補缺的 required
const input = parseInput(cmd, argv)                  // 整包 + 跨欄,完全不變
```

`parseInput` / `OutputFormatter` / `StreamManager` / 契約全不動;prompt 只是在進入既有驗證前把缺的洞補起來。`InteractivePrompter` 依賴:`Contract`(讀 `fields` introspection,沿用 `ZodYargsAdapter` 既有的逐欄走訪)、`StreamManager`(寫 prompt、判 TTY)。
