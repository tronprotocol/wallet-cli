# Networks

wallet-cli addresses networks by **canonical id** — `family:chain`:

```console
$ wallet-cli networks -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"networks","data":[
  {"id":"tron:mainnet","family":"tron","chainId":"mainnet","feeModel":"tron-resource"},
  {"id":"tron:nile","family":"tron","chainId":"nile","feeModel":"tron-resource"},
  {"id":"tron:shasta","family":"tron","chainId":"shasta","feeModel":"tron-resource"}],
 "meta":{"durationMs":16,"warnings":[]}}
```

| Id | What it is | TRX value |
|---|---|---|
| `tron:mainnet` | Production TRON | **Real money** |
| `tron:nile` | Primary testnet; faucet at nileex.io | none — use freely |
| `tron:shasta` | Alternative testnet | none |

## How a command picks its network

1. Explicit `--network <id>` on the command;
2. otherwise `config.defaultNetwork` (`wallet-cli config defaultNetwork tron:nile`);
3. chain commands with neither will tell you a network is required.

Your **address is the same on every network**, but balances, tokens, and transactions are entirely separate per network. A txid from Nile does not exist on mainnet — querying it there returns `not_found`/`rpc_error`.

## Fees: the `tron-resource` model

TRON does not charge gas the way EVM chains do. Transactions consume **bandwidth** (bytes) and, for smart-contract calls, **energy**; shortfalls are covered by burning TRX, and staking TRX earns a continuous quota. Full model, the staking commands, and the unstake waiting period: [Energy & bandwidth](energy-bandwidth.md).

Units: **1 TRX = 1,000,000 SUN**. JSON payloads carry raw SUN as strings (`"balance": "1976489000"` = 1976.489 TRX); text output shows human TRX.

## See also

- [`account info`](../commands/account/info.md) — shows your current bandwidth/energy usage and limits
- [Getting started](../guide/getting-started.md) — funding an account on Nile
