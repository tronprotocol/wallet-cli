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

Deleting an HD wallet cascades from the seed root — all derived accounts go with it. On-chain assets are untouched. Run [`backup`](backup.md) first and act on any warning it prints. Metadata-only — no master password needed.

**Deleting from an HD wallet that has TRON sub-accounts** (index 1 or higher) always prints a warning, before the confirmation. `delete` cannot tell, without the password, which derivation path created those addresses; if they came from an older version, re-importing the mnemonic will not recreate them. Back up and verify their keys first — see [Recover addresses after `legacy_derivation`](../troubleshooting/legacy-derivation-recovery.md). The warning does not stop the deletion.

## Examples

Deleting an HD sub-account removes only that account and keeps the seed, so you can `derive` it again. Because the wallet has TRON sub-accounts, the legacy-derivation warning is printed first:

```bash
wallet-cli delete main-2 --yes
```

```console
warning: This HD wallet contains TRON sub-accounts. If created with an older derivation path, default mnemonic recovery may not recreate them. Back up and verify their keys before deleting. https://github.com/tronprotocol/wallet-cli/blob/wallet-cli-4.13.1/ts/docs/troubleshooting/legacy-derivation-recovery.md
✅ Deleted account wlt_kwyjcwdh.2
  Secret removed  no
  New active      wlt_kwyjcwdh.0
```

```bash
wallet-cli delete main-2 --yes -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"delete","data":{"accountId":"wlt_kwyjcwdh.2","scope":"account","secretRemoved":false,"newActive":"wlt_kwyjcwdh.0"},"meta":{"durationMs":26,"warnings":["This HD wallet contains TRON sub-accounts. If created with an older derivation path, default mnemonic recovery may not recreate them. Back up and verify their keys before deleting. https://github.com/tronprotocol/wallet-cli/blob/wallet-cli-4.13.1/ts/docs/troubleshooting/legacy-derivation-recovery.md"]}}
```

Deleting the wallet's root account removes the whole wallet — every derived account and the seed:

```bash
wallet-cli delete main --yes
```

```console
warning: This HD wallet contains TRON sub-accounts. If created with an older derivation path, default mnemonic recovery may not recreate them. Back up and verify their keys before deleting. https://github.com/tronprotocol/wallet-cli/blob/wallet-cli-4.13.1/ts/docs/troubleshooting/legacy-derivation-recovery.md
✅ Deleted wallet wlt_kwyjcwdh
  Secret removed  yes
  New active      wlt_h10w1nm0
```

```bash
wallet-cli delete main --yes -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"delete","data":{"accountId":"wlt_kwyjcwdh","scope":"wallet","secretRemoved":true,"newActive":"wlt_h10w1nm0"},"meta":{"durationMs":53,"warnings":["This HD wallet contains TRON sub-accounts. If created with an older derivation path, default mnemonic recovery may not recreate them. Back up and verify their keys before deleting. https://github.com/tronprotocol/wallet-cli/blob/wallet-cli-4.13.1/ts/docs/troubleshooting/legacy-derivation-recovery.md"]}}
```

Without `--yes`, the command asks you to type the account's label to confirm, and needs an interactive terminal.

## Output

`data` describes the deletion result. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `accountId` | string | Id of the deleted account/wallet (`wlt_….N` for a sub-account, the wallet id `wlt_…` for a wallet) |
| `scope` | string | `account` (only that account) or `wallet` (cascaded whole wallet) |
| `secretRemoved` | boolean | Whether encrypted secret material was removed. Deleting an HD sub-account keeps the seed, so `false`. Deleting a wallet reports whether that wallet held a secret at all: `true` for seed and private-key wallets, `false` for Ledger and watch-only ones, which never stored one |
| `newActive` | string \| null | New active account id after deletion; `null` if none remain |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[`backup`](backup.md) · [Accounts & HD](../concepts/accounts-and-hd.md)
