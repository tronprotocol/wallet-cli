# Voting, rewards & witnesses

Vote for super representatives, manage brokerage and claim rewards, and create / update witnesses.

## How to vote

Voting requires share. Share can be obtained by freezing funds.

- The share calculation method is: **1** unit of share can be obtained for every **1 TRX** frozen.
- After unfreezing, the previous vote will expire. You can avoid invalidating the vote by re-freezing and voting.

**NOTE** The TRON network only records the status of your last vote, which means that each of your votes will overwrite all previous voting results.

For example:

```console
> freezeBalance 10000000 3 1 address  # Freeze 10 TRX and acquire 10 units of shares

> votewitness 123455 witness1 4 witness2 6  # Cast 4 votes for witness1 and 6 votes for witness2 at the same time

> votewitness 123455 witness1 10  # Voted 10 votes for witness1
```

The final result of the above command was 10 votes for witness1 and 0 vote for witness2.

## Brokerage

After voting for a witness, you will receive rewards. The witness has the right to decide the ratio of brokerage. The default ratio is 20%, and the witness can adjust it.

By default, if a witness is rewarded, they will receive 20% of the whole rewards, and 80% of the rewards will be distributed to their voters.

### GetBrokerage

View the ratio of brokerage of the witness.

```console
> getbrokerage OwnerAddress
```

`OwnerAddress` — the address of the witness's account, a base58check-type address.

### GetReward

Query unclaimed reward.

```console
> getreward OwnerAddress
```

`OwnerAddress` — the address of the voter's account, a base58check-type address.

### UpdateBrokerage

Update the ratio of brokerage. This command is usually used by a witness account.

```console
> updateBrokerage OwnerAddress brokerage
```

- `OwnerAddress` — the witness's account address, a base58check-type address.
- `brokerage` — the ratio of brokerage you want to update, from 0 to 100. If the input is 10, it means 10% of the total reward would be distributed to the SR and the rest would be rewarded to all the voters, which is 90% in this case.

Example:

```console
> getbrokerage TZ7U1WVBRLZ2umjizxqz3XfearEHhXKX7h  

> getreward  TNfu3u8jo1LDWerHGbzs2Pv88Biqd85wEY

> updateBrokerage TZ7U1WVBRLZ2umjizxqz3XfearEHhXKX7h 30
```

## WithdrawBalance

Withdraw voting or block rewards.

After each block is produced, the block award is sent to the account's allowance, and a withdraw operation is allowed every **24 hours** from allowance to balance. The funds in allowance cannot be locked or traded.

```console
> WithdrawBalance [owner_address]
```

```console
> WithdrawBalance TEDapYSVvAZ3aYH7w8N9tMEEFKaNKUD5Bp
```

## How to create witness

Applying to become a witness account needs to consume **100_000 TRX**. This part of the funds will be burned directly.

### CreateWitness

Apply to become a super representative candidate.

```console
> CreateWitness [owner_address] url
```

```console
> CreateWitness TEDapYSVvAZ3aYH7w8N9tMEEFKaNKUD5Bp https://sr.example.com
```

### UpdateWitness

Edit the URL of the SR's official website.

```console
> UpdateWitness TEDapYSVvAZ3aYH7w8N9tMEEFKaNKUD5Bp https://sr.example.com/v2
```

## ListWitnesses

Get all miner node information.

## GetPaginatedNowWitnessList

Get the paginated current witness list.

```console
wallet> getPaginatedNowWitnessList 0 2
{
	"witnesses": [
		{
			"address": "TJmka325yjJKeFpQDwKSQAoNwEyNGhsaEV",
			"voteCount": 5405926918,
			"url": "http://sr-8.com",
			"totalProduced": 1801675,
			"totalMissed": 456,
			"latestBlockNum": 64577529,
			"latestSlotNum": 590063589,
			"isJobs": true
		},
		{
			"address": "TFFLWM7tmKiwGtbh2mcz2rBssoFjHjSShG",
			"voteCount": 2322244615,
			"url": "http://sr-27.com",
			"totalProduced": 1807756,
			"totalMissed": 619,
			"latestBlockNum": 64577530,
			"latestSlotNum": 590063590,
			"isJobs": true
		}
	]
}
```

## See also

- [concepts/resources](../concepts/resources.md) — how shares are earned
- [stake-v2](stake-v2.md) — freeze TRX to obtain vote share
