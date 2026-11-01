# wallet-cli config

Show / get / set configuration values.

## Synopsis

```
wallet-cli config [<key>] [<value>] [options]
```

## Arguments

- `key` — config key to read or set; omit to show the whole effective config
- `value` — new value; omit to read the key

## Options

| Option | Description |
|---|---|
| `--api-key-stdin` | Read a credential value from stdin (fd 0). Accepted only with a credential key: `tronlinkSecretId`, `tronlinkSecretKey`, `gasfreeApiKey`, `gasfreeApiSecret`, `baiApiKey`, `networks.<id>.apiKey` |

Plus [global options](index.md).

## Notes

Known keys:

| Key | Values | Built-in default | Meaning |
|---|---|---|---|
| `defaultNetwork` | network id | `tron:728126428` | Network used when `--network` is omitted |
| `defaultOutput` | `text` \| `json` | `text` | Output format when `-o` is omitted |
| `timeoutMs` | integer ms, 0–2147483647 | `90000` | Default deadline for the whole command; `0` = no limit (`--timeout` overrides). A value in `config.yaml` outside this range is ignored and the built-in default applies |
| `gasfreeApiKey` | string | (unset) | GasFree API key ([`gasfree`](gasfree/index.md)). **Secret** — set only through `--api-key-stdin` |
| `gasfreeApiSecret` | string | (unset) | GasFree API secret. **Secret** — set only through `--api-key-stdin` |
| `tronlinkSecretId` | string | (unset) | TronLink multi-sig service secretId ([`tx multisig`](tx/multisig.md)). **Secret** — set only through `--api-key-stdin` |
| `tronlinkSecretKey` | string | (unset) | TronLink multi-sig service secretKey. **Secret** — set only through `--api-key-stdin` |
| `tronlinkChannel` | string | (unset) | TronLink multi-sig service channel |
| `baiApiKey` | string | (unset) | B.AI personal API key, used by the `bai` commands. **Secret** — set only through `--api-key-stdin` |
| `aliases` | — | — | Short name → canonical id map (read-only) |
| `networks` | — | — | Known networks and their configurable fields (read-only as a whole) |
| `networks.<id>` | — | — | One network's configurable fields; `<id>` may be a canonical id or an alias |
| `networks.<id>.httpEndpoint` | absolute HTTP(S) URL | per network | The node/RPC endpoint to use; invalid values fail with `invalid_value` |
| `networks.<id>.apiKeyHeader` | header name | (unset) | HTTP header name, 1–64 characters without spaces, colons or control characters; surrounding whitespace is trimmed, e.g. `TRON-PRO-API-KEY` |
| `networks.<id>.apiKey` | string | (unset) | Credential sent in that header. **Secret** — always rendered masked, set only through `--api-key-stdin` |

`networks` and `aliases` are read-only as a whole; the writable network settings are the three `networks.<id>.…` leaves. Any other sub-key is `invalid_value`, and the error names the ones that are supported.

Precedence for a value that has both a flag and a config key (highest first): command-line flag > config value > built-in default — e.g. `--timeout` > config `timeoutMs` > built-in 90000.

**Secrets are never rendered in clear text.** `tronlinkSecretId`, `tronlinkSecretKey`, `gasfreeApiKey`, `gasfreeApiSecret`, `baiApiKey` and `networks.<id>.apiKey` come back as `********` from every read, and setting one echoes `value` and `input` as `"********"` too. An error whose text from a node or service repeats one of them shows `********` in its place.

**Secrets are read only from stdin.** None of the six is accepted as a command-line value — `config gasfreeApiKey <key>` fails with `invalid_option` — so a credential never lands in shell history or a process listing. Pipe it in with `--api-key-stdin`, one key per run. A `config.yaml` that holds any of them must be a regular file with mode `0600`, or every command fails with `insecure_config`.

**Endpoints are trimmed in listings, full in named reads.** `config` and `config networks` show `httpEndpoint` as a host only, because a commercial endpoint may carry its key in the URL path. Naming one network (`config networks.tron:3448148188`) or its leaf (`config networks.tron:3448148188.httpEndpoint`) is the deliberate act that reveals the whole URL.

An unset field is **absent** from the view rather than present and empty — the view says what *is* configured. Reading an unset key by name returns only `key` (text: `<key>  Not configured`).

The external-service credentials are **per-environment**: the GasFree (`gasfreeApiKey` / `gasfreeApiSecret`) and TronLink (`tronlinkSecretId` / `tronlinkSecretKey` / `tronlinkChannel`) credentials must match the service environment of the current `--network` (mainnet vs testnet); a mismatch fails with `provider_error`, so swap them when you switch environments. When a key is unset, the commands that need it fail with a clear error — `gasfree_credentials_missing` for [`gasfree`](gasfree/index.md), `tronlink_credentials_missing` for [`tx multisig`](tx/multisig.md).

**Setting `baiApiKey` only saves the key locally:** it does not contact B.AI, needs no network, account or master password, and neither checks the key nor binds a wallet. [`bai recharge`](bai/recharge.md) checks the paying address's binding each time it runs and binds it first if needed.

An invalid value returns `invalid_value` (exit 2). Credential values must contain 1–256 characters without control characters. Network endpoints, header names and credentials are validated on load as well as on set.

## Examples

Show the whole effective config:

```bash
wallet-cli config
```

```console
defaultNetwork     tron:728126428
defaultOutput      text
timeoutMs          90000
networks
  tron:728126428
    httpEndpoint  api.trongrid.io
    apiKeyHeader  TRON-PRO-API-KEY
    apiKey        ********
  tron:3448148188
    httpEndpoint  nile.trongrid.io
  tron:2494104990
    httpEndpoint  api.shasta.trongrid.io
  eip155:1
    httpEndpoint  ethereum-rpc.publicnode.com
  eip155:11155111
    httpEndpoint  ethereum-sepolia-rpc.publicnode.com
  eip155:56
    httpEndpoint  bsc-dataseed.bnbchain.org
  eip155:97
    httpEndpoint  bsc-testnet-dataseed.bnbchain.org
  eip155:8453
    httpEndpoint  mainnet.base.org
  eip155:84532
    httpEndpoint  sepolia.base.org
aliases
  tron          tron:728126428
  tron:mainnet  tron:728126428
  nile          tron:3448148188
  tron:nile     tron:3448148188
  shasta        tron:2494104990
  tron:shasta   tron:2494104990
  ethereum      eip155:1
  sepolia       eip155:11155111
  bsc           eip155:56
  bsc-testnet   eip155:97
  base          eip155:8453
  base-sepolia  eip155:84532
tronlinkSecretId   ********
tronlinkSecretKey  ********
tronlinkChannel    test
gasfreeApiKey      ********
gasfreeApiSecret   ********
```

Read one key, then set it:

```bash
wallet-cli config timeoutMs
```

```console
timeoutMs  90000
```

```bash
wallet-cli config timeoutMs 120000
```

```console
✅ Set config
  Key    timeoutMs
  Value  120000
```

```bash
wallet-cli config timeoutMs 120000 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"config","data":{"key":"timeoutMs","value":120000,"input":"120000"},"meta":{"durationMs":3,"warnings":[]}}
```

Point a network at your own node, or at a commercial endpoint that authenticates by header:

```bash
wallet-cli config networks.tron:3448148188.httpEndpoint http://127.0.0.1:8090
```

```bash
wallet-cli config networks.tron:728126428.apiKeyHeader TRON-PRO-API-KEY
```

```bash
printf '%s\n' "$TRONGRID_KEY" | wallet-cli config networks.tron:728126428.apiKey --api-key-stdin
```

Store the GasFree credentials and a B.AI API key, each read from stdin:

```bash
printf '%s\n' "$GASFREE_KEY" | wallet-cli config gasfreeApiKey --api-key-stdin
printf '%s\n' "$GASFREE_SECRET" | wallet-cli config gasfreeApiSecret --api-key-stdin
```


```bash
printf '%s\n' "$BAI_KEY" | wallet-cli config baiApiKey --api-key-stdin
```

Reading one network gives the endpoint in full, unlike the listing above:

```bash
wallet-cli config networks.tron:3448148188
```

```console
networks.tron:3448148188
  httpEndpoint  https://nile.trongrid.io
```

```bash
wallet-cli config networks.tron:3448148188 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"config","data":{"key":"networks.tron:3448148188","value":{"httpEndpoint":"https://nile.trongrid.io"}},"meta":{"durationMs":14,"warnings":[]}}
```

## Output

`data` varies by mode. Local command — no `chain` block.

| Mode | `data` fields |
|---|---|
| show all (no args) | one field per key: `defaultNetwork`, `defaultOutput`, `timeoutMs`, `networks` (id → `{httpEndpoint, apiKeyHeader?, apiKey?}`, endpoints trimmed to hosts), `aliases` (alias → id), `tronlinkSecretId`, `tronlinkSecretKey`, `tronlinkChannel`, `gasfreeApiKey`, `gasfreeApiSecret`, `baiApiKey` — each only when set, secrets masked |
| read (`<key>`) | `key`, `value`; only `key` when the key is unset |
| set (`<key> <value>`) | `key`, `value`, `input` (the raw string as typed); both `"********"` when the key is a secret |

## Exit status

`0` success · `1` execution failure (`io_error` — an atomic config write failed) · `2` usage error (`invalid_config` — `config.yaml` is unreadable or not valid YAML; `insecure_config` — it holds service credentials but is a symlink or group/world-readable, so `chmod 600` it; `invalid_value` — unknown key, a read-only key given a value, or an unsupported `networks.<id>.<field>`; `invalid_option` — a credential key given a command-line value, or `--api-key-stdin` with a key that is not a credential). See [machine-interface](../machine-interface.md).

## See also

[Networks](../concepts/networks.md) · [machine-interface](../machine-interface.md)
