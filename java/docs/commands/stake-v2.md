# Staking (Stake 2.0)

FreezeV2-based staking, resource delegation, and unfreeze withdrawal — the current staking model. For the difference from the legacy model, see [concepts/staking-models](../concepts/staking-models.md).

The transaction examples below are abridged: every signing command also prints the permission-id prompt, the key selector, the before/after signing hex strings, and a trailing `<command> successful !!!` line. Only the `TxId is …` line is kept here, because it is the part you carry to `GetTransactionById`.

## FreezeBalanceV2 / UnfreezeBalanceV2

### FreezeBalanceV2

```console
> freezeBalanceV2 [OwnerAddress] frozen_balance [ResourceCode:0 BANDWIDTH,1 ENERGY,2 TRON_POWER]
```

- `OwnerAddress` — the address of the account that initiated the transaction, optional, default is the address of the login account.
- `frozen_balance` — the amount of frozen, the unit is the smallest unit (Sun), the minimum is 1000000 sun.
- `ResourceCode` — `0` BANDWIDTH; `1` ENERGY; `2` TRON_POWER only when `getAllowNewResourceModel` is enabled.

Example:

```console
wallet> FreezeBalanceV2 TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh 1000000000000000 0
TxId is 82244829971b4235d98a9f09ba67ddb09690ac2f879ad93e09ba3ec1ab29177d
wallet> GetTransactionById  82244829971b4235d98a9f09ba67ddb09690ac2f879ad93e09ba3ec1ab29177d
{
    "ret":[
        {
            "contractRet":"SUCCESS"
        }
    ],
    "signature":[
        "4faa3772fa3d3e4792e8126cafed2dc2c5c069cd09c29532f0119bc982bf356004772e16fad86e401f5818c35b96d214d693efab06997ca2f07044d4494f12fd01"
    ],
    "txID":"82244829971b4235d98a9f09ba67ddb09690ac2f879ad93e09ba3ec1ab29177d",
    "raw_data":{
        "contract":[
            {
                "parameter":{
                    "value":{
                        "frozen_balance":1000000000000000,
                        "owner_address":"4159e3741a68ec3e1ebba80ad809d5ccd31674236e"
                    },
                    "type_url":"type.googleapis.com/protocol.FreezeBalanceV2Contract"
                },
                "type":"FreezeBalanceV2Contract"
            }
        ],
        "ref_block_bytes":"0000",
        "ref_block_hash":"19b59068c6058ff4",
        "expiration":1671109891800,
        "timestamp":1671088291796
    },
    "raw_data_hex":"0a020000220819b59068c6058ff440d8ada5afd1305a5c083612580a34747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e467265657a6542616c616e63655632436f6e747261637412200a154159e3741a68ec3e1ebba80ad809d5ccd31674236e1080809aa6eaafe30170d4fffea4d130"
}
```

### UnfreezeBalanceV2

```console
> unfreezeBalanceV2 [OwnerAddress] unfreezeBalance ResourceCode(0 BANDWIDTH,1 ENERGY,2 TRON_POWER)
```

- `OwnerAddress` — the address of the account that initiated the transaction, optional, default is the address of the login account.
- `unfreezeBalance` — the amount of unfreeze, the unit is the smallest unit (Sun).
- `ResourceCode` — `0` BANDWIDTH; `1` ENERGY; `2` TRON_POWER only when `getAllowNewResourceModel` is enabled.

Example:

```console
wallet> UnFreezeBalanceV2 TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh 9000000 0
TxId is dcfea1d92fc928d24c88f7f71a03ae8105d0b5b112d6d48be93d3b9c73bea634
wallet> GetTransactionById dcfea1d92fc928d24c88f7f71a03ae8105d0b5b112d6d48be93d3b9c73bea634
{
    "ret":[
        {
            "contractRet":"SUCCESS"
        }
    ],
    "signature":[
        "f73a278f742c11e8e5ede693ca09b0447a804fcb28ea2bfdfd8545bb05da7be44bd08cfaa92bd4d159178f763fcf753f28d5296bd0c3d4557532cce3b256b9da00"
    ],
    "txID":"dcfea1d92fc928d24c88f7f71a03ae8105d0b5b112d6d48be93d3b9c73bea634",
    "raw_data":{
        "contract":[
            {
                "parameter":{
                    "value":{
                        "owner_address":"4159e3741a68ec3e1ebba80ad809d5ccd31674236e",
                        "unfreeze_balance":9000000
                    },
                    "type_url":"type.googleapis.com/protocol.UnfreezeBalanceV2Contract"
                },
                "type":"UnfreezeBalanceV2Contract"
            }
        ],
        "ref_block_bytes":"0000",
        "ref_block_hash":"19b59068c6058ff4",
        "expiration":1671119916913,
        "timestamp":1671098316907
    },
    "raw_data_hex":"0a020000220819b59068c6058ff440f19e89b4d1305a5a083712560a36747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e556e667265657a6542616c616e63655632436f6e7472616374121c0a154159e3741a68ec3e1ebba80ad809d5ccd31674236e10c0a8a50470ebf0e2a9d130"
}
```

## DelegateResource / UnDelegateResource

### DelegateResource

```console
> delegateResource [OwnerAddress] balance ResourceCode(0 BANDWIDTH,1 ENERGY), ReceiverAddress [lock]
```

- `OwnerAddress` — the address of the account that initiated the transaction, optional, default is the address of the login account.
- `balance` — the amount of delegate, the unit is the smallest unit (Sun), the minimum is 1000000 sun.
- `ResourceCode` — 0 BANDWIDTH; 1 ENERGY.
- `ReceiverAddress` — the address of the account.
- `lock` — default is false, set true if you need to lock the delegate for 3 days.

Example:

```console
wallet> DelegateResource TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh 10000000 0 TQ4gjjpAjLNnE67UFbmK5wVt5fzLfyEVs3 true
TxId is 363ac0b82b6ad3e0d3cad90f7d72b3eceafe36585432a3e013389db36152b6ed
wallet> GetTransactionById 363ac0b82b6ad3e0d3cad90f7d72b3eceafe36585432a3e013389db36152b6ed
{
    "ret":[
        {
            "contractRet":"SUCCESS"
        }
    ],
    "signature":[
        "1f57fd78456136faadc5091b47f5fd27a8e1181621e49129df6a4062499429fb48ee72e5f9a9ff5bfb7f2575f01f4076f7d4b89ca382d36af46a6fa4bc749f4301"
    ],
    "txID":"363ac0b82b6ad3e0d3cad90f7d72b3eceafe36585432a3e013389db36152b6ed",
    "raw_data":{
        "contract":[
            {
                "parameter":{
                    "value":{
                        "balance":10000000,
                        "receiver_address":"419a9afe56e155ef0ff3f680d00ecf19deff60bdca",
                        "lock":true,
                        "owner_address":"4159e3741a68ec3e1ebba80ad809d5ccd31674236e"
                    },
                    "type_url":"type.googleapis.com/protocol.DelegateResourceContract"
                },
                "type":"DelegateResourceContract"
            }
        ],
        "ref_block_bytes":"0000",
        "ref_block_hash":"19b59068c6058ff4",
        "expiration":1671120059226,
        "timestamp":1671098459216
    },
    "raw_data_hex":"0a020000220819b59068c6058ff440daf691b4d1305a720839126e0a35747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e44656c65676174655265736f75726365436f6e747261637412350a154159e3741a68ec3e1ebba80ad809d5ccd31674236e1880ade2042215419a9afe56e155ef0ff3f680d00ecf19deff60bdca280170d0c8eba9d130"
}

```

### UnDelegateResource

```console
> unDelegateResource [OwnerAddress] balance ResourceCode(0 BANDWIDTH,1 ENERGY), ReceiverAddress
```

- `OwnerAddress` — the address of the account that initiated the transaction, optional, default is the address of the login account.
- `balance` — the amount of unDelegate, the unit is the smallest unit (Sun).
- `ResourceCode` — 0 BANDWIDTH; 1 ENERGY.
- `ReceiverAddress` — the address of the account.

Example:

```console
wallet> UnDelegateResource TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh 1000000 0 TQ4gjjpAjLNnE67UFbmK5wVt5fzLfyEVs3
TxId is feb334794cf361fd351728026ccf7319e6ae90eba622b9eb53c626cdcae4965c
wallet> GetTransactionById  feb334794cf361fd351728026ccf7319e6ae90eba622b9eb53c626cdcae4965c
{
    "ret":[
        {
            "contractRet":"SUCCESS"
        }
    ],
    "signature":[
        "85a41a4e44780ffbe0841a44fd71cf621f129d98e84984cfca68e03364f781aa7f9d44177af0b40d82da052feec9f47a399ed6e51be66c5db07cb13477dcde8c01"
    ],
    "txID":"feb334794cf361fd351728026ccf7319e6ae90eba622b9eb53c626cdcae4965c",
    "raw_data":{
        "contract":[
            {
                "parameter":{
                    "value":{
                        "balance":1000000,
                        "receiver_address":"419a9afe56e155ef0ff3f680d00ecf19deff60bdca",
                        "owner_address":"4159e3741a68ec3e1ebba80ad809d5ccd31674236e"
                    },
                    "type_url":"type.googleapis.com/protocol.UnDelegateResourceContract"
                },
                "type":"UnDelegateResourceContract"
            }
        ],
        "ref_block_bytes":"0000",
        "ref_block_hash":"19b59068c6058ff4",
        "expiration":1671120342283,
        "timestamp":1671098742280
    },
    "raw_data_hex":"0a020000220819b59068c6058ff4408b9aa3b4d1305a71083a126d0a37747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e556e44656c65676174655265736f75726365436f6e747261637412320a154159e3741a68ec3e1ebba80ad809d5ccd31674236e18c0843d2215419a9afe56e155ef0ff3f680d00ecf19deff60bdca7088ecfca9d130"
}
```

## WithdrawExpireUnfreeze

```console
> withdrawExpireUnfreeze [OwnerAddress]
```

`OwnerAddress` — the address of the account that initiated the transaction, optional, default is the address of the login account.

Example:

```console
wallet> withdrawexpireunfreeze TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh
TxId is e5763ab8dfb1e7ed076770d55cf3c1ddaf36d75e23ec8330f99df7e98f54a147
wallet> GetTransactionById e5763ab8dfb1e7ed076770d55cf3c1ddaf36d75e23ec8330f99df7e98f54a147
{
    "ret":[
        {
            "contractRet":"SUCCESS"
        }
    ],
    "signature":[
        "f8f02b5aa634b8666862a6d2ed68fcfd90afc616d14062952b0b09f0404d9bca6c4d3dc6dab082784950ff1ded235a07dab0d738c8a202be9451d5ca92b8eece01"
    ],
    "txID":"e5763ab8dfb1e7ed076770d55cf3c1ddaf36d75e23ec8330f99df7e98f54a147",
    "raw_data":{
        "contract":[
            {
                "parameter":{
                    "value":{
                        "owner_address":"4159e3741a68ec3e1ebba80ad809d5ccd31674236e"
                    },
                    "type_url":"type.googleapis.com/protocol.WithdrawExpireUnfreezeContract"
                },
                "type":"WithdrawExpireUnfreezeContract"
            }
        ],
        "ref_block_bytes":"0000",
        "ref_block_hash":"19b59068c6058ff4",
        "expiration":1671122055318,
        "timestamp":1671100455315
    },
    "raw_data_hex":"0a020000220819b59068c6058ff44096e18bb5d1305a5a083812560a3b747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5769746864726177457870697265556e667265657a65436f6e747261637412170a154159e3741a68ec3e1ebba80ad809d5ccd31674236e7093b3e5aad130"
}
```

## CancelAllUnfreezeV2

```console
> cancelAllUnfreezeV2 [OwnerAddress]
```

`OwnerAddress` — the address of the account that initiated the transaction, optional, default is the address of the login account.

Example:

```console
wallet> cancelAllUnfreezeV2 TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh
TxId is e5763ab8dfb1e7ed076770d55cf3c1ddaf36d75e23ec8330f99df7e98f54a147
wallet> GetTransactionById e5763ab8dfb1e7ed076770d55cf3c1ddaf36d75e23ec8330f99df7e98f54a147
{
    "ret":[
        {
            "contractRet":"SUCCESS"
        }
    ],
    "signature":[
        "f8f02b5aa634b8666862a6d2ed68fcfd90afc616d14062952b0b09f0404d9bca6c4d3dc6dab082784950ff1ded235a07dab0d738c8a202be9451d5ca92b8eece01"
    ],
    "txID":"e5763ab8dfb1e7ed076770d55cf3c1ddaf36d75e23ec8330f99df7e98f54a147",
    "raw_data":{
        "contract":[
            {
                "parameter":{
                    "value":{
                        "owner_address":"4159e3741a68ec3e1ebba80ad809d5ccd31674236e"
                    },
                    "type_url":"type.googleapis.com/protocol.CancelAllUnfreezeV2"
                },
                "type":"CancelAllUnfreezeV2Contract"
            }
        ],
        "ref_block_bytes":"0000",
        "ref_block_hash":"19b59068c6058ff4",
        "expiration":1671122055318,
        "timestamp":1671100455315
    },
    "raw_data_hex":"0a020000220819b59068c6058ff44096e18bb5d1305a5a083812560a3b747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5769746864726177457870697265556e667265657a65436f6e747261637412170a154159e3741a68ec3e1ebba80ad809d5ccd31674236e7093b3e5aad130"
}
```

## Query delegation (v2 API)

### GetDelegatedResourceV2

Get the information from the `fromAddress` to the `toAddress` resource delegate using the v2 API.

```console
> getDelegatedResourceV2 fromAddress toAddress
```

- `fromAddress` — the address of the account that starts the delegate.
- `toAddress` — the address of the account that receives the delegate.

Example:

```console
wallet> getDelegatedResourceV2 TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh TQ4gjjpAjLNnE67UFbmK5wVt5fzLfyEVs3
{
	"delegatedResource": [
		{
			"from": "TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh",
			"to": "TQ4gjjpAjLNnE67UFbmK5wVt5fzLfyEVs3",
			"frozen_balance_for_bandwidth": 10000000
		}
	]
}
```

### GetDelegatedResourceAccountIndexV2

Get the information that `address` is delegated to other accounts' resources using the v2 API.

```console
> getDelegatedResourceAccountIndexV2 address
```

`address` — the address of the account that starts the delegate or receives the delegate.

Example:

```console
wallet> getDelegatedResourceAccountIndexV2 TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh
{
	"account": "TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh",
	"toAccounts": [
		"TQ4gjjpAjLNnE67UFbmK5wVt5fzLfyEVs3"
	]
}
```

### GetCanDelegatedMaxSize

Get the max size that the `ownerAddress` can delegate using `delegateResource`.

```console
> getcandelegatedmaxsize ownerAddress type
```

- `ownerAddress` — the address of the account that starts the delegate, optional, default is the address of the login account.
- `type` — 0 bandwidth, 1 energy.

Example:

```console
wallet> getCanDelegatedMaxSize TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh 0
GetCanDelegatedMaxSize=999999978708334
GetCanDelegatedMaxSize  successful !!!
```

### GetAvailableUnfreezeCount

Get the available unfreeze count that the `ownerAddress` can call with `unfreezeBalanceV2`.

```console
> getavailableunfreezecount ownerAddress
```

`ownerAddress` — the address of the account that initiated the transaction, optional, default is the address of the login account.

Example:

```console
wallet> getAvailableUnfreezeCount TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh
GetAvailableUnfreezeCount=31
GetAvailableUnfreezeCount  successful!!!
```

### GetCanWithdrawUnfreezeAmount

Get the withdraw unfreeze amount that the `ownerAddress` can get by `withdrawexpireunfreeze`.

```console
> getcanwithdrawunfreezeamount ownerAddress timestamp
```

- `ownerAddress` — the address of the account that initiated the transaction, optional, default is the address of the login account.
- `timestamp` — get can-withdraw unfreeze amount until timestamp.

Example:

```console
wallet> getCanWithdrawUnfreezeAmount TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh 1671100335000
GetCanWithdrawUnfreezeAmount  successful amount:9000000 !!!
```

## See also

- [stake-v1-legacy](stake-v1-legacy.md) — the legacy freeze model
- [concepts/staking-models](../concepts/staking-models.md) · [concepts/resources](../concepts/resources.md)
- [resources](resources.md) — resource unit prices
