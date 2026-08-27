# wallet-cli derive

Derive the next HD account from a seed wallet (by --seed-id).

## Synopsis

```
wallet-cli derive --seed-id <wlt_…> [--index <n>] [--label <l>] [options]
```

## Options

| Option | Description |
|---|---|
| `--seed-id <string>` | seed id of the HD wallet to derive from — the HD group header in `list`  [required] |
| `--index <number>` | explicit HD account index; omit to use the next free index |
| `--label <string>` | label for the new account, 1-64 chars; omit to auto-generate |
| `--password-stdin` | read the master password from stdin (fd 0) |

Plus [global options](index.md).

## Notes

Private-key and Ledger accounts have no seed and cannot derive. See [Accounts & HD](../concepts/accounts-and-hd.md).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

```bash
printf '%s' "$PW" | wallet-cli derive --seed-id wlt_y8cz6xda --password-stdin
```

```console
✅ Derived sub-account "main-1"
  Account ID    wlt_y8cz6xda.1
  Index         1
  TRON address  TWCa1W6BkcXZnRGxeZZw9jh8eNgULDVGzj
  EVM address   0x2395227A93465175c6D6EAF2B9d37c2cC0BaB60c
  Active        yes
  Note          shares master mnemonic; no separate backup needed
```

```bash
printf '%s' "$PW" | wallet-cli derive --seed-id wlt_y8cz6xda --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"derive","data":{"status":"created","accountId":"wlt_y8cz6xda.1","label":"main-1","type":"seed","index":1,"active":true,"addresses":{"tron":"TWCa1W6BkcXZnRGxeZZw9jh8eNgULDVGzj","evm":"0x2395227A93465175c6D6EAF2B9d37c2cC0BaB60c"},"seedId":"wlt_y8cz6xda","derivationPath":{"tron":"m/44'/195'/0'/0/1","evm":"m/44'/60'/0'/0/1"}},"meta":{"durationMs":1013,"warnings":[]}}
```

## Output

`data` is the newly derived account (always an HD `seed` account). Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `status` | string | `"created"` |
| `accountId` | string | Stable id `<seedId>.<index>` |
| `label` | string | Account label (default `<wallet-name>-<index>`, e.g. `main-1`) |
| `type` | string | Always `"seed"` |
| `index` | number | HD derivation index |
| `active` | boolean | Always `true` (the new account is made active) |
| `addresses` | object | One address per family the account can produce: `tron` (base58) and `evm` (`0x`, EIP-55 checksummed) |
| `derivationPath` | object | The BIP44 template each address came from: `{"tron":"m/44'/195'/0'/0/<index>","evm":"m/44'/60'/0'/0/<index>"}` |
| `seedId` | string | Owning seed wallet id |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[`create`](create.md) · [`list`](list.md)
