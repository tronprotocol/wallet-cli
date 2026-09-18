# wallet-cli bai

Check B.AI credits and usage, and recharge a B.AI account with stablecoins.

## Synopsis

```
wallet-cli bai COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `bai usage-summary` | [usage-summary.md](usage-summary.md) | Credit balance, current-month spend, and monthly trend |
| `bai usage-records` | [usage-records.md](usage-records.md) | Individual usage records |
| `bai recharge-orders` | [recharge-orders.md](recharge-orders.md) | Recharge orders |
| `bai recharge` | [recharge.md](recharge.md) | Recharge your own or another B.AI account |
| `bai report-recharge` | [report-recharge.md](report-recharge.md) | Report an existing recharge transaction again, without paying |

## The API key

Every command needs your personal B.AI API key. Store it once with [`config`](../config.md), which reads the key from stdin — here from the `$BAI_KEY` environment variable:

```bash
printf '%s\n' "$BAI_KEY" | wallet-cli config baiApiKey --api-key-stdin --account main --network tron
```

Before saving, the CLI asks B.AI whether the selected account's address on that network is already bound to the key's B.AI account. The network must be `tron`, `bsc`, or `base` mainnet (`unsupported_network_capability` otherwise). The CLI only checks the binding and does not create it: bind the wallet address to your B.AI account first. A rejected key fails with `bai_auth_failed`; an address that is not bound fails with `invalid_value`; in both cases the key is not saved.

The confirmation is also what lets [`bai recharge`](recharge.md) pay from that account on that network. To pay from another account or network, store the key again with that `--account` / `--network`.

Without a stored key every `bai` command stops with `bai_credentials_missing` (exit 2).

## How recharging works

1. Optionally, `bai recharge --dry-run` previews the recharge: it runs the same checks (except the master password) and shows what would be paid, without creating an order or signing.
2. `bai recharge` checks the amount, network, token, payer binding, recipient and master password first — any failure stops it with no order and no payment. It then creates an order, pays it with an x402 payment from your account, and reports the transaction to B.AI.
3. B.AI confirms and adds the credits: `creditStatus: "credited"`.
4. If B.AI cannot confirm in time, the command still succeeds with `creditStatus: "unconfirmed"` and the transaction hash. **The payment went through — do not recharge again.** Run [`bai report-recharge`](report-recharge.md) with that hash instead.

## See also

[`x402`](../x402/index.md) · [`config`](../config.md) · [x402 and B.AI payment details](../../machine-interface.md#x402-and-bai-payment-details)
