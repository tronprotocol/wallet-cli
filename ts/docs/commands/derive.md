# wallet-cli derive

Derive the next HD account from a seed wallet (by --seed-id).

## Synopsis

```
wallet-cli derive --seed-id <wlt_…> [--index <n>] [--label <l>] [options]
```

## Options

| Option | Description |
|---|---|
| `--seed-id <string>` | seed id (wlt_…) of the HD wallet to derive from — the HD group header in `list`  [required] |
| `--index <number>` | explicit HD account index; omit to use the next free index |
| `--label <string>` | label for the new account, 1-64 chars; omit to auto-generate |
| `--password-stdin` | read the master password from stdin (fd 0) |

Plus [global options](index.md).

## Notes

Private-key and Ledger accounts have no seed and cannot derive. See [Accounts & HD](../concepts/accounts-and-hd.md).

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[`create`](create.md) · [`list`](list.md)
