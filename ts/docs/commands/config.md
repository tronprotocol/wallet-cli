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
| `networks` | — | — | Known networks (read-only list) |

Service credentials — all optional, all writable, and only needed by the commands that use them:

| Key | Used by | Meaning |
|---|---|---|
| `tronlinkSecretId` | [`tx multisig`](tx/multisig.md) | TronLink multi-sign service secret id |
| `tronlinkSecretKey` | [`tx multisig`](tx/multisig.md) | TronLink service secret key — **masked on read** |
| `tronlinkChannel` | [`tx multisig`](tx/multisig.md) | TronLink service channel |
| `gasfreeApiKey` | [`gasfree`](gasfree/index.md) | GasFree Open Platform API key |
| `gasfreeApiSecret` | [`gasfree`](gasfree/index.md) | GasFree API secret — **masked on read** |

Each must be 1–256 characters with no control characters.

**Secrets are masked, never echoed.** `tronlinkSecretKey` and `gasfreeApiSecret` read back as
`********`, and setting one returns `"value":"********","input":"********"` rather than the value
you typed — so a config write is safe to log. An unset secret reads as absent, not as `********`,
which is how you tell "not configured" from "configured".

These are the only wallet-cli settings that hold credentials, and unlike wallet secrets they are
stored in the config document rather than the encrypted keystore — they authenticate you to a
third-party service, they do not control funds.

Precedence for a value that has both a flag and a config key (highest first): command-line flag > config value > built-in default — e.g. `--timeout` > config `timeoutMs` > built-in 60000.

An invalid value returns `invalid_value` (exit 2). `networks` is read-only — writing it fails with
`networks is read-only` (`invalid_value`, exit 2).

## Examples

Show the whole effective config:

```bash
wallet-cli config
```

```console
defaultNetwork  tron:mainnet
defaultOutput   text
timeoutMs       60000
waitTimeoutMs   60000
networks        tron:mainnet, tron:nile, tron:shasta
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

Configure a service credential — note that the value never appears in the output:

```bash
wallet-cli config gasfreeApiSecret "$SECRET" -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"config","data":{"key":"gasfreeApiSecret","value":"********","input":"********"},"meta":{"durationMs":37,"warnings":[]}}
```

```bash
wallet-cli config
```

```console
defaultNetwork    tron:mainnet
defaultOutput     text
timeoutMs         60000
waitTimeoutMs     60000
networks          tron:mainnet, tron:nile, tron:shasta
gasfreeApiSecret  ********
```

Keys that have never been set are omitted from the listing entirely — that absence is how you tell
an unconfigured credential from a configured one.

## Output

`data` varies by mode. Local command — no `chain` block.

| Mode | `data` fields |
|---|---|
| show all (no args) | one field per set key: `defaultNetwork`, `defaultOutput`, `timeoutMs`, `waitTimeoutMs`, `networks` (array of network ids), plus any configured `tronlink*` / `gasfree*` credentials, with secrets as `********` |
| read (`<key>`) | `key`, `value` |
| set (`<key> <value>`) | `key`, `value`, `input` (the raw string as typed) |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[Networks](../concepts/networks.md) · [machine-interface](../machine-interface.md)
