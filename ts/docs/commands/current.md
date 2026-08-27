# wallet-cli current

Show the current (active) account.

## Synopsis

```
wallet-cli current [options]
```

## Options

| Option | Description |
|---|---|
| `--qr` | Also render the receive address for the selected network as a scannable QR code in the terminal, with the full address printed above it for manual verification; text output only |

Plus the [global options](index.md) (`--account` overrides which account is shown).

An account carries one address per chain family, and the text output lists every address it has. `--network` selects which one `--qr` encodes; it does not filter the listing, and no node is contacted.

## Examples

```bash
wallet-cli current
```

```console
Active account: main
  TRON address  TE9kPMtaMjfZN95CuPRsCHUQGWwx9EcJW8
  EVM address   0x7B28FE10FBccE88c3967ff0Fd64f1ffB46b46C9C
```

With `--account`, the header reads `Selected account:` instead of `Active account:`.

Add `--qr` to also render the active account's address as a scannable receive QR code, drawn with block characters below the address. Purely local — the address comes from local keystore metadata, no node access:

```bash
wallet-cli current --qr
```

```console
Active account: main
  TRON address  TE9kPMtaMjfZN95CuPRsCHUQGWwx9EcJW8
  EVM address   0x7B28FE10FBccE88c3967ff0Fd64f1ffB46b46C9C

  [ scannable QR code of the TRON address, drawn in the terminal ]
```

The QR encodes **one** address — the receive address for the selected network. Pass `--network` to choose which:

```bash
wallet-cli current --qr --network evm:11155111
```

The QR is a terminal rendering only and scans from a real terminal (where the block characters line up); `-o json` is unchanged by `--qr` (machine consumers take the address and generate their own code). If the terminal is non-interactive or too narrow to fit it, it degrades to printing the addresses with a warning:

```console
warning: terminal is non-interactive or too narrow for a complete QR code; showing the full address only
```

```bash
wallet-cli current -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"current","data":{"accountId":"wlt_z259a1hq.0","label":"main","type":"seed","index":0,"active":true,"addresses":{"tron":"TE9kPMtaMjfZN95CuPRsCHUQGWwx9EcJW8","evm":"0x7B28FE10FBccE88c3967ff0Fd64f1ffB46b46C9C"},"seedId":"wlt_z259a1hq","derivationPath":{"tron":"m/44'/195'/0'/0/0","evm":"m/44'/60'/0'/0/0"}},"meta":{"durationMs":14,"warnings":[]},"chain":{"family":"tron","network":"tron:mainnet","chainId":"mainnet"}}
```

With no active account yet, it fails with `missing_wallet_address` (exit 1):

```bash
wallet-cli current
```

```console
error [missing_wallet_address]: no active account; import one first
```

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
| `derivationPath` | object \| null | Per-family BIP32 path for `seed` accounts; `null` otherwise |
| `seedId` | string | Owning seed wallet id (`seed` accounts only) |
| `family` | string | Chain family this account is bound to — single-family accounts (`watch`, `ledger`) only |

The `chain` block echoes the network selected for display; the command contacts no node.

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[`use`](use.md) · [`list`](list.md)
