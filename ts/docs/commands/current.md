# wallet-cli current

Show the current (active) account.

## Synopsis

```
wallet-cli current [options]
```

## Options

| Option | Description |
|---|---|
| `--qr` | Also render the receive address for the selected network as a scannable QR code in the terminal, with the full address printed below it for manual verification; text output only |

Plus the [global options](index.md) (`--account` overrides which account is shown).

## Description

An account carries one address per chain family, and the text output lists every address it has. `--network` selects which one `--qr` encodes; it does not filter the listing, and no node is contacted.

## Examples

```bash
wallet-cli current
```

```console
Active account: main-1
  TRON address  TVz38F2QmQf53g7QVATBbsZ6JkHKccJFAQ
  EVM address   0xEA4A61822322c695F5A9eB7920b843054CbDaA83
```

```bash
wallet-cli current -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"current","data":{"accountId":"wlt_kwyjcwdh.1","label":"main-1","type":"seed","index":1,"active":true,"addresses":{"tron":"TVz38F2QmQf53g7QVATBbsZ6JkHKccJFAQ","evm":"0xEA4A61822322c695F5A9eB7920b843054CbDaA83"},"seedId":"wlt_kwyjcwdh","derivationPath":null},"meta":{"durationMs":18,"warnings":[]},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

Add `--qr` to also draw the receive address of the selected network as a QR code, followed by a `Receive address` line; `--network sepolia` picks the EVM address:

```bash
wallet-cli current --qr
```

```console
Active account: main-1
  TRON address  TVz38F2QmQf53g7QVATBbsZ6JkHKccJFAQ
  EVM address   0xEA4A61822322c695F5A9eB7920b843054CbDaA83

[ QR code of the TRON address, drawn with block characters ]

Receive address  TVz38F2QmQf53g7QVATBbsZ6JkHKccJFAQ
```

The QR code needs an interactive terminal wide enough to draw it; otherwise the command prints `warning: terminal is non-interactive or too narrow for a complete QR code; showing the full address only` and shows just the addresses.

## Output

`data` is one account entry, in the same shape [`list`](list.md#output) returns.

| Field | Type | Meaning |
|---|---|---|
| `accountId` | string | Account id |
| `label` | string | Account label |
| `type` | string | `seed` / `privateKey` / `watch` / `ledger` |
| `index` | number \| null | HD derivation index; `null` for non-HD accounts |
| `active` | boolean | `true` for the active account; `false` when `--account` selected a different one |
| `addresses` | object | One entry per family the account can produce: `tron` (base58) and/or `evm` (`0x`, EIP-55 checksummed) |
| `seedId` | string | Owning seed wallet id (`seed` accounts only) |
| `derivationPath` | null | Always `null`, deliberately — `current` takes no master password, so it cannot tell an old TRON path from a current one without opening the seed; `derive` and `backup` report verified paths |
| `receiveAddress` | string | Present in JSON only when `--qr` was given; the address selected by `--network` |
| `family` | string | Chain family this account is bound to — single-family accounts (`watch`, `ledger`) only |
| `path` | string | The account's derivation path on the device (`ledger` accounts only) |

The `chain` block echoes the network selected for display; the command contacts no node.

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[`use`](use.md) · [`list`](list.md)
