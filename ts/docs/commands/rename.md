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

The stable handle is always the `accountId`; only the label changes. Metadata-only — no master password needed.

## Examples

```bash
wallet-cli rename main --label primary
```

```console
✅ Renamed account
  Old label  main
  New label  primary
```

```bash
wallet-cli rename main-1 --label hot-hd -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"rename","data":{"previousLabel":"main-1","accountId":"wlt_0y2z0gvr.1","label":"hot-hd","type":"seed","index":1,"active":true,"addresses":{"tron":"TRzaAZWRvPCcmqNETTWvmMLDi6cKwM3gbR"},"seedId":"wlt_0y2z0gvr"},"meta":{"durationMs":14,"warnings":[]}}
```

## Output

`data` is the renamed account, plus `previousLabel`. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `previousLabel` | string | The old label before renaming |
| `accountId` | string | Stable account id (unchanged by rename) |
| `label` | string | The new label |
| `type` | string | `seed` / `privateKey` / `watch` / `ledger` |
| `index` | number \| null | HD derivation index; `null` for non-HD accounts |
| `active` | boolean | Whether it is the active account |
| `addresses.tron` | string | Base58 TRON address |
| `seedId` | string | Owning seed wallet id (`seed` accounts only) |
| `family` | string | Chain family, e.g. `tron` (`watch` accounts only) |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[`list`](list.md) · [`use`](use.md)
