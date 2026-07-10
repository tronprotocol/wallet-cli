# wallet-cli import watch

Register a watch-only address (no secret).

## Synopsis

```
wallet-cli import watch --address <T…> [--label <l>] [options]
```

## Options

| Option | Description |
|---|---|
| `--address <string>` | watch-only address to track; TRON base58 T…; family auto-detected  [required] |
| `--label <string>` | unique account label, 1-64 chars |

Plus [global options](../index.md).

## Notes

Cannot sign — queries only. Useful for monitoring cold-storage balances.

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../../machine-interface.md).

## See also

[`import ledger`](ledger.md) · [`account balance`](../account/balance.md)
