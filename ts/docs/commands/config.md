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
| `waitTimeoutMs` | integer ms ≥ 0 | `60000` | Default `--wait` polling cap for broadcast commands *(new in v0.1.1)* |
| `networks` | — | — | Known networks (read-only list) |

Precedence for `--wait-timeout` (highest first): command-line `--wait-timeout` > config `waitTimeoutMs` > built-in 60000 — the same pattern `--timeout` / `timeoutMs` follows.

An invalid value returns `invalid_value` (exit 2).

## Examples

```bash
wallet-cli config                        # show everything
wallet-cli config waitTimeoutMs          # read one key
wallet-cli config waitTimeoutMs 120000   # raise the default --wait cap to 120 s
```

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[Networks](../concepts/networks.md) · [machine-interface](../machine-interface.md)
