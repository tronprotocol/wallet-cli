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
| `networks` | — | — | Known networks (read-only list) |

Precedence for a value that has both a flag and a config key (highest first): command-line flag > config value > built-in default — e.g. `--timeout` > config `timeoutMs` > built-in 60000.

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
gasfreeApiKey      ak_9f2c71d0e8b64a53
gasfreeApiSecret   sk_e37a90c412f85b6d
tronlinkSecretId   TEST
tronlinkSecretKey  TESTTESTTEST
tronlinkChannel    test
networks           tron:mainnet, tron:nile, tron:shasta
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

## Output

`data` varies by mode. Local command — no `chain` block.

| Mode | `data` fields |
|---|---|
| show all (no args) | one field per key: `defaultNetwork`, `defaultOutput`, `timeoutMs`, `waitTimeoutMs`, `gasfreeApiKey`, `gasfreeApiSecret`, `tronlinkSecretId`, `tronlinkSecretKey`, `tronlinkChannel`, `networks` (array of network ids) |
| read (`<key>`) | `key`, `value` |
| set (`<key> <value>`) | `key`, `value`, `input` (the raw string as typed) |

## Exit status

`0` success · `1` execution failure (`invalid_config` — `config.yaml` is unreadable or not valid YAML; `insecure_config` — it holds service credentials but is a symlink or group/world-readable, so `chmod 600` it) · `2` usage error (`invalid_value` — unknown key). See [machine-interface](../machine-interface.md).

## See also

[Networks](../concepts/networks.md) · [machine-interface](../machine-interface.md)
