# USDT & TRC20 transfers

TRC20 (USDT) balance, transfers, and the recipient address book.

> The USDT commands (`GetUSDTBalance`, `TransferUSDT`, `GetUsdtTransferById`) run only on the **mainnet, Nile, and Shasta** networks. On any other network they report `This command does not support the current network.`

## GetUSDTBalance

Get the USDT balance of the login account, or of `Address` when one is given.

```console
> GetUSDTBalance [Address]
```

```console
wallet> getusdtbalance
balanceOf(address):70a08231
Execution result = {
        "constant_result": [
                "0000000000000000000000000000000000000000000000000000000000000000"
        ],
        "result": {
                "result": true
        },
        "energy_used": 4062,
        "energy_penalty": 3127
}
USDT balance = 0
```

## TransferUSDT

Make a USDT transfer.

```console
> TransferUSDT [OwnerAddress] ToAddress Amount
```

```console
wallet> transferusdt TR311sD6KasRnofj5RnFiFBA2rH8RH2kYk 1
balanceOf(address):70a08231
Execution result = {
	"constant_result": [
		"000000000000000000000000000000000000000000000000000000006544ae57"
	],
	"result": {
		"result": true
	},
	"energy_used": 935
}
USDT balance = 1698999895
transfer(address,uint256):a9059cbb
It is estimated that 345 bandwidth and 29650 energy will be consumed.
Execution result = {
	"constant_result": [
		"0000000000000000000000000000000000000000000000000000000000000000"
	],
	"result": {
		"result": true
	},
	"energy_used": 29650,
	"logs": [
		{
			"address": "NaMomAhUzuFzMNFzzQHVNsR8xbmP3A5LT",
			"topics": [
				"ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
				"000000000000000000000000caf9798d70a3c609b600f163e53cfe8f586e1b9f",
				"000000000000000000000000a5418b8da12e73075abb46375e7a15c758ea21fc"
			],
			"data": "0000000000000000000000000000000000000000000000000000000000000001"
		}
	]
}
{
	"raw_data":{
		"contract":[
			{
				"parameter":{
					"value":{
						"data":"a9059cbb000000000000000000000041a5418b8da12e73075abb46375e7a15c758ea21fc0000000000000000000000000000000000000000000000000000000000000001",
						"owner_address":"TUUSMd58eC3fKx3fn7whxJyr1FR56tgaP8",
						"contract_address":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"
					},
					"type_url":"type.googleapis.com/protocol.TriggerSmartContract"
				},
				"type":"TriggerSmartContract"
			}
		],
		"ref_block_bytes":"08c7",
		"ref_block_hash":"c02252c2ae3b92e1",
		"expiration":1761639507000,
		"fee_limit":1000000000,
		"timestamp":1761639448851
	},
	"raw_data_hex":"0a0208c72208c02252c2ae3b92e140b8c896cfa2335aae01081f12a9010a31747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e54726967676572536d617274436f6e747261637412740a1541caf9798d70a3c609b600f163e53cfe8f586e1b9f121541eca9bc828a3005b9a3b909f2cc5c2a54794de05f2244a9059cbb000000000000000000000041a5418b8da12e73075abb46375e7a15c758ea21fc000000000000000000000000000000000000000000000000000000000000000170938293cfa23390018094ebdc03"
}
Before sign transaction hex string is 0ad4010a0208c72208c02252c2ae3b92e140b8c896cfa2335aae01081f12a9010a31747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e54726967676572536d617274436f6e747261637412740a1541caf9798d70a3c609b600f163e53cfe8f586e1b9f121541eca9bc828a3005b9a3b909f2cc5c2a54794de05f2244a9059cbb000000000000000000000041a5418b8da12e73075abb46375e7a15c758ea21fc000000000000000000000000000000000000000000000000000000000000000170938293cfa23390018094ebdc03
Please confirm and input your permission id, if input y/Y means default 0, other non-numeric characters will cancel transaction.
y
Please choose your key for sign.

No.  Address                                    Name
1    TUUSMd58eC3fKx3fn7whxJyr1FR56tgaP8         test
Please choose No. between 1 and 1, or enter search to search wallets
1
Please input your password.
********
After sign transaction hex string is 0ad4010a0208c72208c02252c2ae3b92e1409fb0b9d9a2335aae01081f12a9010a31747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e54726967676572536d617274436f6e747261637412740a1541caf9798d70a3c609b600f163e53cfe8f586e1b9f121541eca9bc828a3005b9a3b909f2cc5c2a54794de05f2244a9059cbb000000000000000000000041a5418b8da12e73075abb46375e7a15c758ea21fc000000000000000000000000000000000000000000000000000000000000000170938293cfa23390018094ebdc031241a776830e5cd054c6a94631b6d62704e249e7587ab3f036e5e4fac15cbf49e671262532e094e1a32ad858272da3e101958102df61b0f72f26756a94b608883a6f01
TxId is 9c8d4b84e9a71ccaad86b0a96f790067d3fc7ea85c26b425e5d748b81d31a8b8
Transfer 1 to TR311sD6KasRnofj5RnFiFBA2rH8RH2kYk broadcast  successful.
Please check the given transaction id to get the result on blockchain using getTransactionInfoById command.
```

## GetUsdtTransferById

Get a USDT transfer transaction summary based on transaction ID.

```console
> GetUsdtTransferById txId
```

```console
wallet> GetUsdtTransferById b0044dcb188568d11e77da926d96630f3e878583c5d5f4b3a72d2b984802143a
{
        "id":"b0044dcb188568d11e77da926d96630f3e878583c5d5f4b3a72d2b984802143a",
        "type":"TriggerSmartContract(transferUSDT)",
        "from":"TUUSMd58eC3fKx3fn7whxJyr1FR56tgaP8",
        "to":"TGDjv2KKD4UqEmFTnZgLzup5WWjTex4Mvq",
        "amount":100,
        "tronscanQueryUrl":"https://nile.tronscan.org/#/transaction/b0044dcb188568d11e77da926d96630f3e878583c5d5f4b3a72d2b984802143a"
}
```

## AddressBook

Add, delete, modify, and search the address book.

```console
wallet> AddressBook

MAIN MENU:
1. addAddress
2. editAddress
3. delAddress
4. getAddressBook
Select option: 1
```

## See also

- [transfer-trc10](transfer-trc10.md) — TRC10 native tokens
- [contract](contract.md) — general smart-contract calls
