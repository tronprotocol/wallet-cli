# wallet-cli block

Get a block (latest if omitted).

## Synopsis

```
wallet-cli block [<number>] [options]
```

## Arguments

- `number` — block height to fetch; omit for the latest block

## Options

[Global options](index.md) only.

## Notes

Requires `--network` (or config.defaultNetwork).

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[Networks](../concepts/networks.md)
