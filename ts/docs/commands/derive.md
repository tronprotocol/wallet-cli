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
| `--index <number>` | explicit HD account index; omit to use the next free index. An index that already exists is not re-derived — the existing account is made active and `status` comes back `"existing"` |
| `--label <string>` | label for the new account, 1-64 chars; omit to auto-generate |
| `--password-stdin` | read the master password from stdin (fd 0) |

Plus [global options](index.md).

## Notes

Private-key and Ledger accounts have no seed and cannot derive. See [Accounts & HD](../concepts/accounts-and-hd.md).

When creating a new index, `derive` refuses a wallet containing an unsupported stored TRON derivation with `legacy_derivation`. A stored address that does not match the seed fails with `derivation_mismatch`.

If `--index` selects an existing slot, no new key is derived. A verified account is made active and returns `status: "existing"`; an address that does not match the seed fails with `derivation_mismatch` before the active account changes. See the [4.13.1 release notes](https://github.com/tronprotocol/wallet-cli/releases/tag/wallet-cli-4.13.1) for `legacy_derivation` migration steps.

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

```bash
printf '%s' "$PW" | wallet-cli derive --seed-id wlt_vy5n6qhh --password-stdin
```

```console
✅ Derived sub-account "main-1"
  Account ID    wlt_vy5n6qhh.1
  Index         1
  TRON address  TKpmAZmDcGhJBugwAhbJ1ubWeTM4VZgRbK
  EVM address   0x7Fee0863cB70a3C7c937A292220dD0C52E2526e0
  Active        yes
  Note          shares master mnemonic; no separate backup needed
```

```bash
printf '%s' "$PW" | wallet-cli derive --seed-id wlt_vy5n6qhh --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"derive","data":{"status":"created","accountId":"wlt_vy5n6qhh.1","label":"main-1","type":"seed","index":1,"active":true,"addresses":{"tron":"TKpmAZmDcGhJBugwAhbJ1ubWeTM4VZgRbK","evm":"0x7Fee0863cB70a3C7c937A292220dD0C52E2526e0"},"seedId":"wlt_vy5n6qhh","derivationPath":{"tron":"m/44'/195'/0'/0/1","evm":"m/44'/60'/0'/0/1"}},"meta":{"durationMs":980,"warnings":[]}}
```

## Output

`data` is the newly derived account (always an HD `seed` account). Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `status` | string | `"created"` for a newly derived index, `"existing"` when `--index` names an index this wallet already holds — that account is simply made active again, and no new key is derived |
| `accountId` | string | Stable id `<seedId>.<index>` |
| `label` | string | Account label (default `<wallet-name>-<index>`, e.g. `main-1`) |
| `type` | string | Always `"seed"` |
| `index` | number | HD derivation index |
| `active` | boolean | Always `true` (the new account is made active) |
| `addresses` | object | One address per family the account can produce: `tron` (base58) and `evm` (`0x`, EIP-55 checksummed) |
| `derivationPath` | object | The verified BIP44 path each address came from. A newly created account reports `m/44'/<coin>'/0'/0/<index>` for both families; `--index` naming an existing account reports that account's actual current or legacy path |
| `seedId` | string | Owning seed wallet id |

## Exit status

`0` success · `1` execution failure, including `legacy_derivation` and `derivation_mismatch` (see Notes) · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[`create`](create.md) · [`list`](list.md)
