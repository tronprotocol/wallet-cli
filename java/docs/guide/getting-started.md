# Getting started

wallet-cli has two entry modes: a standard one-shot CLI for scripts and a legacy interactive prompt. The first-run flow below uses the prompt because it keeps account creation, unlock, inspection, and transfer in one session.

## Quickstart

Build, create an account, and send your first transfer from the interactive prompt:

```console
# 1. Build
$ git clone https://github.com/tronprotocol/wallet-cli.git
$ cd wallet-cli/java && ./gradlew build && cd build/libs

# 2. Start the interactive wallet
$ java -jar wallet-cli.jar

# 3. In the wallet prompt: create an account (or ImportWallet), unlock, and inspect it
> RegisterWallet             # prompts twice for the password, then for mnemonic length
> Login                      # unlock the account
> GetAddress                 # show your address
> GetBalance                 # TRX balance

# 4. Send 1 TRX (amounts are in SUN; 1 TRX = 1,000,000 SUN)
> SendCoin <toAddress> 1000000
```

> On mainnet these commands move **real funds**. While learning, switch to a testnet with `SwitchNetwork` (Nile or Shasta) and top up from that network's faucet.

## Standard CLI

Passing a command selects the standard CLI instead of the prompt. It supports text or JSON output and global network, wallet, and endpoint overrides:

```console
$ java -jar wallet-cli.jar --output json --network nile get-balance --address T...
$ printf '%s\n' "$PW" | java -jar wallet-cli.jar --network nile --password-stdin send-coin --to T... --amount 1000000
```

Run `java -jar wallet-cli.jar --help` for the command catalog and `<command> --help` for command options. The [standard CLI command reference](../commands/standard-cli.md) lists all one-shot commands; parsing, authentication, JSON envelopes, and exit behavior are defined in the [standard CLI contract](../standard-cli-contract-spec.md).

## How to create account

You can create accounts by transferring funds to non-existing accounts, or by initiating a transaction to create an account using the **CreateAccount** command. Transferring to a non-existent account has a minimum restriction amount of **1 TRX**. Creating an account through the `CreateAccount` command still burns **1 TRX**.

See [commands/account](../commands/account.md) for the full `CreateAccount` example.

## Next steps

- [command-flow](command-flow.md) — a worked end-to-end session
- [commands/wallet](../commands/wallet.md) — create / import / back up wallets
- [commands/network](../commands/network.md) — switch to a testnet
- [concepts/resources](../concepts/resources.md) — bandwidth and energy
