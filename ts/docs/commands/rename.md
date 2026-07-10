# wallet-cli rename

Rename an account label.

## Synopsis

```
wallet-cli rename <account> --label <new> [options]
```

## Arguments

- `account` — accountId, current label, or address to rename

## Options

| Option | Description |
|---|---|
| `--label <string>` | new unique label, 1-64 chars  [required] |

Plus [global options](index.md).

## Notes

The stable handle is always the `accountId`; only the label changes.

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[`list`](list.md) · [`use`](use.md)
