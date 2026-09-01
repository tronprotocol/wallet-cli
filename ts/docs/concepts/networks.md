# Networks

wallet-cli addresses networks by **canonical id**, which is a [CAIP-2](https://chainagnostic.org/CAIPs/caip-2) `namespace:reference`. The namespace is not the family: `eip155` is CAIP-2's namespace for EVM chains, while the family this CLI branches on is `evm`. Every network belongs to one of two chain **families**, `tron` or `evm`:

```bash
wallet-cli networks
```

```console
| Network         | Alias       | Family | Chain id   | Fee model     | Endpoint                            |
| --------------- | ----------- | ------ | ---------- | ------------- | ----------------------------------- |
| tron:728126428  | tron        | tron   | 728126428  | tron-resource | api.trongrid.io                     |
| tron:3448148188 | nile        | tron   | 3448148188 | tron-resource | nile.trongrid.io                    |
| tron:2494104990 | shasta      | tron   | 2494104990 | tron-resource | api.shasta.trongrid.io              |
| eip155:1        | ethereum    | evm    | 1          | evm-gas       | ethereum-rpc.publicnode.com         |
| eip155:11155111 | sepolia     | evm    | 11155111   | evm-gas       | ethereum-sepolia-rpc.publicnode.com |
| eip155:56       | bsc         | evm    | 56         | evm-gas       | bsc-dataseed.bnbchain.org           |
| eip155:97       | bsc-testnet | evm    | 97         | evm-gas       | bsc-testnet-dataseed.bnbchain.org   |
```

| Id | Alias | What it is | Native coin value |
|---|---|---|---|
| `tron:728126428` | `tron` | Production TRON | **Real money** |
| `tron:3448148188` | `nile` | Primary TRON testnet; faucet at nileex.io | none — use freely |
| `tron:2494104990` | `shasta` | Alternative TRON testnet | none |
| `eip155:1` | `ethereum` | Ethereum mainnet | **Real money** |
| `eip155:11155111` | `sepolia` | Ethereum test network | none |
| `eip155:56` | `bsc` | BNB Smart Chain | **Real money** |
| `eip155:97` | `bsc-testnet` | BNB Smart Chain test network | none |

An **alias** is a short name you may type instead of the id. It resolves once, at selection, and nothing downstream ever sees it — `chain.network` in the JSON envelope always reports the canonical id. Aliases live in config and can be re-pointed, so scripts should pass canonical ids.

For every built-in network the **chain id** is the canonical id's second segment, for both families. It is a separate field rather than a derived one: a network you add in `config.yaml` supplies its own `chainId`, and nothing checks that the two agree. On EVM it is the EIP-155 number every signature commits to (`56`); on TRON it is the decimal genesis-hash prefix (`3448148188`), which nothing but the display layer reads. The readable name for a TRON network lives in its alias (`nile`), not in this field.

Point a network at your own node, or at a commercial endpoint, with [`config`](../commands/config.md):

```bash
wallet-cli config networks.tron:3448148188.httpEndpoint http://127.0.0.1:8090
wallet-cli config networks.tron:728126428.apiKeyHeader TRON-PRO-API-KEY
wallet-cli config networks.tron:728126428.apiKey <your-key>
```

Listings (`networks`, `config`) print an endpoint's **host only**, because a commercial URL can carry a key in its path; a named read (`config networks.<id>.httpEndpoint`) gives the full value.

## How a command picks its network

1. Explicit `--network <id|alias>` on the command;
2. otherwise `config.defaultNetwork` (`wallet-cli config defaultNetwork tron:3448148188`);
3. if the config file does not override it, the built-in default is `tron:728126428` (TRON mainnet).

Omitting `--network` therefore does not stop a chain command. For operations involving funds, pass the canonical network id explicitly so the destination chain is visible in shell history and audit logs.

Balances, tokens, and transactions are entirely separate per network. A txid from Nile does not exist on mainnet — querying it there returns `not_found`/`rpc_error`.

## The family decides what runs, and under which address

Your TRON address is the same on every TRON network, and your EVM address the same on every EVM one — but they are **two different addresses derived from the same key**, at BIP44 coin types 195 and 60. So the selected network chooses which of your account's addresses a command acts as. See [Accounts and HD wallets](accounts-and-hd.md).

The family also decides which commands exist. TRON protocol features — staking, SR voting, TRC10, the Bancor exchange, on-chain permissions, GasFree — have no EVM counterpart, and those commands fail on an EVM network with `family_mismatch` before any node call. Family-scoped **flags** behave the same way, failing with `invalid_option`. The [command reference](../commands/index.md#which-commands-run-on-which-networks) lists which is which.

## Fees: the `tron-resource` model

TRON does not charge gas the way EVM chains do. Transactions consume **bandwidth** (bytes) and, for smart-contract calls, **energy**; shortfalls are covered by burning TRX, and staking TRX earns a continuous quota. Full model, the staking commands, and the unstake waiting period: [Energy & bandwidth](energy-bandwidth.md).

Units: **1 TRX = 1,000,000 SUN**. JSON payloads carry raw SUN — as decimal strings for int64-sized amounts (`"balance": "1976489000"` = 1976.489 TRX), and sometimes as JSON numbers for bounded fees and counters (`feeSun`, `energyUsed`, `netUsed`); text output shows human TRX.

The `--fee-limit` flag caps the TRX an energy-hungry call may burn, in SUN.

## Fees: the `evm-gas` model

An EVM transaction buys **gas**: a gas limit (how many units it may consume) multiplied by a price per unit. On an EIP-1559 chain the price is a base fee set by the network plus a priority fee (tip); on a legacy chain it is a single `gasPrice`. `chain prices` reports whichever applies.

wallet-cli fills all of it in from the node unless you say otherwise: the gas limit from `eth_estimateGas` (unpadded), the fee ceiling from the current base fee, and the nonce from the account's pending count. Override any of them with `--gas-limit`, `--max-fee`, `--priority-fee`, `--nonce`. A fee that is signable but questionable — a tip clamped to the ceiling, a ceiling below the current base fee — is reported in `meta.warnings` rather than refused.

Units: **1 coin = 10^18 wei**, and `--max-fee` / `--priority-fee` are given in **gwei** (`25` or `25gwei`). JSON payloads carry raw wei as strings.

The coin itself is a **network** fact, not a family one: `eip155:1` pays in ETH and `eip155:56` in BNB. The base unit and its 18 decimals are shared; the symbol is not.

## See also

- [`networks`](../commands/networks.md) — the list above, and its JSON form
- [`chain prices`](../commands/chain/prices.md) — what a transaction costs right now, in either model
- [`account info`](../commands/account/info.md) — current bandwidth/energy usage on TRON, nonce and code on EVM
- [Getting started](../guide/getting-started.md) — funding an account on Nile
