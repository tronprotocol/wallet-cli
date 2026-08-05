# wallet-cli — Java implementation

The original, full-featured implementation of wallet-cli: an interactive prompt (REPL) covering the complete TRON feature surface — managing accounts and keystores, TRX / TRC10 / TRC20 transfers, staking resources, voting for super representatives, deploying and calling smart contracts, Ledger hardware signing, and [GasFree](https://gasfree.io) gas-less transfers. All gRPC calls run on the [Trident SDK](https://github.com/tronprotocol/trident).

> For what wallet-cli is and how this compares to the scriptable, JSON-first [TypeScript implementation](../ts/README.md), see the [repository overview](../README.md).

**Quick links:** [Setup](#setup) · [Quickstart](#quickstart) · [Commands](#commands) · [Understanding TRON mechanics](#understanding-tron-mechanics) · [Configuration](docs/reference/config.md)

Need help? Join the [Telegram developer group](https://t.me/TronOfficialDevelopersGroupEn).

## Setup

### Download

```
git clone https://github.com/tronprotocol/wallet-cli.git
```

### Configuration

A minimal `config.conf` only needs a network type and a full node to talk to:

```
net {
  type = mainnet
}

fullnode = {
  ip.list = [
    "fullnode ip : port"
  ]
}
```

You can also switch networks at runtime with the [`SwitchNetwork`](docs/commands/network.md) command, so editing `config.conf` is only needed for a custom node or advanced features. The **full annotated config** — optional Solidity node, Ledger debug, account lock, GasFree, TronGrid API key, TronLink multi-sig, and record limits — and a field-by-field reference are in [docs/reference/config.md](docs/reference/config.md).

### Build and run

- **Connect to fullNode** — see [java-tron deployment](https://tronprotocol.github.io/documentation-en/developers/deployment/). Run a fullNode on either your local PC or a remote server.
- **Compile and run**:

    ```console
    $ cd wallet-cli
    $ ./gradlew build
    $ cd build/libs
    $ java -jar wallet-cli.jar
    ```

wallet-cli connects to java-tron via the gRPC protocol, which can be deployed locally or remotely. Configure the java-tron node IP and port in `src/main/resources/config.conf`, or use `SwitchNetwork` to switch among mainnet, testnets (Nile and Shasta), and custom networks.

## Quickstart

Build, create an account, and send your first transfer — all from the interactive prompt:

```console
# 1. Build
$ git clone https://github.com/tronprotocol/wallet-cli.git
$ cd wallet-cli && ./gradlew build && cd build/libs

# 2. Start the interactive wallet
$ java -jar wallet-cli.jar

# 3. In the wallet prompt: create an account (or ImportWallet), unlock, and inspect it
> RegisterWallet 123456      # create a keystore with password 123456
> Login                      # unlock the account
> GetAddress                 # show your address
> GetBalance                 # TRX balance

# 4. Send 1 TRX (amounts are in SUN; 1 TRX = 1,000,000 SUN)
> SendCoin <toAddress> 1000000
```

> On mainnet these commands move **real funds**. While learning, switch to a testnet with `SwitchNetwork` (Nile or Shasta) and top up from that network's faucet.

The full first-run walkthrough is in the [getting-started guide](docs/guide/getting-started.md); for a worked end-to-end session, see the [command-line operation flow](docs/guide/command-flow.md). All guides are indexed in [docs/guide/](docs/guide/index.md).

## Commands

Every command is documented on a family page under [docs/commands/](docs/commands/index.md). The **[command index](docs/commands/index.md)** has the full A–Z list linking each command to its section; in the wallet, typing any command shows its built-in usage tips.

### Wallets & accounts

| Area | Page |
|---|---|
| Create / import / export / back up wallets, sub-accounts, login, lock, switch | [wallet](docs/commands/wallet.md) |
| Account queries, metadata, backup & transaction records, receive QR | [account](docs/commands/account.md) |
| Switch / show network | [network](docs/commands/network.md) |

### Transfers & tokens

| Area | Page |
|---|---|
| USDT / TRC20 balance & transfers, address book | [usdt](docs/commands/usdt.md) |
| Issue / update / transfer / query TRC10 tokens | [transfer-trc10](docs/commands/transfer-trc10.md) |

### Staking & resources

| Area | Page |
|---|---|
| FreezeV2 staking, delegation, unbonding (Stake 2.0) | [stake-v2](docs/commands/stake-v2.md) |
| Legacy freeze / unfreeze / delegation (Stake 1.0) | [stake-v1-legacy](docs/commands/stake-v1-legacy.md) |
| Resource unit prices & memo fee | [resources](docs/commands/resources.md) |

### Voting, rewards & governance

| Area | Page |
|---|---|
| Vote for SRs, brokerage & rewards, witnesses | [vote-reward](docs/commands/vote-reward.md) |
| Governance proposals | [proposals](docs/commands/proposals.md) |
| On-chain exchange (Bancor) | [exchange](docs/commands/exchange.md) |
| TRON-DEX order market | [dex](docs/commands/dex.md) |
| Multi-signature: permissions, co-signing, TronLink multi-sign | [multisig](docs/commands/multisig.md) |

### Contracts, GasFree & chain data

| Area | Page |
|---|---|
| Deploy, trigger, and inspect smart contracts | [contract](docs/commands/contract.md) |
| GasFree gas-less TRC20 transfers | [gasfree](docs/commands/gasfree.md) |
| Transactions, blocks, chain parameters, encoding utilities | [chain-data](docs/commands/chain-data.md) |

## Understanding TRON mechanics

These are worth understanding up front to avoid surprises (all indexed in [docs/concepts/](docs/concepts/index.md)):

- [Resources: bandwidth, energy & shares](docs/concepts/resources.md) — how freezing produces resources, and how bandwidth is calculated
- [Staking models: Stake 1.0 vs 2.0](docs/concepts/staking-models.md) — the two freeze generations and which commands belong to each
- [Multi-signature concepts](docs/concepts/multisig.md) — permission types, keys, weights, and thresholds
