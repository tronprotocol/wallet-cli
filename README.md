# wallet-cli [![Build Status](https://travis-ci.org/tronprotocol/wallet-cli.svg?branch=master)](https://travis-ci.org/tronprotocol/wallet-cli)

Wallet CLI

[gitter](https://gitter.im/tronprotocol/wallet-cli)

## Get started

### Download wallet-cli

    git clone https://github.com/tronprotocol/wallet-cli.git

### Edit config.conf in src/main/resources

```
net {
  type = mainnet
  # type = testnet
}

fullnode = {
  ip.list = [
    "fullnode ip : port"
  ]
}

soliditynode = {
  ip.list = [
    "solidity ip : port"
  ]
} // NOTE: solidity node is optional
```

### Run a web wallet

- connect to fullNode and solidityNode

    Take a look at: [java-tron deployment](https://tronprotocol.github.io/documentation-en/developers/deployment/)
    Run both fullNode and solidity node in either your local PC or remote server.

    NOTE: These nodes would consume a lot of memory and CPU. Please be aware if you do not use wallet, just kill them.
- compile and run web wallet

    ```console
    $ cd wallet-cli
    $ ./gradlew build
    $ cd build/libs
    $ java -jar wallet-cli.jar
    ```

### Connect to java-tron

Wallet-cli connect to java-tron via gRPC protocol, which can be deployed locally or remotely. Check **Run a web Wallet** section.
We can configure java-tron node IP and port in ``src/main/resources/config.conf``, so that wallet-cli server can successfully talk to java-tron nodes.

## Wallet-cli Document Summary

The following are a overview of documents including some command explanations and usage examples. Check following links to find your interesting commands:

- [Freeze/unfreeze Balance](#How-to-freeze/unfreeze-balance)
- [Vote](#How-to-vote)
- [Bandwidth](#How-to-calculate-bandwidth)
- [IssueToke](#How-to-issue-TRC10-tokens)
- [Proposal](#How-to-initiate-a-proposal)
- [HowToTrade](#How-to-trade-on-the-exchange)
- [Multi-signature ](#How-to-use-the-multi-signature-feature-of-wallet-cli)
- [SmartContract](#How-to-use-smart-contract)
- [DelegateResource](#How-to-delegate-resource)
- [TransferToShieldedAddress](#How-to-transfer-to-shielded-address)
- [GetBlock](#How-to-get-block-information)
- [GetTransaction](#How-to-get-transaction-information)
- [GetToken10](#Get-Token10)
- [GetProposal](#Get-proposal-information)
- [AccountCommand](#Account-related-commands)
  - [createAccount](#How-to-create-account)
  - [createWitness](#How-to-create-witness)
- [WalletCommands](#Wallet-related-commands)
- [CommandLineFlow](#Command-line-operation-flow-example)
- [CommandList](#Command-list)

## How to freeze/unfreeze balance

After the funds are frozen, the corresponding number of shares and bandwidth will be obtained.
Shares can be used for voting and bandwidth can be used for trading.
The rules for the use and calculation of share and bandwidth are described later in this article.

**Freeze operation is as follows:**

```console
> freezeBalance [OwnerAddress] frozen_balance frozen_duration [ResourceCode:0 BANDWIDTH, 1 ENERGY] [receiverAddress]
```

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

frozen_balance
> The amount of frozen funds, the unit is drop.
> The minimum value is **1000000 drop(1TRX)**.

frozen_duration
> Freeze time, this value is currently only allowed for **3 days**.

For example:

```console
> freezeBalance 100000000 3 1 address
```

After the freeze operation, frozen funds will be transferred from Account Balance to Frozen,
You can view frozen funds from your account information.
After being unfrozen, it is transferred back to Balance by Frozen, and the frozen funds cannot be used for trading.

When more share or bandwidth is needed temporarily, additional funds may be frozen to obtain additional share and bandwidth.
The unfrozen time is postponed until 3 days after the last freeze operation

After the freezing time expires, funds can be unfroze.

**Unfreeze operation is as follows:**

```console
> unfreezeBalance [OwnerAddress] ResourceCode(0 BANDWIDTH, 1 CPU) [receiverAddress]
```

## How to vote

Voting requires share. Share can be obtained by freezing funds.

- The share calculation method is: **1** unit of share can be obtained for every **1TRX** frozen.
- After unfreezing, previous vote will expire. You can avoid the invalidation of the vote by re-freezing and voting.

**NOTE** The Tron Network only records the status of your last vote, which means that each of your votes will overwrite all previous voting results.

For example:

```console
> freezeBalance 100000000 3 1 address  # Freeze 10TRX and acquire 10 units of shares

> votewitness 123455 witness1 4 witness2 6  # Cast 4 votes for witness1 and 6 votes for witness2 at the same time

> votewitness 123455 witness1 10  # Voted 10 votes for witness1
```

The final result of the above command was 10 votes for witness1 and 0 vote for witness2.

## How to calculate bandwidth

The bandwidth calculation rule is:

    constant * FrozenFunds * days

Assuming freeze 1TRX（1_000_000 DROP), 3 days, bandwidth obtained = 1 * 1_000_000 * 3 = 3_000_000.

All contracts consume bandwidth, including transferring, transferring of assets, voting, freezing, etc.
Querying does not consume bandwidth. Each contract needs to consume **100_000 bandwidth**.

If a contract exceeds a certain time (**10s**), this operation does not consume bandwidth.

When the unfreezing operation occurs, the bandwidth is not cleared.
The next time the freeze is performed, the newly added bandwidth is accumulated.

## How to withdraw balance

After each block is produced, the block award is sent to the account's allowance,
and a withdraw operation is allowed every **24 hours** from allowance to balance.
The funds in allowance cannot be locked or traded.

## How to create witness

Applying to become a witness account needs to consume **100_000TRX**.
This part of the funds will be burned directly.

## How to create account

It is not allowed to create accounts directly. You can only create accounts by transferring funds to non-existing accounts.
Transferring to a non-existent account has minimum restriction amount of **1TRX**.

## Command line operation flow example

```console
$ cd wallet-cli
$ ./gradlew build
$ ./gradlew run
> RegisterWallet 123456      (password = 123456)
> login 123456
> getAddress
address = TRfwwLDpr4excH4V4QzghLEsdYwkapTxnm'  # backup it!
> BackupWallet 123456
priKey = 075725cf903fc1f6d6267b8076fc2c6adece0cfd18626c33427d9b2504ea3cef'  # backup it!!! (BackupWallet2Base64 option)
> getbalance
Balance = 0
> AssetIssue TestTRX TRX 75000000000000000 1 1 2 "2019-10-02 15:10:00" "2020-07-11" "just for test121212" www.test.com 100 100000 10000 10 10000 1
> getaccount TRfwwLDpr4excH4V4QzghLEsdYwkapTxnm
(Print balance: 9999900000
"assetV2": [
    {
        "key": "1000001",
        "value": 74999999999980000
    }
],)
  # (cost trx 1000 trx for assetIssue)
  # (You can query the trx balance and other asset balances for any account )
> TransferAsset TWzrEZYtwzkAxXJ8PatVrGuoSNsexejRiM 1000001 10000
```

## How to issue TRC10 tokens

Each account can only issue one TRC10 token.

### Issue TRC10 tokens

    > AssetIssue [OwnerAddress] AssetName AbbrName TotalSupply TrxNum AssetNum Precision StartDate EndDate Description Url FreeNetLimitPerAccount PublicFreeNetLimit FrozenAmount0 FrozenDays0 [...] FrozenAmountN FrozenDaysN

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.*

AssetName
> The name of the issued TRC10 token

AbbrName
> The Abbreviation of TRC10 tokens

TotalSupply
> Total issuing amount = account balance of the issuer at the time of issuance + all the frozen amount, before asset transfer and the issuance.

TrxNum, AssetNum
> These two parameters determine the exchange rate between the issued token and the minimum unit of TRX (sun) when the token is issued.

FreeNetLimitPerAccount
> The maximum amount of bandwidth an account is allowed to use. Token issuers can freeze TRX to obtain bandwidth (TransferAssetContract only)

PublicFreeNetLimit
> The maximum amount of bandwidth issuing accounts are allowed user. Token issuers can freeze REX to obtain bandwidth (TransferAssetContract only)

StartDate, EndDate
> The start and end date of token issuance. Within this period time, other users can participate in token issuance.*

FrozenAmount0 FrozenDays0
> Amount and time of token freeze. FrozenAmount0 must be bigger than 0, FrozenDays0 must be bigger than 1 and smaller than 3653.

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

### Update parameters of TRC10 token

    > UpdateAsset [OwnerAddress] newLimit newPublicLimit description url

Specific meaning of the parameters is the same with that of AssetIssue.

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

### TRC10 transfer

    > TransferAsset [OwnerAddress] ToAddress AssertID Amount

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

ToAddress
> Address of the target account

AssertName
> TRC10 id, 1000001 in the example

Amount
> The number of TRC10 token to transfer

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

### Participating in the issue of TRC10

    > ParticipateAssetIssue [OwnerAddress] ToAddress AssetID Amount

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

ToAddress
> Account address of Token 10 issuers

AssertName
> TRC10 ID, 1000001 in the example

Amount
> The number of TRC10 token to transfers

It must happen during the release of Token 10, otherwise an error may occur.

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

### unfreeze TRC10 token

It must be unfrozen after the freezing period, unfreeze Token10, which has stopped being frozen.

    > unfreezeasset [OwnerAddress]

## Get Token10

ListAssetIssue
> Obtain all of the published Token 10 information

GetAssetIssueByAccount
> Obtain Token10 information according to the issuing address

GetAssetIssueById
> Obtain Token10 Information based on ID

GetAssetIssueByName
> Obtain Token10 Information based on names

GetAssetIssueListByName
> Get list information on Token10 based on names

## How to initiate a proposal

Any proposal-related operations, except for viewing operations, must be performed by committee
members.

### Initiate a proposal

    > createProposal [OwnerAddress] id0 value0 ... idN valueN

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

id0
> The serial number of the parameter. Every parameter of TRON network has a serial number. Go to "http://tronscan.org/#/sr/committee" to see the specifics

Value0
> The modified value

In the example, modification No.4 (modifying token issuance fee) costs 1000TRX as follows:

```console
> createProposal 4 1000
> listproposals  # View initiated proposal
{
    "proposals": [
        {
            "proposal_id": 1,
            "proposer_address": "TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ",
            "parameters": [
                {
                    "key": 4,
                    "value": 1000
                }
            ],
            "expiration_time": 1567498800000,
            "create_time": 1567498308000
        }
    ]
}
```

The corresponding id is 1.

### Approve/cancel the proposal

    > approveProposal [OwnerAddress] id is_or_not_add_approval

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

id
> ID of the initiated proposal, 1 in the example
is_or_not_add_approval

> true for approve; false for disapprove

Example:

```console
> ApproveProposal 1 true  # in favor of the offer
> ApproveProposal 1 false  # Cancel the approved proposal
```

### Cancel the created proposal

    > deleteProposal [OwnerAddress] proposalId

proposalId
> ID of the initiated proposal, 1 in the example

The proposal must be canceled by the supernode that initiated the proposal.

Example：

    > DeleteProposal 1

## Get proposal information

ListProposals
> Obtain initiated proposals

ListProposalsPaginated
> Use the paging mode to obtain the initiated proposal

GetProposal
> Obtain proposal information based on the proposal ID

## How to trade on the exchange

The trading and price fluctuations of trading pairs are in accordance with the Bancor Agreement,
which can be found in TRON's related documents.

### Create a trading pair

    > exchangeCreate [OwnerAddress] first_token_id first_token_balance second_token_id second_token_balance

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

First_token_id, first_token_balance
> ID and amount of the first token

second_token_id, second_token_balance
> ID and amount of the second token
> The ID is the ID of the issued TRC10 token. If it is TRX, the ID is "_", the amount must be greater than 0, and less than 1,000,000,000,000,000.

Example:

    > exchangeCreate 1000001 10000 _ 10000
    # Create trading pairs with the IDs of 1000001 and TRX, the amount is 10000 for both.

### Capital injection

    > exchangeInject [OwnerAddress] exchange_id token_id quant

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

exchange_id
> The ID of the transaction pair to be funded

token_id, quant
> TokenId and quantity of capital injection

When conducting capital injection, depending on the amount of capital injection, the proportion
of each token in the transaction pair is deducted from the account and added to the transaction
pair. Depending on the difference in the balance of the transaction, the same amount of money for
the same token is different.

### Transactions

    > exchangeTransaction [OwnerAddress] exchange_id token_id quant expected

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

exchange_id
> ID of the transaction pair

token_id, quant
> The ID and quantity of tokens being exchanged, equivalent to selling

expected
> Expected quantity of another token

The expected must be less than exchanged, otherwise, an error will be reported.

Example：

    > ExchangeTransaction 1 1000001 100 80

It is expected to acquire the 80 TRX by exchanging 1000001 from the transaction pair ID of 1, and the amount is 100 (equivalent to selling token10, the ID is 1000001, the amount is 100).

### Divestment

    > exchangeWithdraw [OwnerAddress] exchange_id token_id quant

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

> Exchange_id
The ID of the transaction pair to be divested

Token_id, quant
> TokenId and quantity of divestment

When conducting divestment, depending on the amount of divestment, the proportion of each token
in the transaction pair is deducted from the account and added to the transaction pair. Depending
on the difference in the balance of the transaction, the same amount of money for the same token is different.

### Obtain information on trading pairs

ListExchanges
> lists trading pairs

ListexchangesPaginated
> List trading pairs by page

## How to use the multi-signature feature of wallet-cli?

Multi-signature allows other users to access the account in order to better manage it. There are
three types of accesses:

- owner: access to the owner of account
- active: access to other features of accounts, and access that authorizes a certain feature. Block production authorization is not included if it's for witness purposes.
- witness: only for witness, block production authorization will be granted to one of the other users.

The rest of the users will be granted

```console
> Updateaccountpermission TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ \
{
  "owner_permission": {
    "type": 0,
    "permission_name": "owner",
    "threshold": 1,
    "keys": [
      {
        "address": "TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ",
        "weight": 1
      }
    ]
  },
  "witness_permission": {
    "type": 1,
    "permission_name": "owner",
    "threshold": 1,
    "keys": [
      {
        "address": "TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ",
        "weight": 1
      }
    ]
  },
  "active_permissions": [
    {
      "type": 2,
      "permission_name": "active12323",
      "threshold": 2,
      "operations": "7fff1fc0033e0000000000000000000000000000000000000000000000000000",
      "keys": [
        {
          "address": "TNhXo1GbRNCuorvYu5JFWN3m2NYr9QQpVR",
          "weight": 1
        },
        {
          "address": "TKwhcDup8L2PH5r6hxp5CQvQzZqJLmKvZP",
          "weight": 1
        }
      ]
    }
  ]
}
```

The account TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ gives the owner access to itself, active access to
TNhXo1GbRNCuorvYu5JFWN3m2NYr9QQpVR and TKwhcDup8L2PH5r6hxp5CQvQzZqJLmKvZP. Active access will
need signatures from both accounts in order to take effect.

If the account is not a witness, it's not necessary to set witness_permission, otherwise an error will occur.

### Signed transaction

    > SendCoin TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW 10000000000000000

Will show "Please confirm and input your permission id, if input y or Y means default 0, other
non-numeric characters will cancel transaction."

This will require the transfer authorization of active access. Enter: 2

Then select accounts and put in local password, i.e. TNhXo1GbRNCuorvYu5JFWN3m2NYr9QQpVR needs a
private key TNhXo1GbRNCuorvYu5JFWN3m2NYr9QQpVR to sign a transaction.

Select another account and enter the local password. i.e. TKwhcDup8L2PH5r6hxp5CQvQzZqJLmKvZP will
need a private key of TKwhcDup8L2PH5r6hxp5CQvQzZqJLmKvZP to sign a transaction.

The weight of each account is 1, threshold of access is 2. When the requirements are met, users
will be notified with “Send 10000000000000000 drop to TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW
successful !!”.

This is how multiple accounts user multi-signature when using the same cli.
Use the instruction addTransactionSign according to the obtained transaction hex string if
signing at multiple cli. After signing, the users will need to broadcast final transactions
manually.

## Obtain weight information according to transaction

    > getTransactionSignWeight
    0a8c010a020318220860e195d3609c86614096eadec79d2d5a6e080112680a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412370a1541a7d8a35b260395c14aa456297662092ba3b76fc01215415a523b449890854c8fc460ab602df9f31fe4293f18808084fea6dee11128027094bcb8bd9d2d1241c18ca91f1533ecdd83041eb0005683c4a39a2310ec60456b1f0075b4517443cf4f601a69788f001d4bc03872e892a5e25c618e38e7b81b8b1e69d07823625c2b0112413d61eb0f8868990cfa138b19878e607af957c37b51961d8be16168d7796675384e24043d121d01569895fcc7deb37648c59f538a8909115e64da167ff659c26101

The information displays as follows:

```json
{
    "result":{
        "code":"PERMISSION_ERROR",
        "message":"Signature count is 2 more than key counts of permission : 1"
    },
    "permission":{
        "operations":"7fff1fc0033e0100000000000000000000000000000000000000000000000000",
        "keys":[
            {
                "address":"TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ",
                "weight":1
            }
        ],
        "threshold":1,
        "id":2,
        "type":"Active",
        "permission_name":"active"
    },
    "transaction":{
        "result":{
            "result":true
        },
        "txid":"7da63b6a1f008d03ef86fa871b24a56a501a8bbf15effd7aca635de6c738df4b",
        "transaction":{
            "signature":[
                "c18ca91f1533ecdd83041eb0005683c4a39a2310ec60456b1f0075b4517443cf4f601a69788f001d4bc03872e892a5e25c618e38e7b81b8b1e69d07823625c2b01",
                "3d61eb0f8868990cfa138b19878e607af957c37b51961d8be16168d7796675384e24043d121d01569895fcc7deb37648c59f538a8909115e64da167ff659c26101"
            ],
            "txID":"7da63b6a1f008d03ef86fa871b24a56a501a8bbf15effd7aca635de6c738df4b",
            "raw_data":{
                "contract":[
                    {
                        "parameter":{
                            "value":{
                                "amount":10000000000000000,
                                "owner_address":"TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ",
                                "to_address":"TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW"
                            },
                            "type_url":"type.googleapis.com/protocol.TransferContract"
                        },
                        "type":"TransferContract",
                        "Permission_id":2
                    }
                ],
                "ref_block_bytes":"0318",
                "ref_block_hash":"60e195d3609c8661",
                "expiration":1554123306262,
                "timestamp":1554101706260
            },
            "raw_data_hex":"0a020318220860e195d3609c86614096eadec79d2d5a6e080112680a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412370a1541a7d8a35b260395c14aa456297662092ba3b76fc01215415a523b449890854c8fc460ab602df9f31fe4293f18808084fea6dee11128027094bcb8bd9d2d"
        }
    }
}
```

### Get signature information according to transactions

    > getTransactionApprovedList
    0a8c010a020318220860e195d3609c86614096eadec79d2d5a6e080112680a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412370a1541a7d8a35b260395c14aa456297662092ba3b76fc01215415a523b449890854c8fc460ab602df9f31fe4293f18808084fea6dee11128027094bcb8bd9d2d1241c18ca91f1533ecdd83041eb0005683c4a39a2310ec60456b1f0075b4517443cf4f601a69788f001d4bc03872e892a5e25c618e38e7b81b8b1e69d07823625c2b0112413d61eb0f8868990cfa138b19878e607af957c37b51961d8be16168d7796675384e24043d121d01569895fcc7deb37648c59f538a8909115e64da167ff659c26101

```json
{
    "result":{

    },
    "approved_list":[
        "TKwhcDup8L2PH5r6hxp5CQvQzZqJLmKvZP",
        "TNhXo1GbRNCuorvYu5JFWN3m2NYr9QQpVR"
    ],
    "transaction":{
        "result":{
            "result":true
        },
        "txid":"7da63b6a1f008d03ef86fa871b24a56a501a8bbf15effd7aca635de6c738df4b",
        "transaction":{
            "signature":[
                "c18ca91f1533ecdd83041eb0005683c4a39a2310ec60456b1f0075b4517443cf4f601a69788f001d4bc03872e892a5e25c618e38e7b81b8b1e69d07823625c2b01",
                "3d61eb0f8868990cfa138b19878e607af957c37b51961d8be16168d7796675384e24043d121d01569895fcc7deb37648c59f538a8909115e64da167ff659c26101"
            ],
            "txID":"7da63b6a1f008d03ef86fa871b24a56a501a8bbf15effd7aca635de6c738df4b",
            "raw_data":{
                "contract":[
                    {
                        "parameter":{
                            "value":{
                                "amount":10000000000000000,
                                "owner_address":"TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ",
                                "to_address":"TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW"
                            },
                            "type_url":"type.googleapis.com/protocol.TransferContract"
                        },
                        "type":"TransferContract",
                        "Permission_id":2
                    }
                ],
                "ref_block_bytes":"0318",
                "ref_block_hash":"60e195d3609c8661",
                "expiration":1554123306262,
                "timestamp":1554101706260
            },
            "raw_data_hex":"0a020318220860e195d3609c86614096eadec79d2d5a6e080112680a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412370a1541a7d8a35b260395c14aa456297662092ba3b76fc01215415a523b449890854c8fc460ab602df9f31fe4293f18808084fea6dee11128027094bcb8bd9d2d"
        }
    }
}
```

## How to use smart contract

### deploy smart contracts

    > DeployContract [ownerAddress] contractName ABI byteCode constructor params isHex fee_limit consume_user_resource_percent origin_energy_limit value token_value token_id(e.g: TRXTOKEN, use # if don't provided) <library:address,library:address,...> <lib_compiler_version(e.g:v5)> library:address,...>

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

contractName
> Name of smart contract

ABI
> Compile generated ABI code

byteCode
> Compile generated byte code

constructor, params, isHex
> Define the format of the bytecode, which determines the way to parse byteCode from parameters

fee_limit
> Transaction allows for the most consumed TRX

consume_user_resource_percent
> Percentage of user resource consumed, in the range [0, 100]

origin_energy_limit
> The most amount of developer Energy consumed by trigger contract once

value
> The amount of trx transferred to the contract account

> token_value
Number of TRX10

token_id
> TRX10 Id

Example:

```
> deployContract normalcontract544 [{"constant":false,"inputs":[{"name":"i","type":"uint256"}],"name": "findArgsByIndexTest","outputs":[{"name":"z","type":"uint256"}],"payable":false,"stateMutability":"nonpayable","type":"function"}]
608060405234801561001057600080fd5b50610134806100206000396000f3006080604052600436106100405763ffffffff7c0100000000000000000000000000000000000000000000000000000000600035041663329000b58114610045575b600080fd5b34801561005157600080fd5b5061005d60043561006f565b60408051918252519081900360200190f35b604080516003808252608082019092526000916060919060208201838038833901905050905060018160008151811015156100a657fe5b602090810290910101528051600290829060019081106100c257fe5b602090810290910101528051600390829060029081106100de57fe5b6020908102909101015280518190849081106100f657fe5b906020019060200201519150509190505600a165627a7a72305820b24fc247fdaf3644b3c4c94fcee380aa610ed83415061ff9e65d7fa94a5a50a00029 # # false 1000000000 75 50000 0 0 #
```

Get the result of the contract execution with the getTransactionInfoById command:

```console
> getTransactionInfoById 4978dc64ff746ca208e51780cce93237ee444f598b24d5e9ce0da885fb3a3eb9
{
    "id": "8c1f57a5e53b15bb0a0a0a0d4740eda9c31fbdb6a63bc429ec2113a92e8ff361",
    "fee": 6170500,
    "blockNumber": 1867,
    "blockTimeStamp": 1567499757000,
    "contractResult": [
        "6080604052600436106100405763ffffffff7c0100000000000000000000000000000000000000000000000000000000600035041663329000b58114610045575b600080fd5b34801561005157600080fd5b5061005d60043561006f565b60408051918252519081900360200190f35b604080516003808252608082019092526000916060919060208201838038833901905050905060018160008151811015156100a657fe5b602090810290910101528051600290829060019081106100c257fe5b602090810290910101528051600390829060029081106100de57fe5b6020908102909101015280518190849081106100f657fe5b906020019060200201519150509190505600a165627a7a72305820b24fc247fdaf3644b3c4c94fcee380aa610ed83415061ff9e65d7fa94a5a50a00029"
    ],
    "contract_address": "TJMKWmC6mwF1QVax8Sy2AcgT6MqaXmHEds",
    "receipt": {
        "energy_fee": 6170500,
        "energy_usage_total": 61705,
        "net_usage": 704,
        "result": "SUCCESS"
    }
}
```

### trigger smart contarct

    > TriggerContract [ownerAddress] contractAddress method args isHex fee_limit value token_value token_id

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

contractAddress
> Smart contarct address

method
> The name of function and parameters, please refer to the example

args
> Parameter value

isHex
> The format of the parameters method and args, is hex string or not

fee_limit
> The most amount of trx allows for the consumption

token_value
> Number of TRX10

token_id
> TRC10 id, If not, use ‘#’ instead

Example:

```console
> triggerContract TGdtALTPZ1FWQcc5MW7aK3o1ASaookkJxG findArgsByIndexTest(uint256) 0 false
1000000000 0 0 #
# Get the result of the contract execution with the getTransactionInfoById command
> getTransactionInfoById 7d9c4e765ea53cf6749d8a89ac07d577141b93f83adc4015f0b266d8f5c2dec4
{
    "id": "de289f255aa2cdda95fbd430caf8fde3f9c989c544c4917cf1285a088115d0e8",
    "fee": 8500,
    "blockNumber": 2076,
    "blockTimeStamp": 1567500396000,
    "contractResult": [
        ""
    ],
    "contract_address": "TJMKWmC6mwF1QVax8Sy2AcgT6MqaXmHEds",
    "receipt": {
        "energy_fee": 8500,
        "energy_usage_total": 85,
        "net_usage": 314,
        "result": "REVERT"
    },
    "result": "FAILED",
    "resMessage": "REVERT opcode executed"
}
```

### get details of a smart contract

    > GetContract contractAddress

contractAddress
> smart contract address

Example:

```console
> GetContract TGdtALTPZ1FWQcc5MW7aK3o1ASaookkJxG
{
    "origin_address": "TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ",
    "contract_address": "TJMKWmC6mwF1QVax8Sy2AcgT6MqaXmHEds",
    "abi": {
        "entrys": [
            {
                "name": "findArgsByIndexTest",
                "inputs": [
                    {
                        "name": "i",
                        "type": "uint256"
                    }
                ],
                "outputs": [
                    {
                        "name": "z",
                        "type": "uint256"
                    }
                ],
                "type": "Function",
                "stateMutability": "Nonpayable"
            }
        ]
    },
    "bytecode": "608060405234801561001057600080fd5b50610134806100206000396000f3006080604052600436106100405763ffffffff7c0100000000000000000000000000000000000000000000000000000000600035041663329000b58114610045575b600080fd5b34801561005157600080fd5b5061005d60043561006f565b60408051918252519081900360200190f35b604080516003808252608082019092526000916060919060208201838038833901905050905060018160008151811015156100a657fe5b602090810290910101528051600290829060019081106100c257fe5b602090810290910101528051600390829060029081106100de57fe5b6020908102909101015280518190849081106100f657fe5b906020019060200201519150509190505600a165627a7a72305820b24fc247fdaf3644b3c4c94fcee380aa610ed83415061ff9e65d7fa94a5a50a00029",
    "consume_user_resource_percent": 75,
    "name": "normalcontract544",
    "origin_energy_limit": 50000,
    "code_hash": "23423cece3b4866263c15357b358e5ac261c218693b862bcdb90fa792d5714e6"
}
```

### update smart contract parameters

    > UpdateEnergyLimit [ownerAddress] contract_address energy_limit  # Update parameter energy_limit
    > UpdateSetting [ownerAddress] contract_address consume_user_resource_percent  # Update parameter consume_user_resource_percent

## How to delegate resource

### delegate resource

    > freezeBalance [OwnerAddress] frozen_balance frozen_duration [ResourceCode:0 BANDWIDTH, 1 ENERGY] [receiverAddress]

The latter two parameters are optional parameters. If not set, the TRX is frozen to obtain
resources for its own use; if it is not empty, the acquired resources are used by receiverAddress.

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

> frozen_balance
The amount of frozen TRX, the unit is the smallest unit (sun), the minimum is 1000000sun.

frozen_duration
> frezen duration, 3 days

ResourceCode
> 0 BANDWIDTH;1 ENERGY

receiverAddress
> target account address

### unfreeze delegated resource

    > unfreezeBalance [OwnerAddress] ResourceCode(0 BANDWIDTH, 1 CPU) [receiverAddress]

The latter two parameters are optional. If they are not set, the BANDWIDTH resource is unfreeze
by default; when the receiverAddress is set, the delegate resources are unfreezed.

### get resource delegation information

getDelegatedResource fromAddress toAddress
> get the information from the fromAddress to the toAddress resource delegate
getDelegatedResourceAccountIndex address
> get the information that address is delegated to other account resources

## Wallet related commands

**RegisterWallet**
> Register your wallet, you need to set the wallet password and generate the address and private key.

**BackupWallet**
> Back up your wallet, you need to enter your wallet password and export the private key.hex string format, such
as: 721d63b074f18d41c147e04c952ec93467777a30b6f16745bc47a8eae5076545

**BackupWallet2Base64**
> Back up your wallet, you need to enter your wallet password and export the private key.base64 format, such as: ch1jsHTxjUHBR+BMlS7JNGd3ejC28WdFvEeo6uUHZUU=

**ChangePassword**
> Modify the password of an account

**ImportWallet**
> Import wallet, you need to set a password, hex String format

**ImportWalletByBase64**
> Import wallet, you need to set a password, base64 fromat

## Account related commands

**GenerateAddress**
> Generate an address and print out the public and private keys

**GetAccount**
> Get account information based on address

**GetAccountNet**
> The usage of bandwidth

**GetAccountResource**
> The usage of bandwidth and energy

**GetAddress**
> Get the address of the current login account

**GetBalance**
> Get the balance of the current login account

## How to get transaction information

**GetTransactionById**
> Get transaction information based on transaction id

**GetTransactionCountByBlockNum**
> Get the number of transactions in the block based on the block height

**GetTransactionInfoById**
> Get transaction-info based on transaction id, generally used to check the result of a smart contract trigger

## How to get block information

**GetBlock**
> Get the block according to the block number; if you do not pass the parameter, get the latest block

**GetBlockById**
> Get block based on blockID

**GetBlockByLatestNum n**
> Get the latest n blocks, where 0 < n < 100

**GetBlockByLimitNext startBlockId endBlockId**
> Get the block in the range [startBlockId, endBlockId)

## Some others

**GetNextMaintenanceTime**
> Get the start time of the next maintain period

**ListNodes**
> Get other peer information

**ListWitnesses**
> Get all miner node information

**BroadcastTransaction**
> Broadcast the transaction, where the transaction is in hex string format.

## How to transfer to shielded address

### loadshieldedwallet

Load shielded address, shielded note and start to scan by ivk

Example:

```console
> loadshieldedwallet
Please input your password for shielded wallet.
> *******
LoadShieldedWallet successful !!!
```

### generateshieldedaddress number

Generate shielded addresses

number
> The number of shielded addresses, the default is 1

Example:

```console
> generateshieldedaddress 2
ShieldedAddress list:
ztron165vh2d0qqj7ytrkjeehwy0sg3uvc4tnvcqnpqnzrqq4jpw2p7pzgm2d3chrwxk2jf9ck6rza8jr
ztron1klw4nge0dz45axsyf5rq4tujmwernmwzzlq3s5wly3tewkf8d87zl66xt8seud0jkap2wpwkjcc
GenerateShieldedAddress successful !!
```

### listshieldedaddress

Display cached local shielded address list

Example:

```console
> listshieldedaddress
ShieldedAddress :
ztron1akz7mt4zqsjqrdrwdsmffu6g5dnehhhtahjlc0c6syy3z9nxxjrzqszy22lyx326edmwqjhqe48
ztron1ujhgjxazfnv8gzmkx0djn8cj4ef0mtfec6lkyslnslhf0mxlyg99ptk5hsuxmeqlqyakx7220ar
ztron1vtf8ta7cztkk23pvs7euuh7jw6wzxhqr7pg48zznxt6cxel27ch3t9qhs8npeptdaqvf2sgwqfr
ztron1lpfz287u6q3sfgdmfeh7n7dgmd7lq9780e858jzz0xeqssh0ahcfxg6wmhcqky744adjyk9nc0z
ztron1m5dx50gryu789q5sh5207chzmmgzf5c7hvn8lr6xs60jfxvkv3d3h0kqkglc60rwq26dchztsty
ztron165vh2d0qqj7ytrkjeehwy0sg3uvc4tnvcqnpqnzrqq4jpw2p7pzgm2d3chrwxk2jf9ck6rza8jr
```

### SendShieldedCoin

    > SendShieldedCoin [publicFromAddress] fromAmount shieldedInputNum input publicToAddress toAmount shieldedOutputNum shieldedAddress1 amount1 memo1 ...

Shielded transfer, support from public address or shielded address to public address and shielded address, does not support public address to public address, does not support automatic change.

Public input amount / shielded input amount = public output amount + shielded output amount + fee

publicFromAddress
> Public from address, set to null if not needed. Optional, If this variable is not configured, it is the address of the current login account

fromAmount
> The amount transfer from public address, if publicFromAddress set to null, this variable must be 0.

shieldedInputNum
> The number of shielded input note, should be 0 or 1.

input
> The index of shielded input note, get from execute command listshieldednote, if shieldedInputNum set to 0, no need to set.

publicToAddress
> Public to address, set to null if not needed.

toAmount
> The amount transfer to public address, if publicToAddress set to null, this variable must be 0.

shieldedOutputNum
> The amount of shielded output note. That is the number of (shieldedAddress amount meno) pairs, should be 0, 1, 2

shieldedAddress1
> Output shielded address

amount1
> The amount transfer to shieldedAddress1

memo1
> The memo of this note, up to 512 bytes, can be set to null if not needed

Example:

1. Public address transfer to shielded addresses    
  **When in this mode,Some variables must be set as follows, shieldedInputNum=0,publicToAddress=null,toAmount=0**
    ```console
    > sendshieldedcoin TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ 210000000 0 null 0 2 ztron16j06s3p5gvp2jde4vh7w3ug3zz3m62zkyfu86s7ara5lafhp22p9wr3gz0lcdm3pvt7qx0aftu4 100000000 test1 ztron1ghdy60hya8y72deu0q0r25qfl60unmue6889m3xfc3296a5ut6jcyafzhtp9nlutndukufzap4h 100000000 null
    ```

2. shielded address transfer to shielded address    
   **When in this mode,Some variables must be set as follows, publicFromAddress=null,fromAmount=0,shieldedInputNum=1,publicToAddress=null,toAmount=0**

    ```console
    > listshieldednote
    Unspend note list like:
    1 ztron1ghdy60hya8y72deu0q0r25qfl60unmue6889m3xfc3296a5ut6jcyafzhtp9nlutndukufzap4h 100000000 4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1 1 UnSpend
    0 ztron16j06s3p5gvp2jde4vh7w3ug3zz3m62zkyfu86s7ara5lafhp22p9wr3gz0lcdm3pvt7qx0aftu4 100000000 4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1 0 UnSpend test1

    > sendshieldedcoin null 0 1 0 null 0 1 ztron1hn9r3wmytavslztwmlzvuzk3dqpdhwcmda2d0deyu5pwv32dp78saaslyt82w0078y6uzfg8x6w 90000000 test2
    address ztron16j06s3p5gvp2jde4vh7w3ug3zz3m62zkyfu86s7ara5lafhp22p9wr3gz0lcdm3pvt7qx0aftu4
    ```

3. shielded address transfer to public address    
   **When in this mode,Some variables must be set as follows, publicFromAddress=null,fromAmount=0,shieldedInputNum=1,shieldedOutputNum=0**

    ```console
    > listshieldednote
    Unspend note list like:
    1 ztron1ghdy60hya8y72deu0q0r25qfl60unmue6889m3xfc3296a5ut6jcyafzhtp9nlutndukufzap4h 100000000 4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1 1 UnSpend
    2 ztron1hn9r3wmytavslztwmlzvuzk3dqpdhwcmda2d0deyu5pwv32dp78saaslyt82w0078y6uzfg8x6w 90000000 06b55fc27f7ec649396706d149d18a0bb003347bdd7f489e3d47205da9cee802 0 UnSpend test2

    > sendshieldedcoin null 0 1 2 TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ 80000000 0
    address ztron1hn9r3wmytavslztwmlzvuzk3dqpdhwcmda2d0deyu5pwv32dp78saaslyt82w0078y6uzfg8x6w
    ```

### sendshieldedcoinwithoutask

Usage and parameters are consistent with the command sendshieldedcoin, the only difference is that sendshieldedcoin uses ask signature, but sendshieldedcoinwithoutask uses ak signature.

### listshieldednote type

List the note scanned by the local cache address

type
> Shows the type of note. If the variable is 0, it shows all unspent notes; For other values, it shows all the notes, including spent notes and unspent notes.

Example:

    ```console
    > listshieldednote 0
    Unspend note list like:
    1 ztron1ghdy60hya8y72deu0q0r25qfl60unmue6889m3xfc3296a5ut6jcyafzhtp9nlutndukufzap4h 100000000 4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1 1 UnSpend
    listshieldednote 1
    All note list like:
    ztron1ghdy60hya8y72deu0q0r25qfl60unmue6889m3xfc3296a5ut6jcyafzhtp9nlutndukufzap4h 100000000 4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1 1 UnSpend
    ztron16j06s3p5gvp2jde4vh7w3ug3zz3m62zkyfu86s7ara5lafhp22p9wr3gz0lcdm3pvt7qx0aftu4 100000000 4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1 0 Spend test1
    ztron1hn9r3wmytavslztwmlzvuzk3dqpdhwcmda2d0deyu5pwv32dp78saaslyt82w0078y6uzfg8x6w 90000000 06b55fc27f7ec649396706d149d18a0bb003347bdd7f489e3d47205da9cee802 0 Spend test2
    ```

### resetshieldednote

Clean all the note scanned, rescanned all blocks.generally used when there is a problem with the notes or when switching environments

### ScanNotebyIvk ivk startNum endNum

Scan notes by ivk

ivk
> The ivk of shielded address

startNum
> The starting block number of the scan

endNum
> The end block number of the scan

Example:

     > scannotebyivk d2a4137cecf049965c4183f78fe9fc9fbeadab6ab3ef70ea749421b4c6b8de04 500 1499

### ScanNotebyOvk ovk startNum endNum

Scan notes by ovk

ovk
> the ivk of shielded address

startNum
> The starting block number of the scan

endNum
> The end block number of the scan

Example:

    > scannotebyovk a5b06ef3067855d741f966d54dfa1c124548535107333336bd9552a427f0529e 500 1499

### GetShieldedNullifier index

Get the nullifier of the note

index
> The note index obtained by the listshieldednote command

Example:

    ```console
    > listshieldednote
    Unspend note list like:
    2 ztron1ghdy60hya8y72deu0q0r25qfl60unmue6889m3xfc3296a5ut6jcyafzhtp9nlutndukufzap4h 100000000 4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1 1 UnSpend
    getshieldednullifier 2
    address ztron1ghdy60hya8y72deu0q0r25qfl60unmue6889m3xfc3296a5ut6jcyafzhtp9nlutndukufzap4h
    value 100000000
    rcm 07ed5471098652ad441575c61868d1e11317de0f73cbb743a4c5cfe78e3d150c
    trxId 4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1
    index 1
    memo
    ShieldedNullifier:2a524a3be2643365ecdacf8f0d3ca1de8fad3080eea0b9561435b5d1ee467042
    ```

### ScanAndMarkNotebyAddress shieldedAddress startNum endNum

Scan the note with a locally cached shielded address and mark whether it is spent out

shieldedAddress
> Locally cached shielded address, if it is not a locally cached shielded address, an error will be reported.

startNum
> The starting block number of the scan

endNum
> The end block number of the scan

Example:

    > ScanAndMarkNotebyAddress ztron16j06s3p5gvp2jde4vh7w3ug3zz3m62zkyfu86s7ara5lafhp22p9wr3gz0lcdm3pvt7qx0aftu4 500 1500

### GetSpendingKey

Generate a sk

Example:

    ```console
    > GetSpendingKey
    0eb458b309fa544066c40d80ce30a8002756c37d2716315c59a98c893dbb5f6a
    ```

### getExpandedSpendingKey sk

Generate ask, nsk, ovk from sk

Example:

    ```console
    > getExpandedSpendingKey 0eb458b309fa544066c40d80ce30a8002756c37d2716315c59a98c893dbb5f6a
    ask:252a0f6f6f0bac114a13e1e663d51943f1df9309649400218437586dea78260e
    nsk:5cd2bc8d9468dbad26ea37c5335a0cd25f110eaf533248c59a3310dcbc03e503
    ovk:892a10c1d3e8ea22242849e13f177d69e1180d1d5bba118c586765241ba2d3d6
    ```

### getAkFromAsk ask
Generate ak from ask

Example:

    ```console
    > GetAkFromAsk 252a0f6f6f0bac114a13e1e663d51943f1df9309649400218437586dea78260e
    ak:f1b843147150027daa5b522dd8d0757ec5c8c146defd8e01b62b34cf917299f1
    ```

### getNkFromNsk nsk

Generate nk from nsk

Example:

    ```console
    > GetNkFromNsk 5cd2bc8d9468dbad26ea37c5335a0cd25f110eaf533248c59a3310dcbc03e503
    nk:ed3dc885049f0a716a4de8c08c6cabcad0da3c437202341aa3d9248d8eb2b74a
    ```

### getIncomingViewingKey ak[64] nk[64]

Generate ivk from ak and nk

Example:

    ```console
    > getincomingviewingkey f1b843147150027daa5b522dd8d0757ec5c8c146defd8e01b62b34cf917299f1 ed3dc885049f0a716a4de8c08c6cabcad0da3c437202341aa3d9248d8eb2b74a
    ivk:148cf9e91f1e6656a41dc9b6c6ee4e52ff7a25b25c2d4a3a3182d0a2cd851205
    ```

### GetDiversifier

Generate a diversifier

Example:

    ```console
    > GetDiversifier
    11db4baf6bd5d5afd3a8b5
    ```

### getshieldedpaymentaddress ivk[64] d[22]

Generate a shielded address from sk and d

Example:

    ```console
    GetShieldedPaymentAddress 148cf9e91f1e6656a41dc9b6c6ee4e52ff7a25b25c2d4a3a3182d0a2cd851205 11db4baf6bd5d5afd3a8b5
    pkd:65c11642115d386ed716b9cc06a3498e86e303d7f20d0869c9de90e31322ac15
    shieldedAddress:ztron1z8d5htmt6h26l5agk4juz9jzz9wnsmkhz6uucp4rfx8gdccr6leq6zrfe80fpccny2kp2cray8z
    ```

### BackupShieldedWallet

Back up one shielded address

Example:

    ```console
    wallet> BackUpShieldedWallet
    Please input your password for shielded wallet.
    password: 
    The 1th shielded address is ztron165gswmwecarmyph4x8jfrygezw78tejy3a8y5d9rxnlre7ju5q8jfsfe4qjerhfk0mmkzsx2t6t
    The 2th shielded address is ztron1hpd2aau0s55zaauu2dlnnu6umxcqz4wuhflu4p4uqpt9w0nqd88ucf036alw2zjfmclry4tnkf6
    The 3th shielded address is ztron19lgz39ja8dz427dt9qa8gpkpxanu05y09zplfzzwc640mlx74n4au3037nde3h6m7zsu5xgkrnn
    Please choose between 1 and 3
    2
    sk:0c2dcfde42a484ecfcf6e7a00a3c9484022674739f405845d8d75fd6d8619153
    d :b85aaef78f85282ef79c53
    BackupShieldedWallet successful !!!
    ```

### ImportShieldedWallet

Import one shielded address to local wallet

Example:

    ```console
    wallet> ImportShieldedWallet
    Please input your password for shielded wallet.
    password: 
    Please input shielded wallet hex string. such as 'sk d',Max retry time:3
    0b18ba69b7963d2ff47e69ac60c20dc30df34b221fa8960d7d61d68123999b8f  2fd028965d3b455579ab28
    Import shielded wallet hex string is : 
    sk:0b18ba69b7963d2ff47e69ac60c20dc30df34b221fa8960d7d61d68123999b8f
    d :2fd028965d3b455579ab28
    Import new shielded wallet address is: ztron19lgz39ja8dz427dt9qa8gpkpxanu05y09zplfzzwc640mlx74n4au3037nde3h6m7zsu5xgkrnn
    ImportShieldedWallet successful !!!
    wallet> 
    ```

### ShowShieldedAddressInfo

Display information about shielded addresses

Example:

    ```console
    > listshieldedaddress
    ShieldedAddress :
    ztron14t95p936cyev678f6l6xsejnyfzrrzfsg56jaxgp7fzxlsczc2l6866fzc4c8awfnrzy74svkrl
    ztron1v6tu4c760vs7m0h94t89m4jcxtuq0nxmag7eequc3c2rnee3sufllq8fjtvfff6y84x3zgcapwp
    ztron18vaszshuluufz64uesvzw6wtune90uwexzmsfwtgqq2mlydt4fhy0kz02k3vm2j8er7s5xuyujv
    > showshieldedaddressinfo ztron18vaszshuluufz64uesvzw6wtune90uwexzmsfwtgqq2mlydt4fhy0kz02k3vm2j8er7s5xuyujv
    The following variables are secret information, please don't show to other people!!!
    sk :0deebe55fe7e591803126b531d4fe7c0e3979a2fcadb5a7996f73a8e463231f8
    ivk:aa955c5798e3f611c72fa22842847810114dd5a860db272b2ef50cc8448ced00
    ovk:a1d00b6f761137e1d8b58e77d8685347137131317ba3671f644ffb64bc5baa94
    pkd:182769cbe4f257f1d930b704b9680015bf91abaa6e47d84f55a2cdaa47c8fd0a
    d  :3b3b0142fcff38916abccc
    > showshieldedaddressinfo ztron19lgz39ja8dz427dt9qa8gpkpxanu05y09zplfzzwc640mlx74n4au3037nde3h6m7zsu5xgkrnn
    pkd:3a7406c13767c7d08f2883f4884ec6aafdfcdeacebde45f1f4db98df5bf0a1ca
    d  :2fd028965d3b455579ab28 
    ```
## Command List

Following is a list of Tron Wallet-cli commands:
For more information on a specific command, just type the command on terminal when you start your Wallet.

    AddTransactionSign
    ApproveProposal
    AssetIssue
    BackupShieldedWallet
    BackupWallet
    BackupWallet2Base64
    BroadcastTransaction
    ChangePassword
    ClearContractABI
    Create2
    CreateAccount
    CreateProposal
    CreateWitness
    DeleteProposal
    DeployContract
    ExchangeCreate
    ExchangeInject
    ExchangeTransaction
    ExchangeWithdraw
    FreezeBalance
    GenerateAddress
    GenerateShieldedAddress
    GetAccount
    GetAccountNet
    GetAccountResource
    GetAddress
    GetAssetIssueByAccount
    GetAssetIssueById
    GetAssetIssueByName
    GetAssetIssueListByName
    GetBalance
    GetBlock
    GetBlockById
    GetBlockByLatestNum
    GetBlockByLimitNext
    GetChainParameters
    GetContract contractAddress
    GetDelegatedResource
    GetDelegatedResourceAccountIndex
    GetDiversifier
    GetExchange
    GetExpandedSpendingKey
    GetIncomingViewingKey
    GetNextMaintenanceTime
    GetShieldedNullifier
    GetSpendingKey
    GetProposal
    GetTotalTransaction
    GetTransactionApprovedList
    GetTransactionById
    GetTransactionCountByBlockNum
    GetTransactionInfoById
    GetTransactionsFromThis
    GetTransactionsToThis
    GetTransactionSignWeight
    ImportShieldedWallet
    ImportWallet
    ImportWalletByBase64
    ListAssetIssue
    ListAssetIssuePaginated
    ListExchanges
    ListExchangesPaginated
    ListNodes
    ListShieldedAddress
    ListShieldedNote
    ListProposals
    ListProposalsPaginated
    ListWitnesses
    Login
    Logout
    LoadShieldedWallet
    ParticipateAssetIssue
    RegisterWallet
    ResetShieldedNote
    ScanAndMarkNotebyAddress
    ScanNotebyIvk
    ScanNotebyOvk
    SendCoin
    SendShieldedCoin
    SendShieldedCoinWithoutAsk
    SetAccountId
    ShowShieldedAddressInfo
    TransferAsset
    TriggerContract
    TriggerConstantContract
    UnfreezeAsset
    UnfreezeBalance
    UpdateAccount
    UpdateAsset
    UpdateEnergyLimit
    UpdateSetting
    UpdateWitness
    UpdateAccountPermission
    VoteWitness
    WithdrawBalance
    Exit or Quit

Type any one of the listed commands, to display how-to tips.
