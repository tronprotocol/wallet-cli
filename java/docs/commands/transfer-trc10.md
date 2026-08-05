# TRC10 tokens

Issue, update, transfer, and query TRC10 assets.

## How to issue a TRC10 token

Each account can only issue **ONE** TRC10 token.

### AssetIssue

```console
> AssetIssue [OwnerAddress] AssetName AbbrName TotalSupply TrxNum AssetNum Precision StartDate EndDate Description Url FreeNetLimitPerAccount PublicFreeNetLimit FrozenAmount0 FrozenDays0 [...] FrozenAmountN FrozenDaysN
```

- `OwnerAddress` (optional) — the address of the account which initiated the transaction. Default: the address of the login account.
- `AssetName` — the name of the issued TRC10 token.
- `AbbrName` — the abbreviation of the TRC10 token.
- `TotalSupply` — TotalSupply = Account Balance of Issuer + All Frozen Token Amount. TotalSupply: total issuing amount. Account Balance of Issuer: at the time of issuance. All Frozen Token Amount: before asset transfer and the issuance.
- `TrxNum`, `AssetNum` — these two parameters determine the exchange rate when the token is issued. Exchange Rate = TrxNum / AssetNum. AssetNum: unit in base unit of the issued token. TrxNum: unit in SUN (0.000001 TRX).
- `Precision` — precision to how many decimal places.
- `FreeNetLimitPerAccount` — the maximum amount of bandwidth each account is allowed to use. Token issuers can freeze TRX to obtain bandwidth (TransferAssetContract only).
- `PublicFreeNetLimit` — the maximum total amount of bandwidth which is allowed to use for all accounts. Token issuers can freeze TRX to obtain bandwidth (TransferAssetContract only).
- `StartDate`, `EndDate` — the start and end date of token issuance. Within this period, other users can participate in token issuance.
- `FrozenAmount0`, `FrozenDays0` — amount and days of token freeze. FrozenAmount0: must be bigger than 0. FrozenDays0: must be between 1 and 3653.

Example:

```console
> AssetIssue TestTRX TRX 75000000000000000 1 1 2 "2019-10-02 15:10:00" "2020-07-11" "just for test121212" www.test.com 100 100000 10000 10 10000 1
> GetAssetIssueByAccount TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ  # View published information
{
    "assetIssue": [
        {
            "owner_address": "TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ",
            "name": "TestTRX",
            "abbr": "TRX",
            "total_supply": 75000000000000000,
            "frozen_supply": [
                {
                    "frozen_amount": 10000,
                    "frozen_days": 1
                },
                {
                    "frozen_amount": 10000,
                    "frozen_days": 10
                }
            ],
            "trx_num": 1,
            "precision": 2,
            "num": 1,
            "start_time": 1570000200000,
            "end_time": 1594396800000,
            "description": "just for test121212",
            "url": "www.test.com",
            "free_asset_net_limit": 100,
            "public_free_asset_net_limit": 100000,
            "id": "1000001"
        }
    ]
}
```

### UpdateAsset

Update parameters of a TRC10 token.

```console
> UpdateAsset [OwnerAddress] newLimit newPublicLimit description url
```

The specific meaning of the parameters is the same as that of `AssetIssue`.

Example:

```console
> UpdateAsset 1000 1000000 "change description" www.changetest.com
> GetAssetIssueByAccount TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ  # View the modified information
{
    "assetIssue": [
        {
            "owner_address": "TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ",
            "name": "TestTRX",
            "abbr": "TRX",
            "total_supply": 75000000000000000,
            "frozen_supply": [
                {
                    "frozen_amount": 10000,
                    "frozen_days": 1
                },
                {
                    "frozen_amount": 10000,
                    "frozen_days": 10
                }
            ],
            "trx_num": 1,
            "precision": 2,
            "num": 1,
            "start_time": 1570000200000,
            "end_time": 1594396800000,
            "description": "change description",
            "url": "www.changetest.com",
            "free_asset_net_limit": 1000,
            "public_free_asset_net_limit": 1000000,
            "id": "1000001"
        }
    ]
}
```

### TransferAsset

TRC10 token transfer.

```console
> TransferAsset [OwnerAddress] ToAddress AssertID Amount
```

- `OwnerAddress` (optional) — the address of the account which initiated the transaction. Default: the address of the login account.
- `ToAddress` — address of the target account.
- `AssertID` — TRC10 token ID (the CLI prints this parameter name as `AssertID`). Example: 1000001.
- `Amount` — the number of TRC10 token to transfer.

Example:

```console
> TransferAsset TN3zfjYUmMFK3ZsHSsrdJoNRtGkQmZLBLz 1000001 1000
> getaccount TN3zfjYUmMFK3ZsHSsrdJoNRtGkQmZLBLz  # View target account information after the transfer
address: TN3zfjYUmMFK3ZsHSsrdJoNRtGkQmZLBLz
    assetV2
    {
    id: 1000001
    balance: 1000
    latest_asset_operation_timeV2: null
    free_asset_net_usageV2: 0
    }
```

### ParticipateAssetIssue

Participate in the issuance of a TRC10 token.

```console
> ParticipateAssetIssue [OwnerAddress] ToAddress AssetID Amount
```

- `OwnerAddress` (optional) — the address of the account which initiated the transaction. Default: the address of the login account.
- `ToAddress` — account address of TRC10 issuers.
- `AssetID` — TRC10 token ID. Example: 1000001.
- `Amount` — the number of TRC10 token to transfer.

The participation process must happen during the release of TRC10, otherwise an error may occur.

Example:

```console
> ParticipateAssetIssue TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ 1000001 1000
> getaccount TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW  # View remaining balance
address: TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW
assetV2
    {
    id: 1000001
    balance: 1000
    latest_asset_operation_timeV2: null
    free_asset_net_usageV2: 0
    }
```

### ListAssetIssuePaginated

Query the list of all the tokens by pagination. Returns a list of tokens that succeed the token located at offset.

```console
> ListAssetIssuePaginated address code salt
```

Example:

```console
> ListAssetIssuePaginated 0 1
```

### UnfreezeAsset

Unfreeze all TRC10 token which are supposed to be unfrozen after the freezing period.

```console
> unfreezeasset [OwnerAddress]
```

## How to obtain TRC10 token information

| Command | Description |
|---|---|
| `ListAssetIssue` | Obtain all of the published TRC10 token information. |
| `GetAssetIssueByAccount Address` | Obtain TRC10 token information based on issuing address. |
| `getAssetIssueById AssetId` | Obtain TRC10 token information based on ID. |
| `GetAssetIssueByName AssetName` | Obtain TRC10 token information based on names. |
| `getAssetIssueListByName AssetName` | Obtain a list of TRC10 token information based on names. |

## See also

- [usdt](usdt.md) — TRC20 (USDT) transfers
- [exchange](exchange.md) · [dex](dex.md) — trade TRC10 assets on the exchange / DEX
