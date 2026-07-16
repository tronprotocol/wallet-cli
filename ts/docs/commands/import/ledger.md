# wallet-cli import ledger

Register a Ledger account (watch-only; signs on device).

## Synopsis

```
wallet-cli import ledger --app tron (--index <n> | --path <bip32> | --address <T…>) [--label <l>] [options]
```

## Options

| Option | Description |
|---|---|
| `--app <tron>` | Ledger app to open, selecting the derivation scheme  [required] |
| `--index <number>` | HD account index to import (mutually exclusive with --path/--address) |
| `--path <string>` | explicit BIP32 path, e.g. m/44'/195'/0'/0/0 |
| `--address <string>` | known address to locate by bounded scan |
| `--scan-limit <number>` | indexes to scan with --address (default 20) |
| `--label <string>` | unique account label, 1-64 chars |

Plus [global options](../index.md).

## Notes

Creates a watch-only entry; no secret is stored. Requires the device unlocked with the TRON app open. See [Ledger guide](../../guide/ledger.md).

## Examples

```bash
wallet-cli import ledger --app tron --index 0 --label cold
```

```console
✅ Registered Ledger account "cold"
  Account ID  wlt_7h2k9d3m
  App         tron
  Path        m/44'/195'/0'/0/0
  Address     TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ

⚠️ No private key is stored locally. Signing requires device confirmation.
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
| `addresses.tron` | string | Base58 TRON address |
| `family` | string | Chain family of the address (e.g. `tron`) |
| `path` | string | BIP32 derivation path on the device |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../../machine-interface.md).

## See also

[Ledger guide](../../guide/ledger.md) · [`import watch`](watch.md)
