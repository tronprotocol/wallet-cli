# wallet-cli use

Set the active account.

## Synopsis

```
wallet-cli use <account> [options]
```

## Arguments

- `account` — accountId, label, or address to make active

## Options

[Global options](index.md) only.

## Examples

```bash
wallet-cli use main-1
```

```console
✅ Active account: main-1
  TRON address  TVz38F2QmQf53g7QVATBbsZ6JkHKccJFAQ
  EVM address   0xEA4A61822322c695F5A9eB7920b843054CbDaA83
```

You can also select by accountId or address: `wallet-cli use wlt_kwyjcwdh.1` / `wallet-cli use TVz38F…`.

```bash
wallet-cli use main-1 -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"use","data":{"previous":"wlt_kwyjcwdh.2","accountId":"wlt_kwyjcwdh.1","label":"main-1","type":"seed","index":1,"active":true,"addresses":{"tron":"TVz38F2QmQf53g7QVATBbsZ6JkHKccJFAQ","evm":"0xEA4A61822322c695F5A9eB7920b843054CbDaA83"},"seedId":"wlt_kwyjcwdh","derivationPath":null},"meta":{"durationMs":27,"warnings":[]}}
```

## Output

`data` is the account switched to, plus `previous` (the account that was active before). Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `previous` | string | Account id that was active before |
| `accountId` | string | Now-active account id |
| `label` | string | Account label |
| `type` | string | `seed` / `privateKey` / `watch` / `ledger` |
| `index` | number \| null | HD derivation index; `null` for non-HD accounts |
| `active` | boolean | Always `true` (just made active) |
| `addresses` | object | One entry per family the account can produce: `tron` (base58) and/or `evm` (`0x`, EIP-55 checksummed) |
| `seedId` | string | Owning seed wallet id (`seed` accounts only) |
| `derivationPath` | null | Always `null`, deliberately — `use` takes no master password, so it cannot tell an old TRON path from a current one without opening the seed; `derive` and `backup` report verified paths |
| `family` | string | Chain family this account is bound to — single-family accounts (`watch`, `ledger`) only |
| `path` | string | The account's derivation path on the device (`ledger` accounts only) |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[`current`](current.md) · [`list`](list.md)
