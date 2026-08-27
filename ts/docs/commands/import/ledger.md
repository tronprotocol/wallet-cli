# wallet-cli import ledger

Register a Ledger account. Watch-only locally; signs on the device.

## Synopsis

```
wallet-cli import ledger --app <tron|ethereum> (--index <n> | --path <bip32> | --address <addr>)
                         [--scan-limit <n>] [--label <l>] [options]
```

## Options

| Option | Description |
|---|---|
| `--app <tron\|ethereum>` | **Required.** Ledger app to open on the device; this is what selects the chain family and the derivation scheme |
| `--index <number>` | Account index under the app's default path; omit with no `--path`/`--address` to use index 0. Mutually exclusive with `--path` / `--address` |
| `--path <string>` | Explicit derivation path, e.g. `m/44'/195'/0'/0/0` (TRON) or `m/44'/60'/0'/0/0` (Ethereum) |
| `--address <string>` | Known address to locate by bounded scan |
| `--scan-limit <number>` | Indexes to scan with `--address` (default 20) |
| `--label <string>` | Unique account label, 1-64 chars; omit to auto-generate |

Plus [global options](../index.md).

## Notes

Creates a watch-only entry; no secret is stored. Requires the device unlocked with the selected app open.

`--app` is what makes a Ledger account **single-family**: the TRON app registers a `tron` account and the Ethereum app an `evm` one, and the resulting account has only that one address. Import the same device twice, once per app, to hold both. See [Ledger guide](../../guide/ledger.md).

## Examples

```bash
wallet-cli import ledger --app tron --index 0 --label cold
```

```console
✅ Registered Ledger account "cold"
  Account ID    wlt_7h2k9d3m
  App           tron
  Path          m/44'/195'/0'/0/0
  TRON address  TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ

⚠️ No private key is stored locally. Signing requires device confirmation.
```

The Ethereum app registers an EVM account from the same device:

```bash
wallet-cli import ledger --app ethereum --index 0 --label cold-evm
```

```bash
wallet-cli import ledger --app tron --index 0 --label cold -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"import.ledger","data":{"status":"created","accountId":"wlt_7h2k9d3m","label":"cold","type":"ledger","index":null,"active":true,"addresses":{"tron":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ"},"family":"tron","path":"m/44'/195'/0'/0/0"},"meta":{"durationMs":812,"warnings":[]}}
```

## Output

`data` carries the newly registered Ledger account — address and derivation path only, no secret. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `status` | string | `"created"`, or `"existing"` if the account was already registered |
| `accountId` | string | Stable account id |
| `label` | string | Account label |
| `type` | string | `"ledger"` (signs on device) |
| `index` | number \| null | Non-HD account, always `null` (device index lives in `path`) |
| `active` | boolean | Became the active account |
| `addresses` | object | The single address, keyed by its family — `{"tron":"T…"}` for the TRON app, `{"evm":"0x…"}` for the Ethereum app |
| `family` | string | Chain family selected by `--app` — `tron` or `evm` |
| `path` | string | Derivation path on the device |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../../machine-interface.md).

## See also

[Ledger guide](../../guide/ledger.md) · [`import watch`](watch.md)
