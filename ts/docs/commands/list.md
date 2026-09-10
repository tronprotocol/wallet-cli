# wallet-cli list

List wallets/accounts (no unlock needed).

## Synopsis

```
wallet-cli list [options]
```

## Description

Enumerates every locally stored account across all seed wallets and imports: HD accounts are grouped by seed, the rest by type (private key / watch-only / Ledger), marking the active one. Reads only metadata — the master password is not required, and no node is contacted.

An account holds **one address per chain family** it can produce: seed and private-key accounts have both a TRON and an EVM address, while a watch-only or Ledger account is bound to the single family it was registered for.

`--network` here is a **display selector**, not a target: it chooses which family's address the text listing prints. Accounts with no address in that family are omitted, and a warning names how many were left out. JSON output is unfiltered — it always lists every account with every address it has.

## Options

Only the [global options](index.md#global-options-every-command).

## Examples

```bash
wallet-cli list --network tron:3448148188
```

```console
warning: 1 account(s) have no tron address and are not shown; use --network to switch, or --output json to see every family
HD  wlt_hmzp5y4b
├─ [0] main    TSKyFs16wArLhZ8jQnxAbcP7zQevYoXtQe
└─ [1] main-1  TKiSrWgCCYjMPJsVNLFKQ2kSpzhhXzAv4G

watch-only
└─ watch-test  THdUXD3mZqT5aMnPQMtBSJX9ANGjaeUwQK
```

The label column is padded to the longest label **that is actually shown**, so the same accounts line up differently once the filter changes. Under an EVM network the seed account reappears under its EVM address, the TRON-only watch-only entry drops out, and the EVM-only one takes its place:

```bash
wallet-cli list --network eip155:11155111
```

```console
warning: 1 account(s) have no evm address and are not shown; use --network to switch, or --output json to see every family
HD  wlt_hmzp5y4b
├─ [0] main    0xE30cd287565D36d7BA9f1405DbF4Ea56690B5BF1
└─ [1] main-1  0x7733DA595d51e8603A3Bb2450eAC456B0D077B71

watch-only
└─ watch_evm   0xe4aAd11792F7E74f1B5cbce65f9a1E207c952961  (active)
```

HD accounts are grouped by seed and carry an `[index]`; non-HD entries (private key / watch-only / Ledger) are grouped by type and have no `[index]`.

```bash
wallet-cli list -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"list","data":[{"accountId":"wlt_hmzp5y4b.0","label":"main","type":"seed","index":0,"active":false,"addresses":{"tron":"TSKyFs16wArLhZ8jQnxAbcP7zQevYoXtQe","evm":"0xE30cd287565D36d7BA9f1405DbF4Ea56690B5BF1"},"seedId":"wlt_hmzp5y4b","derivationPath":null},{"accountId":"wlt_hmzp5y4b.1","label":"main-1","type":"seed","index":1,"active":false,"addresses":{"tron":"TKiSrWgCCYjMPJsVNLFKQ2kSpzhhXzAv4G","evm":"0x7733DA595d51e8603A3Bb2450eAC456B0D077B71"},"seedId":"wlt_hmzp5y4b","derivationPath":null},{"accountId":"wlt_m8ecsy79","label":"watch-test","type":"watch","index":null,"active":false,"addresses":{"tron":"THdUXD3mZqT5aMnPQMtBSJX9ANGjaeUwQK"},"family":"tron","derivationPath":null},{"accountId":"wlt_sypwt6rc","label":"watch_evm","type":"watch","index":null,"active":true,"addresses":{"evm":"0xe4aAd11792F7E74f1B5cbce65f9a1E207c952961"},"family":"evm","derivationPath":null}],"meta":{"durationMs":18,"warnings":[]},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

## Output

`data` is an array; one entry per account:

| Field | Type | Meaning |
|---|---|---|
| `accountId` | string | Stable id; `<seedId>.<index>` for HD accounts, a standalone `wlt_…` for non-HD |
| `label` | string | Human label (rename with `rename`) |
| `type` | string | `seed` (HD), `privateKey`, `watch`, `ledger` |
| `index` | number \| null | HD derivation index within the seed; `null` for non-HD accounts |
| `active` | boolean | Whether this is the account commands default to |
| `addresses` | object | One entry per family the account can produce: `tron` (base58) and/or `evm` (`0x`, EIP-55 checksummed) |
| `derivationPath` | null | Always `null`; listing does not unlock seeds or provide derivation information. Use `derive` or `backup` when a verified path is required |
| `seedId` | string | Owning seed wallet id (`seed` accounts only) |
| `family` | string | Chain family this account is bound to — present only on single-family accounts (`watch`, `ledger`) |

The `chain` block echoes the network that was selected for display; the command itself contacts no node.

## Exit status

`0` · `2` usage error. See [machine-interface](../machine-interface.md#exit-codes).

## See also

`use` · `current` · [`create`](create.md) · [`account balance`](account/balance.md)
