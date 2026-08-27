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
wallet-cli list --network tron:nile
```

```console
warning: 1 account(s) have no tron address and are not shown; use --network to switch, or --output json to see every family
HD  wlt_z259a1hq
└─ [0] main           TE9kPMtaMjfZN95CuPRsCHUQGWwx9EcJW8

watch-only
├─ watch-test         THdUXD3mZqT5aMnPQMtBSJX9ANGjaeUwQK
└─ wallet_769028      TJBy2jgV1CAZtqyTQH8CMseqZr6fBwxHSd
```

The same accounts under an EVM network — the seed account reappears under its EVM address, and the TRON-only watch-only entries drop out:

```bash
wallet-cli list --network evm:11155111
```

```console
warning: 2 account(s) have no evm address and are not shown; use --network to switch, or --output json to see every family
HD  wlt_z259a1hq
└─ [0] main           0x7B28FE10FBccE88c3967ff0Fd64f1ffB46b46C9C
```

HD accounts are grouped by seed and carry an `[index]`; non-HD entries (private key / watch-only / Ledger) are grouped by type and have no `[index]`.

```bash
wallet-cli list -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"list","data":[{"accountId":"wlt_z259a1hq.0","label":"main","type":"seed","index":0,"active":false,"addresses":{"tron":"TE9kPMtaMjfZN95CuPRsCHUQGWwx9EcJW8","evm":"0x7B28FE10FBccE88c3967ff0Fd64f1ffB46b46C9C"},"seedId":"wlt_z259a1hq","derivationPath":{"tron":"m/44'/195'/0'/0/0","evm":"m/44'/60'/0'/0/0"}},{"accountId":"wlt_whxjk6na","label":"watch-test","type":"watch","index":null,"active":false,"addresses":{"tron":"THdUXD3mZqT5aMnPQMtBSJX9ANGjaeUwQK"},"family":"tron","derivationPath":null},{"accountId":"wlt_n5v4r992","label":"watch_evm","type":"watch","index":null,"active":true,"addresses":{"evm":"0xe4aAd11792F7E74f1B5cbce65f9a1E207c952961"},"family":"evm","derivationPath":null}],"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:mainnet","chainId":"mainnet"}}
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
| `derivationPath` | object \| null | Per-family BIP32 path for `seed` accounts (`{"tron":"m/44'/195'/0'/0/0","evm":"m/44'/60'/0'/0/0"}`); `null` for accounts that were not derived |
| `seedId` | string | Owning seed wallet id (`seed` accounts only) |
| `family` | string | Chain family this account is bound to — present only on single-family accounts (`watch`, `ledger`) |

The `chain` block echoes the network that was selected for display; the command itself contacts no node.

## Exit status

`0` · `2` usage error. See [machine-interface](../machine-interface.md#exit-codes).

## See also

`use` · `current` · [`create`](create.md) · [`account balance`](account/balance.md)
