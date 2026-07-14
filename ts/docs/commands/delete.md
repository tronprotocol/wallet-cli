# wallet-cli delete

Delete a wallet/account and clean orphan labels.

## Synopsis

```
wallet-cli delete <account> [--yes] [options]
```

## Arguments

- `account` — account or wallet to delete, by accountId, label, or address

## Options

| Option | Description |
|---|---|
| `--yes` | skip the interactive confirmation; required for non-TTY deletion |

Plus [global options](index.md).

## Notes

Deleting an HD wallet cascades from the seed root — all derived accounts go with it. On-chain assets are untouched; re-import the mnemonic to regain access. Back up first. Metadata-only — no master password needed.

## Examples

Without `--yes`, deletion prompts for confirmation — you must type the account label exactly:

```bash
wallet-cli delete solo
```

```console
? Delete solo? Type the exact label "solo" to confirm: solo
✅ Deleted wallet wlt_p7cg790g
  Secret removed  yes
```

Deleting an HD root cascades to the whole wallet (all derived accounts + keys):

```bash
wallet-cli delete main --yes
```

```console
✅ Deleted wallet wlt_teh9fafq
  Secret removed  yes
```

Deleting a single HD sub-account removes only that account, keeping the seed key (you can `derive` again); the JSON shows the deletion scope, whether the key was removed too, and the account active afterwards:

```bash
wallet-cli delete main-1 --yes -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"delete","data":{"accountId":"wlt_teh9fafq.1","scope":"account","secretRemoved":false,"newActive":"wlt_teh9fafq.0"},"meta":{"durationMs":14,"warnings":[]}}
```

## Output

`data` describes the deletion result. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `accountId` | string | Id of the deleted account/wallet (`wlt_….N` for a sub-account, the wallet id `wlt_…` for a wallet) |
| `scope` | string | `account` (only that account) or `wallet` (cascaded whole wallet) |
| `secretRemoved` | boolean | Whether the key was removed (deleting an HD sub-account keeps the seed = `false`; deleting a wallet = `true`) |
| `newActive` | string \| null | New active account id after deletion; `null` if none remain |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[`backup`](backup.md) · [Accounts & HD](../concepts/accounts-and-hd.md)
