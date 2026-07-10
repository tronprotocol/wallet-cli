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

Deleting an HD wallet cascades from the seed root — all derived accounts go with it. On-chain assets are untouched; re-import the mnemonic to regain access. Back up first.

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[`backup`](backup.md) · [Accounts & HD](../concepts/accounts-and-hd.md)
