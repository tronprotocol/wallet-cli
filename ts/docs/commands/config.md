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

[Global options](index.md) only.

## Notes

Known keys:

| Key | Values | Built-in default | Meaning |
|---|---|---|---|
| `defaultNetwork` | network id | `tron:mainnet` | Network used when `--network` is omitted |
| `defaultOutput` | `text` \| `json` | `text` | Output format when `-o` is omitted |
| `timeoutMs` | integer ms | `60000` | Default per RPC/device call timeout (`--timeout` overrides) |
| `waitTimeoutMs` | integer ms ≥ 0 | `60000` | Default `--wait` polling cap for broadcast commands |
| `gasfreeApiKey` | string | (unset) | GasFree API key ([`gasfree`](gasfree/index.md)) |
| `gasfreeApiSecret` | string | (unset) | GasFree API secret |
| `tronlinkSecretId` | string | (unset) | TronLink multi-sig service secretId ([`tx multisig`](tx/multisig.md)) |
| `tronlinkSecretKey` | string | (unset) | TronLink multi-sig service secretKey |
| `tronlinkChannel` | string | (unset) | TronLink multi-sig service channel |
| `aliases` | — | — | Short name → canonical id map (read-only) |
| `networks` | — | — | Known networks and their configurable fields (read-only as a whole) |
| `networks.<id>` | — | — | One network's configurable fields; `<id>` may be a canonical id or an alias |
| `networks.<id>.httpEndpoint` | URL | per network | The node/RPC endpoint to use |
| `networks.<id>.apiKeyHeader` | header name | (unset) | Header a commercial endpoint authenticates by, e.g. `TRON-PRO-API-KEY` |
| `networks.<id>.apiKey` | string | (unset) | Credential sent in that header. **Secret** — always rendered masked |

`networks` and `aliases` are read-only as a whole; the writable network settings are the three `networks.<id>.…` leaves. Any other sub-key is `invalid_value`, and the error names the ones that are supported.

Precedence for a value that has both a flag and a config key (highest first): command-line flag > config value > built-in default — e.g. `--timeout` > config `timeoutMs` > built-in 60000.

**Secrets are never rendered in clear text.** `tronlinkSecretKey`, `gasfreeApiSecret` and `networks.<id>.apiKey` come back as `********` from every read, and a set of one echoes `input: "********"` too — the value goes to `config.yaml`, not to the terminal or to your shell history file's neighbours in a log.

**Endpoints are trimmed in listings, full in named reads.** `config` and `config networks` show `httpEndpoint` as a host only, because a commercial endpoint may carry its key in the URL path. Naming one network (`config networks.tron:nile`) or its leaf (`config networks.tron:nile.httpEndpoint`) is the deliberate act that reveals the whole URL.

Because `config.yaml` can hold service credentials, it is subject to a permission check: a symlink or a group/world-readable file fails with `insecure_config`. `chmod 600` it.

The external-service credentials are **per-environment**: the GasFree (`gasfreeApiKey` / `gasfreeApiSecret`) and TronLink (`tronlinkSecretId` / `tronlinkSecretKey` / `tronlinkChannel`) credentials must match the service environment of the current `--network` (mainnet vs testnet); a mismatch fails with `provider_error`, so swap them when you switch environments. When a key is unset, the commands that need it fail with a clear error — `gasfree_credentials_missing` for [`gasfree`](gasfree/index.md), `tronlink_credentials_missing` for [`tx multisig`](tx/multisig.md).

An invalid value returns `invalid_value` (exit 2).

## Examples

Show the whole effective config:

```bash
wallet-cli config
```

```console
defaultNetwork     tron:mainnet
defaultOutput      text
timeoutMs          60000
waitTimeoutMs      60000
networks
  tron:mainnet
    httpEndpoint  api.trongrid.io
  tron:nile
    httpEndpoint  nile.trongrid.io
  evm:11155111
    httpEndpoint  ethereum-sepolia-rpc.publicnode.com
aliases
  tron         tron:mainnet
  nile         tron:nile
  sepolia      evm:11155111
tronlinkSecretId   TEST
tronlinkSecretKey  ********
tronlinkChannel    test
gasfreeApiKey      ak_9f2c71d0e8b64a53
gasfreeApiSecret   ********
```

Read one key, then set it:

```bash
wallet-cli config timeoutMs
```

```console
timeoutMs  60000
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
wallet-cli config networks.tron:nile.httpEndpoint http://127.0.0.1:8090
wallet-cli config networks.tron:mainnet.apiKeyHeader TRON-PRO-API-KEY
wallet-cli config networks.tron:mainnet.apiKey <your-key>
```

Reading one network gives the endpoint in full, unlike the listing above:

```bash
wallet-cli config networks.tron:nile
```

```console
networks.tron:nile
  httpEndpoint  https://nile.trongrid.io
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"config","data":{"key":"networks.tron:nile","value":{"httpEndpoint":"https://nile.trongrid.io"}},"meta":{"durationMs":15,"warnings":[]}}
```

## Output

`data` varies by mode. Local command — no `chain` block.

| Mode | `data` fields |
|---|---|
| show all (no args) | one field per key: `defaultNetwork`, `defaultOutput`, `timeoutMs`, `waitTimeoutMs`, `networks` (id → `{httpEndpoint, apiKeyHeader?, apiKey?}`, endpoints trimmed to hosts), `aliases` (alias → id), `tronlinkSecretId`, `tronlinkSecretKey`, `tronlinkChannel`, `gasfreeApiKey`, `gasfreeApiSecret` |
| read (`<key>`) | `key`, `value` |
| set (`<key> <value>`) | `key`, `value`, `input` (the raw string as typed; `"********"` when the key is a secret) |

An unset network field is **absent** from the view rather than present and empty — the view says what *is* configured.

## Exit status

`0` success · `1` execution failure (`invalid_config` — `config.yaml` is unreadable or not valid YAML; `insecure_config` — it holds service credentials but is a symlink or group/world-readable, so `chmod 600` it) · `2` usage error (`invalid_value` — unknown key, a read-only key given a value, or an unsupported `networks.<id>.<field>`). See [machine-interface](../machine-interface.md).

## See also

[Networks](../concepts/networks.md) · [machine-interface](../machine-interface.md)
