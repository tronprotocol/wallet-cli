# TypeScript Wallet CLI — Object-Oriented Analysis

> A TRON + EVM standard CLI wallet. This document maps the runtime object model: the
> interfaces (contracts), the concrete classes that implement them, and how they
> collaborate from `argv` to a signed/broadcast transaction.

---

## 1. Layered Architecture (bird's-eye)

```mermaid
flowchart TB
    subgraph L0["L0 · Primitives (pure, no deps)"]
        TYPES["types/*<br/>all interfaces & unions"]
        ADDR["AddressCodec<br/>Evm/Tron"]
        CRYPTO["CryptoEnvelope<br/>scrypt+AES+MAC"]
        DERIV["Derivation<br/>BIP39/BIP44"]
        ERR["CliError hierarchy"]
        FS["AtomicFileStore"]
        STREAM["StreamManager"]
    end

    subgraph L1["L1 · IO Wrappers"]
        RPC["RpcClient<br/>Evm/Tron"]
        CONTRACT["Schemas / OutputEnvelope"]
        CONFIG["ConfigLoader / NetworkRegistry"]
    end

    subgraph L2["L2 · Domain Services"]
        KEYSTORE["Keystore"]
        SECRET["SecretResolver"]
        SIGNER["Signer + SignerResolver"]
        LEDGER["Ledger"]
        CHAIN["CapabilityRegistry"]
        OUTPUT["OutputFormatter"]
        CTX["ExecutionContext"]
    end

    subgraph L3["L3 · Orchestration"]
        REGISTRY["CommandRegistry"]
        PIPELINE["TxPipeline"]
        CAPGATE["CapabilityGate"]
        ADAPTER["ZodYargsAdapter"]
    end

    subgraph L4["L4 · Commands & Shell"]
        MODULES["ChainModule<br/>Tron / Evm + Neutral"]
        CLI["CliShell (buildCli)"]
        HELP["HelpService"]
    end

    subgraph L5["L5 · Entry"]
        MAIN["runner.main()"]
        ENTRY["index.ts"]
    end

    ENTRY --> MAIN
    MAIN --> CLI
    MAIN --> REGISTRY
    MAIN --> MODULES
    CLI --> CTX
    CLI --> PIPELINE
    MODULES --> PIPELINE
    PIPELINE --> SIGNER
    SIGNER --> KEYSTORE
    SIGNER --> LEDGER
    KEYSTORE --> CRYPTO
    KEYSTORE --> DERIV
    KEYSTORE --> FS
    PIPELINE --> RPC
    CTX --> KEYSTORE
    L2 --> L1
    L1 --> L0
```

**Dependency rule:** arrows point downward only. L0 knows nothing about anything above
it. Everything above depends on the `types/*` contracts, not on concrete classes —
which is what makes the whole tree injectable and testable.

---

## 2. Core Class Diagram — Contracts & Implementations

```mermaid
classDiagram
    direction LR

    class Signer {
        <<interface>>
        +kind: "software"|"device"
        +address: string
        +precheck()? Promise
        +sign(tx, opts) Promise~SignedTx~
        +signMessage(msg, opts) Promise~string~
    }
    class SoftwareSigner {
        -#pkHex
        -#tron?
        +family: ChainFamily
        +sign() viem | TronWeb offline
        +signMessage()
    }
    class LedgerSigner {
        -#ledger
        -#path
        +precheck()
        +sign() delegates to device
    }
    Signer <|.. SoftwareSigner
    Signer <|.. LedgerSigner

    class SignerResolver {
        -keystore: Keystore
        -ledger: Ledger
        +resolve(ref, family) Signer
    }
    SignerResolver ..> Signer : creates
    SignerResolver --> Keystore
    SignerResolver --> Ledger

    class RpcClient {
        <<interface>>
        +call(method, params)
        +broadcast(signed) BroadcastResult
        +getNativeBalance(addr) string
    }
    class EvmRpcClient {
        -#client: viem.PublicClient
        +prepareNativeTransfer()
    }
    class TronRpcClient {
        -#tw: TronWeb
        +buildNativeTransfer()
    }
    RpcClient <|.. EvmRpcClient
    RpcClient <|.. TronRpcClient

    class AddressCodec {
        <<interface>>
        +family
        +fromPublicKey(pub) string
        +validate(addr) bool
    }
    AddressCodec <|.. EvmAddress
    AddressCodec <|.. TronAddress

    class ChainModule {
        <<interface>>
        +family
        +networks() NetworkDescriptor[]
        +capabilities() CapabilityDescriptor[]
        +registerCommands(reg)
    }
    ChainModule <|.. TronModule
    ChainModule <|.. EvmModule

    class OutputFormatter {
        <<interface>>
        +success(cmd, net, data) string
        +error(err, ctx)
        +event(e) string|null
    }
    OutputFormatter <|.. JsonOutputFormatter
    OutputFormatter <|.. HumanOutputFormatter

    class CliError {
        <<abstract>>
        +kind: usage|execution
        +code: string
        +exitCode() ExitCode
        +toEnvelope()
    }
    CliError <|-- UsageError
    CliError <|-- ExecutionError
    ExecutionError <|-- TransportError
    ExecutionError <|-- ChainError
    ExecutionError <|-- WalletError
```

---

## 3. Orchestration Object Graph (composition root)

`runner.main()` is the **composition root**: it news-up every concrete class once and
wires them by constructor injection. Nothing else calls `new` on a service.

```mermaid
flowchart LR
    MAIN["main(argv)"]

    MAIN --> STORE["AtomicFileStore"]
    MAIN --> CAPREG["CapabilityRegistry"]
    MAIN --> NETREG["NetworkRegistry<br/>(rpcFactory)"]
    MAIN --> SECRETS["SecretResolver"]
    MAIN --> KS["Keystore"]
    MAIN --> LED["Ledger"]
    MAIN --> SR["SignerResolver"]
    MAIN --> PIPE["TxPipeline"]

    KS --> STORE
    KS -.password cb.-> SECRETS
    SR --> KS
    SR --> LED
    PIPE --> SR

    MAIN --> SVCS{{"Services bundle<br/>keystore·ledger·signerResolver<br/>·txPipeline·capabilityRegistry"}}
    KS --> SVCS
    LED --> SVCS
    SR --> SVCS
    PIPE --> SVCS
    CAPREG --> SVCS

    MAIN --> REG["CommandRegistry"]
    SVCS --> NEU["registerNeutralCommands()"]
    SVCS --> TM["TronModule"]
    SVCS --> EM["EvmModule"]
    NEU --> REG
    TM --> REG
    EM --> REG

    MAIN --> SHELL["buildCli(ShellOptions)"]
    REG --> SHELL
    NETREG --> SHELL
    CAPREG --> CAPGATE["CapabilityGate"]
    CAPGATE --> SHELL
```

**Services** is the DI container — an interface bundle (not a class) that each command
module closes over. This is how a `tron.tx.send-native` handler reaches the
`TxPipeline` and `SignerResolver` without global state.

---

## 4. Request → Execution Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Main as runner.main
    participant Help as HelpService
    participant Shell as CliShell (yargs)
    participant Reg as CommandRegistry
    participant Net as NetworkRegistry
    participant Gate as CapabilityGate
    participant Cmd as CommandDefinition.run
    participant Pipe as TxPipeline
    participant SR as SignerResolver
    participant Signer
    participant Rpc as RpcClient
    participant Fmt as OutputFormatter
    participant Stream as StreamManager

    User->>Main: argv
    Main->>Main: parseGlobals(tokens)
    alt --help / --version / --json-schema
        Main->>Help: handleMeta(tokens)
        Help->>Stream: result(text)
    else normal command
        Main->>Shell: buildCli().parseAsync()
        Shell->>Reg: resolveConcrete(ns, path)
        Reg-->>Shell: CommandDefinition
        Shell->>Net: resolve(network)
        Net-->>Shell: NetworkDescriptor (+rpc attached)
        Shell->>Shell: family match? parseInput(Zod)
        Shell->>Gate: check(cmd, net)
        Shell->>Shell: enforce auth / wallet contract
        Shell->>Cmd: run(ctx, net, input)
        Cmd->>Pipe: run({build, estimate, dryRun, broadcast})
        Pipe->>SR: resolve(account, family)
        SR->>Signer: new Software/LedgerSigner
        Pipe->>Pipe: build() → estimate()
        opt device
            Pipe->>Signer: precheck()
            Pipe->>Stream: event(awaiting_device)
        end
        Pipe->>Signer: sign(tx) [withTimeout]
        opt broadcast
            Pipe->>Rpc: broadcast(signed)
        end
        Pipe-->>Cmd: TxOutcome
        Cmd-->>Shell: data
        Shell->>Fmt: success(cmd, net, data)
        Fmt->>Stream: result(frame)
    end
    Main->>Main: catch → normalizeError → exitCode
```

---

## 5. The Signing Strategy (heart of the design)

```mermaid
flowchart TB
    RESOLVE["SignerResolver.resolve(ref, family)"]
    RESOLVE --> SRC{wallet.source.type}

    SRC -->|privateKey| PK["keystore.decryptKey(keyId)"]
    PK --> SS1["new SoftwareSigner"]

    SRC -->|seed| SEED["keystore.decryptSeed(vaultId)"]
    SEED --> DRV["Derivation.derive(seed, path(family, index))"]
    DRV --> SS2["new SoftwareSigner"]

    SRC -->|ledger| LS["new LedgerSigner(ledger, family, path, address)"]

    SS1 --> SIGN["Signer.sign()"]
    SS2 --> SIGN
    LS --> PRE["precheck() → device derives & verifies addr"]
    PRE --> SIGN

    SIGN --> FAM{family}
    FAM -->|evm| VIEM["viem privateKeyToAccount / device APDU"]
    FAM -->|tron| TW["TronWeb offline sign / device APDU"]
```

**Why it's clean:** `Signer` is a 4-member interface. The *source* of the key
(raw private key, HD seed, hardware device) and the *family* (TRON vs EVM signing
algorithm) are both absorbed behind it. The `TxPipeline` never branches on either —
it just calls `sign()`.

---

## 6. Design Patterns In Use

| Pattern | Where | Payoff |
|---|---|---|
| **Strategy** | `Signer`, `RpcClient`, `AddressCodec`, `OutputFormatter` | family/source/format variation behind one interface; callers stay branch-free |
| **Plugin / Module** | `ChainModule` (`TronModule`, `EvmModule`) | add a chain by adding a module + registering commands — no edits to the shell |
| **Factory** | `SignerResolver`, `balanceCommand()`, `messageSignCommand()`, `createOutputFormatter()` | concrete instances built from a discriminator (source type / family / output mode) |
| **Registry** | `CommandRegistry`, `NetworkRegistry`, `CapabilityRegistry`, `ADDRESS_CODECS` | keyed lookup; decouples producers from consumers |
| **Dependency Injection** | `Services`, `RuntimeDeps`, `ShellOptions` | one composition root (`main`); everything else takes deps via constructor |
| **Pipeline** | `TxPipeline.run()` | build → estimate → sign → broadcast, each `withTimeout`, dry-run/broadcast gates |
| **Adapter** | `ZodYargsAdapter` | Zod is the single source of truth; yargs only gets arity hints |
| **Envelope** | `OutputEnvelope`, `ResultEnvelope`/`ErrorEnvelope` | uniform `{success, command, data/error, meta}` JSON |
| **Template Method** | `BaseOutputFormatter` → Json/Human | shared `meta()`; subclasses fill `success/error/event` |
| **State guard** | `StreamManager` (`#resultWritten`, `#stdinRead`) | exactly one stdout result, one stdin read |
| **Discriminated union** | `Source`, `TxOutcome`, `ProgressEvent` | exhaustive, type-checked branching |

---

## 7. Key Architectural Observations

1. **`types/index.ts` is the keystone** — a pure contract layer (~28 interfaces, all
   the unions). Every concrete class implements an interface from here; nothing in L0
   imports upward. This is textbook Dependency Inversion.

2. **One composition root.** `runner.main()` is the *only* place `new` is called on a
   service. Swap any implementation (e.g. a mock `Ledger` in tests) by changing one
   line there.

3. **Family-symmetry by interface, not inheritance.** TRON and EVM never share a base
   class; they each implement `Signer` / `RpcClient` / `AddressCodec` / `ChainModule`.
   Shared *intent* (e.g. balance, message-sign) is factored into command **factories**
   (`shared.ts`), not into a class hierarchy.

4. **The `Services` bundle is the seam** between infrastructure and commands. Command
   modules are closures over `Services`; they can't reach anything not in the bundle.

5. **Capability gating is per-network, not per-family.** `CapabilityRegistry` tracks
   what each *network* supports (EIP-1559 on Base, legacy on BSC), and `CapabilityGate`
   enforces it after the registry has already confirmed the command exists.

6. **I/O discipline is centralized in `StreamManager`.** Formatters only produce
   strings; the stream manager owns stdout (exactly one result frame), stderr
   (diagnostics/events), and the single stdin read — which is what makes `--output json`
   reliably machine-parseable.

7. **Errors are a closed taxonomy.** Everything thrown anywhere (Zod, yargs, viem,
   tronweb, AbortController) is funneled through `classifyError()` into `UsageError`
   (exit 2) or `ExecutionError` (exit 1), with internal errors *redacted* to avoid
   leaking secrets.
```
