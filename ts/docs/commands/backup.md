# wallet-cli backup

Export an account's secret + metadata to a 0600 file.

## Synopsis

```
wallet-cli backup <account> [--out <path>] [options]
```

## Arguments

- `account` — account or wallet to export, by accountId, label, or address

## Options

| Option | Description |
|---|---|
| `--out <string>` | output file path; omit to write <root>/backups/<accountId>-<timestamp>.json; mode 0600, never overwritten |
| `--password-stdin` | read the master password from stdin (fd 0) |

Plus [global options](index.md).

## Notes

The file contains recoverable secret material — move it to secure storage and treat it as the key itself. See [Security](../concepts/security.md).

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[Security model](../concepts/security.md) · [`delete`](delete.md)
