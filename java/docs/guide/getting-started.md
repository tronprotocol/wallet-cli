# Getting started

The first-run flow: build, create an account, unlock it, inspect it, and send your first TRX — all from the interactive prompt.

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

## How to create account

You can create accounts by transferring funds to non-existing accounts, or by initiating a transaction to create an account using the **CreateAccount** command. Transferring to a non-existent account has a minimum restriction amount of **1 TRX**. Creating an account through the `CreateAccount` command still burns **1 TRX**.

See [commands/account](../commands/account.md) for the full `CreateAccount` example.

## Next steps

- [command-flow](command-flow.md) — a worked end-to-end session
- [commands/wallet](../commands/wallet.md) — create / import / back up wallets
- [commands/network](../commands/network.md) — switch to a testnet
- [concepts/resources](../concepts/resources.md) — bandwidth and energy
