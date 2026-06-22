# Wallet CLI(TS 版)一期命令 Help 原文快照

> 本文件由目前 TS CLI 實際 `--help` 輸出生成。每個區塊都直接貼上 `wallet-cli ... --help` 的 stdout，作為 phase 1 command/flag reference。
>
> 生成時間：2026-06-22 Asia/Taipei。
> CLI version：0.1.0。Concrete commands：51。

## 0. Root / Namespace Help

### `wallet-cli --help`

```text
wallet-cli — multi-chain CLI wallet for TRON, Ethereum, BSC, Base, Arbitrum, Optimism & more
Agent-first, human-friendly: deterministic exit codes, JSON output, no interactive prompts.

Usage:
  wallet-cli <namespace> <command> [flags]

Chain commands  (wallet-cli <family> <resource> <action> --network <net>):
  tron     account · token · tx · resource · block · contract · message
  evm      account · tx · message

Wallet & utilities:
  wallet   create · import-mnemonic · import-private-key · import-ledger · import-watch · list
           set-active · active · export-address · rename · add-account · delete · backup
  config   get · set
  chains   list

Run `wallet-cli <namespace> --help` to drill into a group (e.g. `wallet-cli tron --help`),
`wallet-cli <command> --help` for one command, or `wallet-cli --json-schema` for the full machine catalog.
```

### `wallet-cli chains --help`

```text
wallet-cli chains — commands

Usage:
  wallet-cli chains <command> [flags]

Commands:
  chains list   list known networks

Run `wallet-cli chains <command> --help` for command details.
```

### `wallet-cli config --help`

```text
wallet-cli config — commands

Usage:
  wallet-cli config <command> [flags]

Commands:
  config get   show effective config (or one --key)
  config set   set a top-level config value

Run `wallet-cli config <command> --help` for command details.
```

### `wallet-cli evm --help`

```text
wallet-cli evm — commands

Usage:
  wallet-cli evm <resource> <action> [flags]

Commands:
  account   balance
  tx        send-native · send-token · status · info
  message   sign

Run `wallet-cli evm <resource> <action> --help` for command details.
```

### `wallet-cli tron --help`

```text
wallet-cli tron — commands

Usage:
  wallet-cli tron <resource> <action> [flags]

Commands:
  account    balance · resources · assets · info · history · add-token · list-tokens
             remove-token · portfolio
  token      balance · info
  tx         send-native · send-token · broadcast · status · info
  resource   freeze · unfreeze · withdraw · cancel-unfreeze · delegate · undelegate · prices
  block      get
  contract   call · send · deploy · info
  message    sign

Run `wallet-cli tron <resource> <action> --help` for command details.
```

### `wallet-cli wallet --help`

```text
wallet-cli wallet — commands

Usage:
  wallet-cli wallet <command> [flags]

Commands:
  wallet create               create a new HD wallet (BIP39 seed)
  wallet import-mnemonic      import an existing BIP39 mnemonic (encrypted at rest)
  wallet import-private-key   import an existing private key (encrypted at rest)
  wallet import-ledger        register a Ledger account (watch-only; signs on the device)
  wallet import-watch         register a watch-only address (no secret)
  wallet list                 list wallets/accounts (no unlock needed)
  wallet set-active           set the active account
  wallet active               show the current active account
  wallet export-address       show an account's receive addresses
  wallet rename               rename an account label
  wallet add-account          derive an HD account in a seed wallet (next free, or --index)
  wallet delete               delete a wallet/account and clean orphan labels
  wallet backup               export an account's secret + metadata to a 0600 file

Run `wallet-cli wallet <command> --help` for command details.
```

## 1. Command Help

### `wallet-cli chains list --help`

```text
chains.list — list known networks

Usage:
  wallet-cli chains list [flags]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli chains list
```

### `wallet-cli config get --help`

```text
config.get — show effective config (or one --key)

Usage:
  wallet-cli config get [flags]

Flags:
  --key <defaultOutput|timeoutMs|networks>  config key to read; omit to show the whole effective config  [optional]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli config get --key defaultOutput
```

### `wallet-cli config set --help`

```text
config.set — set a top-level config value

Usage:
  wallet-cli config set [flags]

Flags:
  --key <defaultOutput|timeoutMs>  config key to set  [required]
  --value <string>                 new value; for defaultOutput use text|json; for timeoutMs use a non-negative number in milliseconds  [required]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli config set --key defaultOutput --value json
```

### `wallet-cli evm account balance --help`

```text
evm.account.balance — get native wei balance

Usage:
  wallet-cli evm account balance [flags]

Requires:
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli evm account balance
```

### `wallet-cli evm message sign --help`

```text
evm.message.sign — sign an arbitrary message (TIP-191/V2 · EIP-191)

Usage:
  wallet-cli evm message sign [flags]

Requires:
  master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Flags:
  --message <string>  message text to sign; provide this OR --message-stdin; exactly one is required  [optional]

Input flags:
  --message-stdin            read the message bytes/text from stdin (fd 0)  [optional]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli evm message sign --message "hello"
```

### `wallet-cli evm tx info --help`

```text
evm.tx.info — full transaction detail + receipt

Usage:
  wallet-cli evm tx info [flags]

Flags:
  --txid <string>  EVM transaction hash, 0x-prefixed  [required]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli evm tx info --network base --txid 0x...
```

### `wallet-cli evm tx send-native --help`

```text
evm.tx.send-native — transfer native wei

Usage:
  wallet-cli evm tx send-native [flags]

Requires:
  --network <id|alias>
  master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Flags:
  --to <string>          recipient EVM address  [required]
  --amount-wei <string>  native amount as a non-negative integer string, in wei (1 ETH/BNB/etc = 1e18 wei on standard EVM chains)  [required]
  --dry-run              build and estimate only, with no signature and no broadcast; mutually exclusive with --sign-only  [optional, default: false]
  --sign-only            sign and output the transaction without broadcasting; mutually exclusive with --dry-run; broadcast later with tx broadcast  [optional, default: false]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli evm tx send-native --network base --to 0x... --amount-wei 1000000 --dry-run
```

### `wallet-cli evm tx send-token --help`

```text
evm.tx.send-token — transfer an ERC-20 token

Usage:
  wallet-cli evm tx send-token [flags]

Requires:
  --network <id|alias>
  master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Flags:
  --to <string>                recipient EVM address  [required]
  --amount-wei <string>        ERC-20 amount as a raw non-negative integer string in the token's smallest unit; flag name is amount-wei for CLI compatibility  [required]
  --contract <string>          ERC-20 contract address  [required]
  --max-fee <string>           EIP-1559 maxFeePerGas override, in wei; omit to auto-estimate  [optional]
  --max-priority-fee <string>  EIP-1559 maxPriorityFeePerGas tip override, in wei; omit to auto-estimate  [optional]
  --gas-price <string>         legacy gas price override, in wei; use on non-EIP-1559 chains instead of --max-fee/--max-priority-fee  [optional]
  --dry-run                    build and estimate only, with no signature and no broadcast; mutually exclusive with --sign-only  [optional, default: false]
  --sign-only                  sign and output the transaction without broadcasting; mutually exclusive with --dry-run; broadcast later with tx broadcast  [optional, default: false]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli evm tx send-token --network base --contract 0x... --to 0x... --amount-wei 1000000
```

### `wallet-cli evm tx status --help`

```text
evm.tx.status — confirmation status of a transaction

Usage:
  wallet-cli evm tx status [flags]

Flags:
  --txid <string>  EVM transaction hash, 0x-prefixed  [required]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli evm tx status --network base --txid 0x...
```

### `wallet-cli tron account add-token --help`

```text
tron.account.add-token — add a custom token to the address book (fetches symbol/decimals)

Usage:
  wallet-cli tron account add-token [flags]

Requires:
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Flags:
  --contract <string>  TRC20 contract address; provide exactly one of --contract or --asset-id  [optional]
  --asset-id <string>  TRC10 numeric asset id; provide exactly one of --asset-id or --contract  [optional]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron account add-token --network nile --contract TR7...
```

### `wallet-cli tron account assets --help`

```text
tron.account.assets — per-token balances (no indexer needed)

Usage:
  wallet-cli tron account assets [flags]

Requires:
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Flags:
  --tokens <string>  comma-separated token ids to query; each item is a TRC20 contract address or TRC10 numeric asset id; omit to return an empty token list  [optional]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron account assets --network nile --tokens TR7...,1002000
```

### `wallet-cli tron account balance --help`

```text
tron.account.balance — get native sun balance

Usage:
  wallet-cli tron account balance [flags]

Requires:
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron account balance
```

### `wallet-cli tron account history --help`

```text
tron.account.history — transaction history (requires TronGrid)

Usage:
  wallet-cli tron account history [flags]

Requires:
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Flags:
  --limit <number>       maximum records to return, in records; range: 1-200  [optional, default: 20]
  --only <native|token>  filter history by transfer type; omit to show all transfer types  [optional]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron account history --network nile --limit 10
```

### `wallet-cli tron account info --help`

```text
tron.account.info — raw account (getAccount passthrough)

Usage:
  wallet-cli tron account info [flags]

Requires:
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron account info --network nile
```

### `wallet-cli tron account list-tokens --help`

```text
tron.account.list-tokens — list the token address-book (official + user; no balances)

Usage:
  wallet-cli tron account list-tokens [flags]

Requires:
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron account list-tokens --network nile
```

### `wallet-cli tron account portfolio --help`

```text
tron.account.portfolio — native TRX + address-book token balances with best-effort USD valuation

Usage:
  wallet-cli tron account portfolio [flags]

Requires:
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron account portfolio --network nile
```

### `wallet-cli tron account remove-token --help`

```text
tron.account.remove-token — remove a user-added token from the address book

Usage:
  wallet-cli tron account remove-token [flags]

Requires:
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Flags:
  --contract <string>  TRC20 contract address; provide exactly one of --contract or --asset-id  [optional]
  --asset-id <string>  TRC10 numeric asset id; provide exactly one of --asset-id or --contract  [optional]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron account remove-token --network nile --contract TR7...
```

### `wallet-cli tron account resources --help`

```text
tron.account.resources — bandwidth/energy + staking (frozen, unfreezing, withdrawable)

Usage:
  wallet-cli tron account resources [flags]

Requires:
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron account resources --network nile
```

### `wallet-cli tron block get --help`

```text
tron.block.get — get a block (latest if omitted)

Usage:
  wallet-cli tron block get [flags]

Flags:
  --number <number>  block number to fetch, in block height; omit to fetch the latest block  [optional]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron block get --network nile
```

### `wallet-cli tron contract call --help`

```text
tron.contract.call — read-only call (triggerConstantContract)

Usage:
  wallet-cli tron contract call [flags]

Flags:
  --contract <string>  TRON contract address  [required]
  --method <string>    function signature, e.g. balanceOf(address)  [required]
  --params <string>    JSON array of ABI parameters as {type,value}; omit to pass no parameters  [optional]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron contract call --network nile --contract TR7... --method "balanceOf(address)" --params '[{"type":"address","value":"T..."}]'
```

### `wallet-cli tron contract deploy --help`

```text
tron.contract.deploy — deploy a smart contract

Usage:
  wallet-cli tron contract deploy [flags]

Requires:
  --network <id|alias>
  master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Flags:
  --abi <string>              contract ABI as a JSON array string  [required]
  --bytecode <string>         compiled contract bytecode as hex, 0x-prefixed or bare  [required]
  --fee-limit <number>        maximum energy fee to burn, in SUN  [required]
  --constructor-sig <string>  constructor signature, e.g. constructor(uint256); omit when the contract has no constructor args  [optional]
  --params <string>           constructor args as a JSON array of {type,value}; omit to pass no constructor args  [optional]
  --dry-run                   build and estimate only, with no signature and no broadcast; mutually exclusive with --sign-only  [optional, default: false]
  --sign-only                 sign and output the transaction without broadcasting; mutually exclusive with --dry-run; broadcast later with tx broadcast  [optional, default: false]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron contract deploy --network nile --abi '[...]' --bytecode 60... --fee-limit 1000000000
```

### `wallet-cli tron contract info --help`

```text
tron.contract.info — contract ABI + metadata (getContract + getContractInfo)

Usage:
  wallet-cli tron contract info [flags]

Flags:
  --contract <string>  TRON contract address  [required]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron contract info --network nile --contract TR7...
```

### `wallet-cli tron contract send --help`

```text
tron.contract.send — state-changing call (triggerSmartContract)

Usage:
  wallet-cli tron contract send [flags]

Requires:
  --network <id|alias>
  master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Flags:
  --contract <string>        TRON contract address  [required]
  --method <string>          function signature, e.g. transfer(address,uint256)  [required]
  --params <string>          JSON array of ABI parameters as {type,value}; omit to pass no parameters  [optional]
  --call-value-sun <number>  native TRX attached to the call, in SUN  [optional, default: 0]
  --fee-limit <number>       maximum energy fee to burn, in SUN  [optional, default: 100000000]
  --dry-run                  build and estimate only, with no signature and no broadcast; mutually exclusive with --sign-only  [optional, default: false]
  --sign-only                sign and output the transaction without broadcasting; mutually exclusive with --dry-run; broadcast later with tx broadcast  [optional, default: false]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron contract send --network nile --contract TR7... --method "transfer(address,uint256)" --params '[...]'
```

### `wallet-cli tron message sign --help`

```text
tron.message.sign — sign an arbitrary message (TIP-191/V2 · EIP-191)

Usage:
  wallet-cli tron message sign [flags]

Requires:
  master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Flags:
  --message <string>  message text to sign; provide this OR --message-stdin; exactly one is required  [optional]

Input flags:
  --message-stdin            read the message bytes/text from stdin (fd 0)  [optional]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron message sign --message "hello"
```

### `wallet-cli tron resource cancel-unfreeze --help`

```text
tron.resource.cancel-unfreeze — cancel all pending unstakes (roll back to frozen)

Usage:
  wallet-cli tron resource cancel-unfreeze [flags]

Requires:
  --network <id|alias>
  master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Flags:
  --dry-run    build and estimate only, with no signature and no broadcast; mutually exclusive with --sign-only  [optional, default: false]
  --sign-only  sign and output the transaction without broadcasting; mutually exclusive with --dry-run; broadcast later with tx broadcast  [optional, default: false]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron resource cancel-unfreeze --network nile
```

### `wallet-cli tron resource delegate --help`

```text
tron.resource.delegate — delegate frozen resource to another address (DelegateResourceV2)

Usage:
  wallet-cli tron resource delegate [flags]

Requires:
  --network <id|alias>
  master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Flags:
  --amount-sun <string>          staked-TRX amount backing the delegated resource, in SUN  [required]
  --receiver <string>            TRON address receiving the delegated resource  [required]
  --resource <energy|bandwidth>  resource type to delegate or reclaim  [optional, default: bandwidth]
  --lock                         lock the delegation and prevent early undelegation  [optional, default: false]
  --lock-period <number>         lock duration in blocks, approximately 3 seconds per block; requires --lock  [optional]
  --dry-run                      build and estimate only, with no signature and no broadcast; mutually exclusive with --sign-only  [optional, default: false]
  --sign-only                    sign and output the transaction without broadcasting; mutually exclusive with --dry-run; broadcast later with tx broadcast  [optional, default: false]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron resource delegate --network nile
```

### `wallet-cli tron resource freeze --help`

```text
tron.resource.freeze — stake TRX for energy/bandwidth (FreezeBalanceV2)

Usage:
  wallet-cli tron resource freeze [flags]

Requires:
  --network <id|alias>
  master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Flags:
  --amount-sun <string>          amount to freeze as staked TRX, in SUN  [required]
  --resource <energy|bandwidth>  resource type to obtain  [optional, default: bandwidth]
  --dry-run                      build and estimate only, with no signature and no broadcast; mutually exclusive with --sign-only  [optional, default: false]
  --sign-only                    sign and output the transaction without broadcasting; mutually exclusive with --dry-run; broadcast later with tx broadcast  [optional, default: false]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron resource freeze --network nile
```

### `wallet-cli tron resource prices --help`

```text
tron.resource.prices — energy / bandwidth unit prices

Usage:
  wallet-cli tron resource prices [flags]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron resource prices --network nile
```

### `wallet-cli tron resource undelegate --help`

```text
tron.resource.undelegate — reclaim delegated resource (UnDelegateResourceV2)

Usage:
  wallet-cli tron resource undelegate [flags]

Requires:
  --network <id|alias>
  master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Flags:
  --amount-sun <string>          staked-TRX amount backing the resource to reclaim, in SUN  [required]
  --receiver <string>            TRON address that previously received the delegated resource  [required]
  --resource <energy|bandwidth>  resource type to delegate or reclaim  [optional, default: bandwidth]
  --dry-run                      build and estimate only, with no signature and no broadcast; mutually exclusive with --sign-only  [optional, default: false]
  --sign-only                    sign and output the transaction without broadcasting; mutually exclusive with --dry-run; broadcast later with tx broadcast  [optional, default: false]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron resource undelegate --network nile
```

### `wallet-cli tron resource unfreeze --help`

```text
tron.resource.unfreeze — unstake TRX (UnfreezeBalanceV2)

Usage:
  wallet-cli tron resource unfreeze [flags]

Requires:
  --network <id|alias>
  master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Flags:
  --amount-sun <string>          amount to unfreeze as staked TRX, in SUN  [required]
  --resource <energy|bandwidth>  resource type to release  [optional, default: bandwidth]
  --dry-run                      build and estimate only, with no signature and no broadcast; mutually exclusive with --sign-only  [optional, default: false]
  --sign-only                    sign and output the transaction without broadcasting; mutually exclusive with --dry-run; broadcast later with tx broadcast  [optional, default: false]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron resource unfreeze --network nile
```

### `wallet-cli tron resource withdraw --help`

```text
tron.resource.withdraw — withdraw expired unfrozen TRX

Usage:
  wallet-cli tron resource withdraw [flags]

Requires:
  --network <id|alias>
  master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Flags:
  --dry-run    build and estimate only, with no signature and no broadcast; mutually exclusive with --sign-only  [optional, default: false]
  --sign-only  sign and output the transaction without broadcasting; mutually exclusive with --dry-run; broadcast later with tx broadcast  [optional, default: false]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron resource withdraw --network nile
```

### `wallet-cli tron token balance --help`

```text
tron.token.balance — single token balance (TRC20 via --contract, TRC10 via --asset-id)

Usage:
  wallet-cli tron token balance [flags]

Requires:
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Flags:
  --contract <string>  TRC20 contract address; provide exactly one of --contract or --asset-id  [optional]
  --asset-id <string>  TRC10 numeric asset id; provide exactly one of --asset-id or --contract  [optional]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron token balance --network nile --contract TR7...
```

### `wallet-cli tron token info --help`

```text
tron.token.info — token metadata (name/symbol/decimals/totalSupply)

Usage:
  wallet-cli tron token info [flags]

Flags:
  --contract <string>  TRC20 contract address; provide exactly one of --contract or --asset-id  [optional]
  --asset-id <string>  TRC10 numeric asset id; provide exactly one of --asset-id or --contract  [optional]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron token info --network nile --contract TR7...
```

### `wallet-cli tron tx broadcast --help`

```text
tron.tx.broadcast — broadcast a presigned transaction

Usage:
  wallet-cli tron tx broadcast [flags]

Requires:
  --network <id|alias>

Flags:
  --transaction <string>  signed TRON transaction JSON; provide this OR --tx-stdin; exactly one is required  [optional]

Input flags:
  --tx-stdin                 read the signed transaction JSON from stdin (fd 0)  [optional]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron tx broadcast --network nile --tx-stdin < signed.json
```

### `wallet-cli tron tx info --help`

```text
tron.tx.info — full transaction detail + receipt

Usage:
  wallet-cli tron tx info [flags]

Flags:
  --txid <string>  TRON transaction id/hash  [required]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron tx info --network nile --txid abc123
```

### `wallet-cli tron tx send-native --help`

```text
tron.tx.send-native — transfer native SUN

Usage:
  wallet-cli tron tx send-native [flags]

Requires:
  --network <id|alias>
  master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Flags:
  --to <string>          recipient TRON base58 address  [required]
  --amount-sun <string>  amount to send as a non-negative integer string, in SUN (1 TRX = 1,000,000 SUN)  [required]
  --dry-run              build and estimate only, with no signature and no broadcast; mutually exclusive with --sign-only  [optional, default: false]
  --sign-only            sign and output the transaction without broadcasting; mutually exclusive with --dry-run; broadcast later with tx broadcast  [optional, default: false]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron tx send-native --network nile --to T... --amount-sun 1000000
```

### `wallet-cli tron tx send-token --help`

```text
tron.tx.send-token — transfer TRC20 (--contract) or TRC10 (--asset-id)

Usage:
  wallet-cli tron tx send-token [flags]

Requires:
  --network <id|alias>
  master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Flags:
  --to <string>         recipient TRON base58 address  [required]
  --amount <string>     token amount as a raw non-negative integer string in the token's smallest unit; no decimal point  [required]
  --contract <string>   TRC20 contract address; provide exactly one of --contract or --asset-id  [optional]
  --asset-id <string>   TRC10 numeric asset id; provide exactly one of --asset-id or --contract  [optional]
  --fee-limit <number>  maximum TRX energy fee to burn, in SUN  [optional, default: 100000000]
  --dry-run             build and estimate only, with no signature and no broadcast; mutually exclusive with --sign-only  [optional, default: false]
  --sign-only           sign and output the transaction without broadcasting; mutually exclusive with --dry-run; broadcast later with tx broadcast  [optional, default: false]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron tx send-token --network nile --to T... --amount 1000000 --contract TR7...
```

### `wallet-cli tron tx status --help`

```text
tron.tx.status — confirmation status of a transaction

Usage:
  wallet-cli tron tx status [flags]

Flags:
  --txid <string>  TRON transaction id/hash  [required]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli tron tx status --network nile --txid abc123
```

### `wallet-cli wallet active --help`

```text
wallet.active — show the current active account

Usage:
  wallet-cli wallet active [flags]

Requires:
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli wallet active
```

### `wallet-cli wallet add-account --help`

```text
wallet.add-account — derive an HD account in a seed wallet (next free, or --index)

Usage:
  wallet-cli wallet add-account [flags]

Requires:
  master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY

Flags:
  --account <string>  seed wallet accountId, label, or address to derive from  [required]
  --index <number>    explicit HD account index, in account index; omit to use the next free index  [optional]
  --label <string>    label for the new derived account, 1-64 chars; omit to auto-generate  [optional]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli wallet add-account --account main --index 3
```

### `wallet-cli wallet backup --help`

```text
wallet.backup — export an account's secret + metadata to a 0600 file

Usage:
  wallet-cli wallet backup [flags]

Requires:
  master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY

Flags:
  --account <string>  account or wallet to export, addressed by accountId, label, or address  [required]
  --out <string>      output file path; omit to write <wallet-cli-root>/backups/<accountId>-<timestamp>.json; file is created with mode 0600 and never overwritten  [optional]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli wallet backup --account main --out ~/main-backup.json --password-stdin
```

### `wallet-cli wallet create --help`

```text
wallet.create — create a new HD wallet (BIP39 seed)

Usage:
  wallet-cli wallet create [flags]

Requires:
  master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY

Flags:
  --label <string>  human-friendly unique account label, 1-64 chars; omit to auto-generate  [optional]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli wallet create --label main
```

### `wallet-cli wallet delete --help`

```text
wallet.delete — delete a wallet/account and clean orphan labels

Usage:
  wallet-cli wallet delete [flags]

Flags:
  --account <string>  account or wallet to delete, addressed by accountId, label, or address  [required]
  --yes               skip the interactive confirmation; required for non-TTY deletion  [optional, default: false]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli wallet delete --account old --yes
```

### `wallet-cli wallet export-address --help`

```text
wallet.export-address — show an account's receive addresses

Usage:
  wallet-cli wallet export-address [flags]

Requires:
  an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli wallet export-address --network nile --account main
```

### `wallet-cli wallet import-ledger --help`

```text
wallet.import-ledger — register a Ledger account (watch-only; signs on the device)

Usage:
  wallet-cli wallet import-ledger [flags]

Flags:
  --app <tron|ethereum>  Ledger app to open on the device, selecting TRON or EVM address derivation  [required]
  --index <number>       HD account index to import; omit with no --path/--address to use index 0; mutually exclusive with --path and --address  [optional]
  --path <string>        explicit BIP32 derivation path, e.g. m/44'/195'/0'/0/0 for TRON or m/44'/60'/0'/0/0 for Ethereum; mutually exclusive with --index and --address  [optional]
  --address <string>     known address to locate by bounded scan; mutually exclusive with --index and --path  [optional]
  --scan-limit <number>  number of account indexes to scan when using --address, in indexes; omit to scan 20 indexes  [optional]
  --label <string>       human-friendly unique account label, 1-64 chars; omit to auto-generate  [optional]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli wallet import-ledger --app ethereum --index 0 --label cold
```

### `wallet-cli wallet import-mnemonic --help`

```text
wallet.import-mnemonic — import an existing BIP39 mnemonic (encrypted at rest)

Usage:
  wallet-cli wallet import-mnemonic [flags]

Requires:
  master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY

Flags:
  --label <string>  human-friendly unique account label, 1-64 chars; omit to auto-generate; mnemonic comes from --mnemonic-stdin or interactive prompt  [optional]

Input flags:
  --mnemonic-stdin           read the BIP39 mnemonic from stdin (fd 0)  [optional]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli wallet import-mnemonic --label main
```

### `wallet-cli wallet import-private-key --help`

```text
wallet.import-private-key — import an existing private key (encrypted at rest)

Usage:
  wallet-cli wallet import-private-key [flags]

Requires:
  master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY

Flags:
  --label <string>  human-friendly unique account label, 1-64 chars; omit to auto-generate; private key comes from --private-key-stdin or interactive prompt  [optional]

Input flags:
  --private-key-stdin        read the private key from stdin (fd 0)  [optional]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli wallet import-private-key --label hot
```

### `wallet-cli wallet import-watch --help`

```text
wallet.import-watch — register a watch-only address (no secret)

Usage:
  wallet-cli wallet import-watch [flags]

Flags:
  --address <string>  watch-only address to track; format: TRON base58 T... or EVM 0x...; family is auto-detected  [required]
  --label <string>    human-friendly unique account label, 1-64 chars; omit to auto-generate  [optional]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli wallet import-watch --address T... --label team-vault
```

### `wallet-cli wallet list --help`

```text
wallet.list — list wallets/accounts (no unlock needed)

Usage:
  wallet-cli wallet list [flags]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli wallet list --output json
```

### `wallet-cli wallet rename --help`

```text
wallet.rename — rename an account label

Usage:
  wallet-cli wallet rename [flags]

Flags:
  --account <string>  accountId, current label, or address to rename  [required]
  --label <string>    new unique label, 1-64 chars  [required]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli wallet rename --account main --label primary
```

### `wallet-cli wallet set-active --help`

```text
wallet.set-active — set the active account

Usage:
  wallet-cli wallet set-active [flags]

Flags:
  --account <string>  accountId, label, or address to make active for future commands  [required]

Global flags:
  --output, -o <text|json>   result format  [optional, default: config.defaultOutput (built-in: text)]
  --network <string>         network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>  [optional]
  --account <string>         accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active  [optional]
  --timeout <number>         per RPC/device call timeout, in milliseconds  [optional, default: config.timeoutMs (built-in: 60000)]
  --quiet                    suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose  [optional, default: false]
  --verbose                  show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet  [optional, default: false]
  --rpc-url <string>         override the selected network RPC URL for this run  [optional]
  --grpc-endpoint <string>   override the selected TRON gRPC endpoint for this run  [optional]
  --password-stdin           read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run  [optional]

Examples:
  wallet-cli wallet set-active --account main
```
