# Staking and Resources

Stake TRX to earn **resources** — energy and bandwidth — instead of burning TRX on every transaction. This walkthrough uses the `stake` commands on Nile. Background: [Energy & bandwidth](../concepts/energy-bandwidth.md).

> **Password**: every `stake` command signs a transaction, so it needs your master password on stdin (`--password-stdin`), and signing shows no prompt. The examples below omit it to keep the resource flags in focus — prepend `printf '%s' "$PW" |` and append `--password-stdin`, or pipe from a password manager (see [Getting started](getting-started.md#3-send-your-first-transaction)). Step 1 is a read-only query and needs no password.

## 1. See what you have

Run a read-only query first. [`stake info`](../commands/stake/info.md) gives a staking-focused overview (staked amount, per-resource limits, pending unstakes, TRON Power); for the `used / limit` breakdown of your resources, use `account info`:

```console
$ wallet-cli account info --network tron:nile
Label        main
Address      TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
Balance      1976.489 TRX
Staked       12 TRX (energy 12 + bandwidth 0)
Energy       used 0 / 888
Bandwidth    used 0 / 600
Created      2026-06-30
Permissions  owner 1-of-1, 1 active group
```

Plain TRX transfers consume **bandwidth**; smart-contract calls (TRC20 transfers included) consume **energy**. Every activated account gets a small free bandwidth allowance (here `0 / 600`). Energy, though, comes only from staking — this account shows `0 / 888` because it already has 12 TRX staked for energy (the `Staked` line); with nothing staked, energy is `0`. When a resource runs out, the node burns TRX from your balance to cover the shortfall — staking is how you avoid that.

## 2. Stake for a resource

`--amount-sun` is raw SUN (1 TRX = 1,000,000 SUN). Stake 100 TRX for energy:

```bash
wallet-cli stake freeze --amount-sun 100000000 --resource energy --network tron:nile
```

`--resource` chooses which resource the stake produces. It defaults to `bandwidth`; stake for `energy` when you plan to send TRC20 tokens or call contracts, since those spend energy (as in step 1). The TRX stays yours — it is locked, not spent — and staking also grants TRON Power (governance votes). Like every state-changing command, `stake freeze` supports `--dry-run`, `--sign-only`, `--wait`, and returns at submission by default.

Verify the effect by running `account info` again — the `Energy` limit now reflects the TRX you staked:

```bash
wallet-cli account info --network tron:nile
```

## 3. Delegate resources to another address

Lend the resource your stake produces — for example, to a hot operations account so it can transact without holding staked TRX:

```bash
wallet-cli stake delegate --amount-sun 50000000 --resource energy --receiver TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH --network tron:nile
```

By default you can reclaim a delegation at any time. Adding `--lock` blocks that until a lock period passes — set its length with `--lock-period <blocks>` (each block is ~3 seconds). Once delegated, use [`stake delegated`](../commands/stake/delegated.md) any time to inspect your current delegations and the maximum you can delegate. To reclaim the resource later, run the opposite command, `stake undelegate`, with the same amount, receiver, and resource:

```bash
wallet-cli stake undelegate --amount-sun 50000000 --resource energy --receiver TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH --network tron:nile
```

## 4. Unstake — a three-step exit

Unstaking is not instant; the chain imposes a waiting period — 14 days on mainnet (other networks may differ):

```bash
# step 1: request unstake — resources drop immediately, TRX enters the waiting queue
wallet-cli stake unfreeze --amount-sun 100000000 --resource energy --network tron:nile

# step 2 (after the waiting period): claim the expired unstake back to balance
wallet-cli stake withdraw --network tron:nile

# changed your mind before expiry? roll ALL pending unstakes back to staked
wallet-cli stake cancel-unfreeze --network tron:nile
```

Note `cancel-unfreeze` is all-or-nothing across pending unstakes, and `withdraw` claims whatever has expired.

## See also

[Energy & bandwidth](../concepts/energy-bandwidth.md) — the model behind these commands · [`account info`](../commands/account/info.md) · full flag reference for each `stake` subcommand: [`freeze`](../commands/stake/freeze.md) · [`unfreeze`](../commands/stake/unfreeze.md) · [`withdraw`](../commands/stake/withdraw.md) · [`cancel-unfreeze`](../commands/stake/cancel-unfreeze.md) · [`delegate`](../commands/stake/delegate.md) · [`undelegate`](../commands/stake/undelegate.md) · [`info`](../commands/stake/info.md) · [`delegated`](../commands/stake/delegated.md)
