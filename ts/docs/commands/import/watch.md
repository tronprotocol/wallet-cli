# wallet-cli import watch

Register a watch-only address (no secret).

## Synopsis

```
wallet-cli import watch --address <T…> [--label <l>] [options]
```

## Options

| Option | Description |
|---|---|
| `--address <string>` | watch-only address to track; TRON base58 T…; family auto-detected  [required] |
| `--label <string>` | unique account label, 1-64 chars |

Plus [global options](../index.md).

## Notes

Cannot sign — queries only. Useful for monitoring cold-storage balances.

## Examples

```bash
wallet-cli import watch --address TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ --label cold
```

```console
✅ Added watch-only account "cold"
  Address  TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
  Note     read-only; signing operations will be rejected
```

```bash
wallet-cli import watch --address TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ --label cold -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"import.watch","data":{"status":"created","accountId":"wlt_jsyq8fxe","label":"cold","type":"watch","index":null,"active":true,"addresses":{"tron":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ"},"family":"tron"},"meta":{"durationMs":36,"warnings":[]}}
```

## Output

`data` carries the newly registered watch-only account — address only, no secret. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `status` | string | `"created"` |
| `accountId` | string | Stable account id |
| `label` | string | Account label |
| `type` | string | `"watch"` (read-only, cannot sign) |
| `index` | number \| null | Non-HD account, always `null` |
| `active` | boolean | Became the active account |
| `addresses.tron` | string | Base58 TRON address |
| `family` | string | Chain family of the address (e.g. `tron`) |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../../machine-interface.md).

## See also

[`import ledger`](ledger.md) · [`account balance`](../account/balance.md)
