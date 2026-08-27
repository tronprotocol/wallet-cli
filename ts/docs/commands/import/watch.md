# wallet-cli import watch

Register a watch-only address. No secret is stored.

## Synopsis

```
wallet-cli import watch --address <address> [--label <l>] [options]
```

## Options

| Option | Description |
|---|---|
| `--address <string>` | **Required.** Watch-only address to track — TRON base58 (`T…`) or EVM hex (`0x…`); the family is detected from the value |
| `--label <string>` | unique account label, 1-64 chars |

Plus [global options](../index.md).

## Notes

Cannot sign — queries only. Useful for monitoring cold-storage balances.

A watch-only account is **single-family**: it holds the one address you gave it, so it only appears and works on networks of that family. Register the same wallet's other address separately to watch both.

## Examples

```bash
wallet-cli import watch --address TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ --label cold
```

```console
✅ Added watch-only account "cold"
  TRON address  TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
  Note          read-only; signing operations will be rejected
```

An EVM address registers the same way, as an `evm` account:

```bash
wallet-cli import watch --address 0x742d35Cc6634C0532925a3b844Bc454e4438f44e --label cold-evm
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
| `addresses` | object | The single address, keyed by its family — `{"tron":"T…"}` or `{"evm":"0x…"}` |
| `family` | string | Chain family detected from the address — `tron` or `evm` |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../../machine-interface.md).

## See also

[`import ledger`](ledger.md) · [`account balance`](../account/balance.md)
