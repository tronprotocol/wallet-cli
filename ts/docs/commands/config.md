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

Precedence for a value that has both a flag and a config key (highest first): command-line flag > config value > built-in default — e.g. `--timeout` > config `timeoutMs` > built-in 60000.

An invalid value returns `invalid_value` (exit 2).

## Examples

Show the whole effective config:

```console
$ wallet-cli config
defaultNetwork  tron:mainnet
defaultOutput   text
timeoutMs       60000
waitTimeoutMs   60000
networks        tron:mainnet, tron:nile, tron:shasta
```

Read one key, then set it:

```console
$ wallet-cli config timeoutMs
timeoutMs  60000

$ wallet-cli config timeoutMs 120000
✅ Set config
  Key    timeoutMs
  Value  120000
```

```console
$ wallet-cli config timeoutMs 120000 -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"config","data":{"key":"timeoutMs","value":120000,"input":"120000"},"meta":{"durationMs":3,"warnings":[]}}
```

## Output

`data` varies by mode. Local command — no `chain` block.

| Mode | `data` fields |
|---|---|
| show all (no args) | one field per key: `defaultNetwork`, `defaultOutput`, `timeoutMs`, `waitTimeoutMs`, `networks` (array of network ids) |
| read (`<key>`) | `key`, `value` |
| set (`<key> <value>`) | `key`, `value`, `input` (the raw string as typed) |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[Networks](../concepts/networks.md) · [machine-interface](../machine-interface.md)
