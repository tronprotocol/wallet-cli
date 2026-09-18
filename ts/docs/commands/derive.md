# wallet-cli derive

Derive the next HD account from a seed wallet.

## Synopsis

```
wallet-cli derive [--seed-id <wlt_…>] [--account <account>] [--index <n>] [--label <l>] [options]
```

## Options

| Option | Description |
|---|---|
| `--seed-id <string>` | seed id of the HD wallet to derive from — the HD group header in `list`. Wins over `--account` when both are given |
| `--account <string>` | accountId, label, or address of any account in the HD wallet; defaults to the active account |
| `--index <number>` | explicit HD account index; omit to use the next free index. An index that already exists is not re-derived — that account is made active, `status` comes back `"existing"`, and text output is headed `Selected existing account` instead of `Derived sub-account` |
| `--label <string>` | label for the new account, 1-64 chars; omit to auto-generate |
| `--password-stdin` | read the master password from stdin (fd 0) |

Plus [global options](index.md).

## Notes

With no `--seed-id` or `--account`, `derive` uses the seed of the active account. Any account of the wallet selects it, not only index 0.

Each new account gets `m/44'/195'/0'/0/<index>` for TRON and `m/44'/60'/0'/0/<index>` for EVM.

Private-key, Ledger, and watch-only accounts have no seed and cannot derive; selecting one fails with `seed_not_found` (exit 2). See [Accounts & HD](../concepts/accounts-and-hd.md).

A wallet created before 4.13.1 may hold TRON accounts at the old path. Deriving a new account from it fails with `legacy_derivation`. Naming one of those accounts with `--index` still works — it is made active with a warning. See [Recover addresses after `legacy_derivation`](../troubleshooting/legacy-derivation-recovery.md).

If a stored address does not match the seed, `derive` fails with `derivation_mismatch`.

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

Derive the next account of the active account's wallet:

```bash
printf '%s' "$PW" | wallet-cli derive --password-stdin
```

```console
✅ Derived sub-account "main-1"
  Account ID    wlt_kwyjcwdh.1
  Index         1
  TRON address  TVz38F2QmQf53g7QVATBbsZ6JkHKccJFAQ
  EVM address   0xEA4A61822322c695F5A9eB7920b843054CbDaA83
  Active        yes
  Note          shares the wallet's recovery phrase
```

```bash
printf '%s' "$PW" | wallet-cli derive --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"derive","data":{"status":"created","accountId":"wlt_kwyjcwdh.1","label":"main-1","type":"seed","index":1,"active":true,"addresses":{"tron":"TVz38F2QmQf53g7QVATBbsZ6JkHKccJFAQ","evm":"0xEA4A61822322c695F5A9eB7920b843054CbDaA83"},"seedId":"wlt_kwyjcwdh","derivationPath":{"tron":"m/44'/195'/0'/0/1","evm":"m/44'/60'/0'/0/1"}},"meta":{"durationMs":1784,"warnings":[]}}
```

To derive from another wallet, name any of its accounts with `--account`, or its seed with `--seed-id`.

## Output

`data` is the derived account (always an HD `seed` account). Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `status` | string | `"created"` for a newly derived index, `"existing"` when `--index` names an index this wallet already holds — that account is simply made active again, and no new key is derived |
| `accountId` | string | Stable id `<seedId>.<index>` |
| `label` | string | Account label (default `<wallet-name>-<index>`, e.g. `main-1`) |
| `type` | string | Always `"seed"` |
| `index` | number | HD derivation index |
| `active` | boolean | Always `true` (the account is made active) |
| `addresses` | object | One address per family the account can produce: `tron` (base58) and `evm` (`0x`, EIP-55 checksummed) |
| `derivationPath` | object | The verified path of each address. A new account gets `{"tron":"m/44'/195'/0'/0/<index>","evm":"m/44'/60'/0'/0/<index>"}`; an `"existing"` account reports the path it actually uses, which can be the old TRON path |
| `seedId` | string | Owning seed wallet id |

## Exit status

`0` success · `1` execution failure, including `legacy_derivation` and `derivation_mismatch` · `2` usage error, including `seed_not_found`. See [machine-interface](../machine-interface.md).

## See also

[`create`](create.md) · [`list`](list.md) · [Accounts & HD](../concepts/accounts-and-hd.md)
