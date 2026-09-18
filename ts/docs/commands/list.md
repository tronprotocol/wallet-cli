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

An account stored in a wallet format this build does not recognise — a registry written by a newer wallet-cli — is **skipped rather than fatal**: the listing still shows every account it can read, and a warning names the wallet ids it left out (`… use a wallet format this version does not understand and were skipped: wlt_… . Upgrade wallet-cli to use them.`). Naming such an account on any other command is a hard `encoding_error` (exit 1), raised before the operation starts.

## Options

Only the [global options](index.md#global-options-every-command).

## Examples

```bash
wallet-cli list --network nile
```

```console
warning: 1 account(s) have no tron address and are not shown; use --network to switch, or --output json to see every family
HD  wlt_kwyjcwdh
├─ [0] main    TEKbsrcsL74XyNWH6ju9zfjGDNok78dtTa
├─ [1] main-1  TVz38F2QmQf53g7QVATBbsZ6JkHKccJFAQ
└─ [2] main-2  TA6CYVzW9rskb54mv4mwMM7tu42ZXvfpnz  (active)

watch-only
└─ cold        TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
```

HD accounts are grouped by seed and carry an `[index]`; non-HD entries (private key / watch-only / Ledger) are grouped by type. Text shows one family at a time: the EVM-only watch account `cold-evm` is left out on Nile, as the warning says, and appears under an EVM network such as `--network sepolia`.

```bash
wallet-cli list -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"list","data":[{"accountId":"wlt_kwyjcwdh.0","label":"main","type":"seed","index":0,"active":false,"addresses":{"tron":"TEKbsrcsL74XyNWH6ju9zfjGDNok78dtTa","evm":"0xeb0a0D15e3B8f6E2FC4bc011Eb6644f1ce3E4fa2"},"seedId":"wlt_kwyjcwdh","derivationPath":null},{"accountId":"wlt_kwyjcwdh.1","label":"main-1","type":"seed","index":1,"active":false,"addresses":{"tron":"TVz38F2QmQf53g7QVATBbsZ6JkHKccJFAQ","evm":"0xEA4A61822322c695F5A9eB7920b843054CbDaA83"},"seedId":"wlt_kwyjcwdh","derivationPath":null},{"accountId":"wlt_kwyjcwdh.2","label":"main-2","type":"seed","index":2,"active":true,"addresses":{"tron":"TA6CYVzW9rskb54mv4mwMM7tu42ZXvfpnz","evm":"0xbdFFbe9F40522E2DB8B32692E9fB0d2b63D83304"},"seedId":"wlt_kwyjcwdh","derivationPath":null},{"accountId":"wlt_h10w1nm0","label":"cold","type":"watch","index":null,"active":false,"addresses":{"tron":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ"},"family":"tron","derivationPath":null},{"accountId":"wlt_x771mz6t","label":"cold-evm","type":"watch","index":null,"active":false,"addresses":{"evm":"0x742d35Cc6634C0532925a3b844Bc454e4438f44e"},"family":"evm","derivationPath":null}],"meta":{"durationMs":16,"warnings":[]},"chain":{"family":"tron","network":"tron:728126428","chainId":"728126428"}}
```

JSON lists every account with all of its addresses, whatever the network.

## Output

`data` is an array; one entry per account:

| Field            | Type           | Meaning                                                                                               |
| ---------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| `accountId`      | string         | Stable id; `<seedId>.<index>` for HD accounts, a standalone `wlt_…` for non-HD                        |
| `label`          | string         | Human label (rename with `rename`)                                                                    |
| `type`           | string         | `seed` (HD), `privateKey`, `watch`, `ledger`                                                          |
| `index`          | number \| null | HD derivation index within the seed; `null` for non-HD accounts                                       |
| `active`         | boolean        | Whether this is the account commands default to                                                       |
| `addresses`      | object         | One entry per family the account can produce: `tron` (base58) and/or `evm` (`0x`, EIP-55 checksummed) |
| `seedId`         | string         | Owning seed wallet id (`seed` accounts only)                                                          |
| `derivationPath` | null | Always `null`, deliberately — `list` takes no master password, so it cannot tell an old TRON path from a current one without opening the seed; `derive` and `backup` report verified paths |
| `family`         | string         | Chain family this account is bound to — present only on single-family accounts (`watch`, `ledger`)    |
| `path`           | string         | The account's derivation path on the device (`ledger` accounts only)                                  |

The `chain` block echoes the network that was selected for display; the command itself contacts no node.

## Exit status

`0` · `2` usage error. See [machine-interface](../machine-interface.md#exit-codes).

## See also

`use` · `current` · [`create`](create.md) · [`account balance`](account/balance.md)
