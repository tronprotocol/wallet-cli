# Wallet-cli

Welcome to use the Wallet-cli.  

Wallet-cli now supports GasFree features, enabling users to perform token transfers without incurring direct gas fees. For more details, please check the [GasFree](#GasFree-Support) section below.

The underlying implementation of all Wallet-cli gRPC APIs has all migrated to the [Trident SDK](https://github.com/tronprotocol/trident). This strategic move consolidates the underlying implementation of the Wallet-cli's remote procedure calls, standardizing them under the robust and optimized Trident framework. 

If you need any help, please join the [Telegram](https://t.me/TronOfficialDevelopersGroupEn).

## Get started

### Download Wallet-cli

    git clone https://github.com/tronprotocol/wallet-cli.git

### Edit config.conf in src/main/resources

```
net {
 type = mainnet
}

fullnode = {
  ip.list = [
    "fullnode ip : port"
  ]
}

#soliditynode = {
#  //The IPs in this list can only be totally set to solidity.
#  ip.list = [
#     "ip : solidity port" // default solidity
#  ]
#  // NOTE: solidity node is optional
#}

# open ledger debug
# ledger_debug = true

# To use the lock and unlock function of the login account, it is necessary to configure
# lockAccount = true in the config.conf. The current login account is locked, which means that
# signatures and transactions are not allowed. After the current login account is locked, it can be
# unlocked. By default, it will be unlocked again after 300 seconds. Unlocking can specify
# parameters in seconds.

# lockAccount = true

# To use the gasfree feature, please first apply for an APIkey and apiSecret.
# For details, please refer to
# https://docs.google.com/forms/d/e/1FAIpQLSc5EB1X8JN7LA4SAVAG99VziXEY6Kv6JxmlBry9rUBlwI-GaQ/viewform
gasfree = {
  mainnet = {
     apiKey = ""
     apiSecret = ""
  }
  testnet = {
     apiKey = ""
     apiSecret = ""
  }
}

# If gRPC requests on the main network are limited in speed, you can apply for an apiKey of Trongrid to improve the user experience
grpc = {
  mainnet = {
    apiKey = ""
  }
}

```

### Run a web wallet

- connect to fullNode

    Take a look at: [java-tron deployment](https://tronprotocol.github.io/documentation-en/developers/deployment/)
    Run fullNode on either your local PC or a remote server.

- compile and run web wallet

    ```console
    $ cd wallet-cli
    $ ./gradlew build
    $ cd build/libs
    $ java -jar wallet-cli.jar
    ```

### Connect to Java-tron

Wallet-cli connects to Java-tron via the gRPC protocol, which can be deployed locally or remotely. Check **Run a web Wallet** section.
We can configure Java-tron node IP and port in ``src/main/resources/config.conf``, so that wallet-cli server can successfully talk to java-tron nodes.
Besides that, you can simply use `SwitchNetwork` command to switch among the mainnet, testnets(Nile and Shasta) and custom networks. Please refer to the Switch Network section.

## Wallet-cli supported command list

Following is a list of Tron Wallet-cli commands:
For more information on a specific command, just type the command in the terminal when you start your Wallet.

|     [AddTransactionSign](#How-to-use-the-multi-signature-feature-of-wallet-cli)     |         [ApproveProposal](#Approve--disapprove-a-proposal)          |                         [AssetIssue](#Issue-trc10-tokens)                         |
|:-----------------------------------------------------------------------------------:|:-------------------------------------------------------------------:|:---------------------------------------------------------------------------------:|
|                      [BackupWallet](#Wallet-related-commands)                       |           [BackupWallet2Base64](#Wallet-related-commands)           |                       [BroadcastTransaction](#Some-others)                        |
|                       [CancelAllUnfreezeV2](#How-to-freezev2)                       |             [ChangePassword](#Wallet-related-commands)              |                      [ClearContractABI](#clear-contract-abi)                      |
|                    [ClearWalletKeystore](#clear-wallet-keystore)                    |                  [CreateAccount](#create-account)                   |                      [CreateProposal](#Initiate-a-proposal)                       |
|                          [CreateWitness](#create-witness)                           |                         [Create2](#create2)                         |                        [CurrentNetwork](#current-network)                         |
|                        [DelegateResource](#How-to-freezev2)                         |            [DeleteProposal](#Delete-an-existed-proposal)            |                   [DeployContract](#How-to-use-smart-contract)                    |
|                         [EstimateEnergy](#estimate-energy)                          |           [ExchangeCreate](#How-to-trade-on-the-exchange)           |                  [ExchangeInject](#How-to-trade-on-the-exchange)                  |
|                [ExchangeTransaction](#How-to-trade-on-the-exchange)                 |          [ExchangeWithdraw](#How-to-trade-on-the-exchange)          |              [ExportWalletKeystore](#export-import-wallet-keystore)               |
|                 [ExportWalletMnemonic](#import-and-export-mnemonic)                 |                 [FreezeBalance](#Delegate-resource)                 |                        [FreezeBalanceV2](#How-to-freezev2)                        |
|                            [GasFreeInfo](#gas-free-info)                            |                   [GasFreeTrace](#gas-free-trace)                   |                       [GasFreeTransfer](#gas-free-transfer)                       |
|                    [GenerateAddress](#Account-related-commands)                     |             [GenerateSubAccount](#generate-sub-account)             |                      [GetAccount](#Account-related-commands)                      |
|                     [GetAccountNet](#Account-related-commands)                      |           [GetAccountResource](#Account-related-commands)           |                      [GetAddress](#Account-related-commands)                      |
|          [GetAssetIssueByAccount](#How-to-obtain-trc10-token-information)           |     [GetAssetIssueById](#How-to-obtain-trc10-token-information)     |           [GetAssetIssueByName](#How-to-obtain-trc10-token-information)           |
|          [GetAssetIssueListByName](#How-to-obtain-trc10-token-information)          |            [GetAvailableUnfreezeCount](#How-to-freezev2)            |                      [GetBalance](#Account-related-commands)                      |
|               [GetBandwidthPrices](#Get-resource-prices-and-memo-fee)               |              [GetBlock](#How-to-get-block-information)              |                   [GetBlockById](#How-to-get-block-information)                   |
|                 [GetBlockByIdOrNum](#How-to-get-block-information)                  |        [GetBlockByLatestNum](#How-to-get-block-information)         |               [GetBlockByLimitNext](#How-to-get-block-information)                |
|                             [GetBrokerage](#Brokerage)                              |             [GetCanDelegatedMaxSize](#How-to-freezev2)              |                 [GetCanWithdrawUnfreezeAmount](#How-to-freezev2)                  |
|                     [GetChainParameters](#get-chain-parameters)                     |           [GetContract](#Get-details-of-a-smart-contract)           |                 [GetContractInfo](#get-info-of-a-smart-contract)                  |
|                  [GetDelegatedResource](#How-to-delegate-resource)                  |    [GetDelegatedResourceAccountIndex](#How-to-delegate-resource)    |              [GetDelegatedResourceAccountIndexV2](#How-to-freezev2)               |
|                     [GetDelegatedResourceV2](#How-to-freezev2)                      |        [GetEnergyPrices](#Get-resource-prices-and-memo-fee)         |                        [GetExchange](#get-exchange-by-id)                         |
|            [GetMarketOrderByAccount](#How-to-use-tron-dex-to-sell-asset)            |      [GetMarketOrderById](#How-to-use-tron-dex-to-sell-asset)       |          [GetMarketOrderListByPair](#How-to-use-tron-dex-to-sell-asset)           |
|               [GetMarketPairList](#How-to-use-tron-dex-to-sell-asset)               |     [GetMarketPriceByPair](#How-to-use-tron-dex-to-sell-asset)      |                  [GetMemoFee](#Get-resource-prices-and-memo-fee)                  |
|                       [GetNextMaintenanceTime](#Some-others)                        |             [GetProposal](#Obtain-proposal-information)             |                              [GetReward](#Brokerage)                              |
| [GetTransactionApprovedList](#How-to-use-the-multi-signature-feature-of-wallet-cli) |      [GetTransactionById](#How-to-get-transaction-information)      |       [GetTransactionCountByBlockNum](#How-to-get-transaction-information)        |
|         [GetTransactionInfoByBlockNum](#How-to-get-transaction-information)         |    [GetTransactionInfoById](#How-to-get-transaction-information)    | [GetTransactionSignWeight](#How-to-use-the-multi-signature-feature-of-wallet-cli) |
|                      [ImportWallet](#Wallet-related-commands)                       |          [ImportWalletByBase64](#Wallet-related-commands)           |             [ImportWalletByKeystore](#export-import-wallet-keystore)              |
|                  [ImportWalletByLedger](#import-wallet-by-ledger)                   |        [ImportWalletByMnemonic](#import-and-export-mnemonic)        |             [ListAssetIssue](#How-to-obtain-trc10-token-information)              |
|               [ListAssetIssuePaginated](#list-asset-issue-paginated)                |           [ListExchanges](#How-to-trade-on-the-exchange)            |              [ListExchangesPaginated](#How-to-trade-on-the-exchange)              |
|                              [ListNodes](#Some-others)                              |            [ListProposals](#Obtain-proposal-information)            |              [ListProposalsPaginated](#Obtain-proposal-information)               |
|                            [ListWitnesses](#Some-others)                            |            [Login](#Command-line-operation-flow-example)            |                              [LoginAll](#login-all)                               |
|                                  [Logout](#logout)                                  |                            [Lock](#lock)                            |              [MarketCancelOrder](#How-to-use-tron-dex-to-sell-asset)              |
|                [MarketSellAsset](#How-to-use-tron-dex-to-sell-asset)                | [ParticipateAssetIssue](#Participating-in-the-issue-of-trc10-token) |                    [RegisterWallet](#Wallet-related-commands)                     |
|                            [ResetWallet](#reset-wallet)                             |  [SendCoin](#How-to-use-the-multi-signature-feature-of-wallet-cli)  |                          [SetAccountId](#set-account-id)                          |
|                          [SwitchNetwork](#switch-network)                           |                   [SwitchWallet](#switch-wallet)                    |                      [TransferAsset](#Trc10-token-transfer)                       |
|                [TriggerConstantContract](#trigger-constant-contract)                |             [TriggerContract](#trigger-smart-contract)              |                      [UnDelegateResource](#How-to-freezev2)                       |
|                       [UnfreezeAsset](#Unfreeze-trc10-token)                        |            [UnfreezeBalance](#How-to-delegate-resource)             |                       [UnfreezeBalanceV2](#How-to-freezev2)                       |
|                                  [Unlock](#unlock)                                  |                  [UpdateAccount](#update-account)                   | [UpdateAccountPermission](#How-to-use-the-multi-signature-feature-of-wallet-cli)  |
|                  [UpdateAsset](#Update-parameters-of-trc10-token)                   |                    [UpdateBrokerage](#Brokerage)                    |              [UpdateEnergyLimit](#Update-smart-contract-parameters)               |
|                 [UpdateSetting](#Update-smart-contract-parameters)                  |                  [UpdateWitness](#update-witness)                   |                            [VoteWitness](#How-to-vote)                            |
|                        [WithdrawBalance](#withdraw-balance)                         |         [WithdrawExpireUnfreeze](#withdraw-expire-unfreeze)         |                                                                                   |


Type any one of the listed commands, to display how-to tips.

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
> The amount of frozen funds, the unit is Sun.
> The minimum value is **1000000 Sun(1TRX)**.

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

## Brokerage

After voting for the witness, you will receive the rewards. The witness has the right to decide the ratio of brokerage. The default ratio is 20%, and the witness can adjust it.

By default, if a witness is rewarded, he will receive 20% of the whole rewards, and 80% of the rewards will be distributed to his voters.

### GetBrokerage

View the ratio of brokerage of the witness.

    > getbrokerage OwnerAddress

OwnerAddress
> The address of the witness's account, it is a base58check type address.

### GetReward

Query unclaimed reward.

    > getreward OwnerAddress

OwnerAddress
> The address of the voter's account, it is a base58check type address.

### UpdateBrokerage

Update the ratio of brokerage, this command is usually used by a witness account.

    > updateBrokerage OwnerAddress brokerage

OwnerAddress
> The witness's account address is a base58check type address.

brokerage
> The ratio of brokerage you want to update, from 0 to 100. If the input is 10, it means 10% of the total reward would be distributed to the SR and the rest would be rewarded to all the voters, which is 90% in this case

For example:

```console
> getbrokerage TZ7U1WVBRLZ2umjizxqz3XfearEHhXKX7h  

> getreward  TNfu3u8jo1LDWerHGbzs2Pv88Biqd85wEY

> updateBrokerage TZ7U1WVBRLZ2umjizxqz3XfearEHhXKX7h 30
```

### withdraw balance

> WithdrawBalance [owner_address]

Withdraw voting or block rewards.

Example:

```console
> WithdrawBalance TEDapYSVvAZ3aYH7w8N9tMEEFKaNKUD5Bp
```

## How to calculate bandwidth

The bandwidth calculation rule is:

    constant * FrozenFunds * days

Assuming freeze 1TRX（1_000_000 Sun), 3 days, bandwidth obtained = 1 * 1_000_000 * 3 = 3_000_000.

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

### create witness
> CreateWitness [owner_address] url
Apply to become a super representative candidate.

Example:
```console
> CreateWitness TEDapYSVvAZ3aYH7w8N9tMEEFKaNKUD5Bp 007570646174654e616d6531353330363038383733343633
```

### update witness
> UpdateWitness
Edit the URL of the SR's official website.

Example:
```console
> UpdateWitness TEDapYSVvAZ3aYH7w8N9tMEEFKaNKUD5Bp 007570646174654e616d6531353330363038383733343633
```

## How to create account

You can create accounts by transferring funds to non-existing accounts or initiating a transaction to create an account using the **CreateAccount** command.
Transferring to a non-existent account has minimum restriction amount of **1TRX**.
Creating an account through the CreateAccount command will still burn **1TRX**.


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
priKey = 1234567890123456789012345678901234567890123456789012345678901234  # backup it!!! (BackupWallet2Base64 option)
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

## How to issue a TRC10 token

Each account can only issue **ONE** TRC10 token.

### Issue TRC10 tokens

> AssetIssue [OwnerAddress] AssetName AbbrName TotalSupply TrxNum AssetNum Precision StartDate EndDate Description Url FreeNetLimitPerAccount PublicFreeNetLimit FrozenAmount0 FrozenDays0 [...] FrozenAmountN FrozenDaysN

OwnerAddress (optional)
> The address of the account which initiated the transaction. 
> Default: the address of the login account.

AssetName
> The name of the issued TRC10 token

AbbrName
> The abbreviation of TRC10 token

TotalSupply
> TotalSupply = Account Balance of Issuer + All Frozen Token Amount
> TotalSupply: Total Issuing Amount
> Account Balance Of Issuer: At the time of issuance
> All Frozen Token Amount: Before asset transfer and the issuance

TrxNum, AssetNum
>  These two parameters determine the exchange rate when the token is issued.
> Exchange Rate = TrxNum / AssetNum
> AssetNum: Unit in base unit of the issued token
> TrxNum: Unit in SUN (0.000001 TRX)

Precision
> Precision to how many decimal places  

FreeNetLimitPerAccount
> The maximum amount of bandwidth each account is allowed to use. Token issuers can freeze TRX to obtain bandwidth (TransferAssetContract only)

PublicFreeNetLimit
> The maximum total amount of bandwidth which is allowed to use for all accounts. Token issuers can freeze TRX to obtain bandwidth (TransferAssetContract only)

StartDate, EndDate
> The start and end date of token issuance. Within this period time, other users can participate in token issuance.

FrozenAmount0 FrozenDays0
> Amount and days of token freeze. 
> FrozenAmount0: Must be bigger than 0
> FrozenDays0: Must be between 1 and 3653.

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

Specific meaning of the parameters is the same as that of AssetIssue.

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

### TRC10 token transfer

> TransferAsset [OwnerAddress] ToAddress AssertID Amount

OwnerAddress (optional)
> The address of the account which initiated the transaction. 
> Default: the address of the login account.

ToAddress
> Address of the target account

AssertName
> TRC10 token ID
> Example: 1000001

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

### Participating in the issue of TRC10 token

    > ParticipateAssetIssue [OwnerAddress] ToAddress AssetID Amount

OwnerAddress (optional)
> The address of the account which initiated the transaction. 
> Default: the address of the login account.

ToAddress
> Account address of TRC10 issuers

AssertName
> TRC10 token ID
> Example: 1000001

Amount
> The number of TRC10 token to transfers

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
### list asset issue paginated

> ListAssetIssuePaginated address code salt

Query the list of all the tokens by pagination.Returns a list of Tokens that succeed the Token located at offset.

Example:

```console
> ListAssetIssuePaginated 0 1
```

### Unfreeze TRC10 token

To unfreeze all TRC10 token which are supposed to be unfrozen after the freezing period.

    > unfreezeasset [OwnerAddress]

## How to obtain TRC10 token information

ListAssetIssue
> Obtain all of the published TRC10 token information

GetAssetIssueByAccount
> Obtain TRC10 token information based on issuing address

GetAssetIssueById
> Obtain TRC10 token Information based on ID

GetAssetIssueByName
> Obtain TRC10 token Information based on names

GetAssetIssueListByName
> Obtain a list of TRC10 token information based on names

## How to operate with proposal

Any proposal-related operations, except for viewing operations, must be performed by committee members.

### Initiate a proposal

    > createProposal [OwnerAddress] id0 value0 ... idN valueN

OwnerAddress (optional)
> The address of the account which initiated the transaction. 
> Default: the address of the login account.

id0
> The serial number of the parameter. Every parameter of TRON network has a serial number. Please refer to "http://tronscan.org/#/sr/committee" 

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

### Approve / Disapprove a proposal

    > approveProposal [OwnerAddress] id is_or_not_add_approval

OwnerAddress (optional)
> The address of the account which initiated the transaction. 
> Default: the address of the login account.

id
> ID of the initiated proposal
> Example: 1

is_or_not_add_approval
> true for approve; false for disapprove

Example:

```console
> ApproveProposal 1 true  # in favor of the offer
> ApproveProposal 1 false  # Cancel the approved proposal
```

### Delete an existed proposal

    > deleteProposal [OwnerAddress] proposalId

proposalId
> ID of the initiated proposal
> Example: 1

The proposal must be canceled by the supernode that initiated the proposal.

Example：

    > DeleteProposal 1

### Obtain proposal information

ListProposals
> Obtain a list of initiated proposals

ListProposalsPaginated
> Use the paging mode to obtain the initiated proposal

GetProposal
> Obtain proposal information based on the proposal ID

## How to trade on the exchange

The trading and price fluctuations of trading pairs are in accordance with the Bancor Agreement,
which can be found in TRON's [related documents](https://tronprotocol.github.io/documentation-en/clients/wallet-cli-command/#dex).

### Create a trading pair

> exchangeCreate [OwnerAddress] first_token_id first_token_balance second_token_id second_token_balance

OwnerAddress (optional)
> The address of the account which initiated the transaction.
> Default: the address of the login account.

First_token_id, first_token_balance
> ID and amount of the first token

second_token_id, second_token_balance
> ID and amount of the second token
>
> The ID is the ID of the issued TRC10 token. 
> If it is TRX, the ID is "_". 
> The amount must be greater than 0, and less than 1,000,000,000,000,000.

Example:

> exchangeCreate 1000001 10000 _ 10000
    # Create trading pairs with the IDs of 1000001 and TRX, with amount 10000 for both.

### get exchange by id
> getExchange
Query exchange pair based on id (Confirmed state).

Example:

```console
> getExchange 1
```

### Capital injection

> exchangeInject [OwnerAddress] exchange_id token_id quant

OwnerAddress (optional)
> The address of the account which initiated the transaction.
> Default: the address of the login account.

exchange_id
> The ID of the trading pair to be funded

token_id, quant
> TokenId and quantity (unit in base unit) of capital injection

When conducting a capital injection, depending on its quantity (quant), a proportion
of each token in the trading pair will be withdrawn from the account, and injected into the trading
pair. Depending on the difference in the balance of the transaction, the same amount of money for
the same token would vary.

### Transactions

> exchangeTransaction [OwnerAddress] exchange_id token_id quant expected

OwnerAddress (optional)
> The address of the account which initiated the transaction.
> Default: the address of the login account.

exchange_id
> ID of the trading pair

token_id, quant
> The ID and quantity of tokens being exchanged, equivalent to selling

expected
> Expected quantity of another token

expected must be less than quant, or an error will be reported.

Example：

> ExchangeTransaction 1 1000001 100 80

It is expected to acquire the 80 TRX by exchanging 1000001 from the trading pair ID of 1, and the amount is 100.(Equivalent to selling an amount of 100 tokenID - 1000001, at a price of 80 TRX, in trading pair ID - 1).

### Capital Withdrawal

> exchangeWithdraw [OwnerAddress] exchange_id token_id quant

OwnerAddress (optional)
> The address of the account which initiated the transaction.
> Default: the address of the login account.

Exchange_id

> 
The ID of the trading pair to be withdrawn

Token_id, quant
> TokenId and quantity (unit in base unit) of capital withdrawal

When conducting a capital withdrawal, depending on its quantity (quant), a proportion of each token
in the transaction pair is withdrawn from the trading pair, and injected into the account. Depending on the difference in the balance of the transaction, the same amount of money for the same token would vary.

### Obtain information on trading pairs

ListExchanges
> List trading pairs

ListExchangesPaginated
> List trading pairs by page

## How to use the multi-signature feature of wallet-cli?

Multi-signature allows other users to access the account in order to better manage it. There are
three types of accesses:

- owner: access to the owner of account
- active: access to other features of accounts, and access that authorizes a certain feature. Block production authorization is not included if it's for witness purposes.
- witness: only for witness, block production authorization will be granted to one of the other users.

The rest of the users will be granted

```console
> Updateaccountpermission TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ {"owner_permission":{"type":0,"permission_name":"owner","threshold":1,"keys":[{"address":"TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ","weight":1}]},"witness_permission":{"type":1,"permission_name":"owner","threshold":1,"keys":[{"address":"TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ","weight":1}]},"active_permissions":[{"type":2,"permission_name":"active12323","threshold":2,"operations":"7fff1fc0033e0000000000000000000000000000000000000000000000000000","keys":[{"address":"TNhXo1GbRNCuorvYu5JFWN3m2NYr9QQpVR","weight":1},{"address":"TKwhcDup8L2PH5r6hxp5CQvQzZqJLmKvZP","weight":1}]}]}
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
will be notified with “Send 10000000000000000 Sun to TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW
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

token_value
> Number of TRX10

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

### trigger smart contract

> TriggerContract [ownerAddress] contractAddress method args isHex fee_limit value token_value token_id

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

contractAddress
> Smart contract address

method
> The name of function and parameters, please refer to the example

args
> Parameter value, if you want to call `receive`, pass '#' instead

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

### trigger constant contract

> TriggerConstantContract [ownerAddress] contractAddress method args isHex fee_limit value token_value token_id

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

contractAddress
> Smart contract address

method
> The name of function and parameters, please refer to the example

args
> Parameter value, if you want to call `receive`, pass '#' instead

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
> TriggerConstantContract TSNEe5Tf4rnc9zPMNXfaTF5fZfHDDH8oyW TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs "balanceOf(address)" 000000000000000000000000a614f803b6fd780986a42c78ec9c7f77e6ded13c true
```

### clear contract abi

> ClearContractABI  [ownerAddress] contractAddress

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

contractAddress
> Contract address

Example:

```console
> ClearContractABI TSNEe5Tf4rnc9zPMNXfaTF5fZfHDDH8oyW TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs
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
### get info of a smart contract

> GetContractInfo contractAddress

contractAddress
> smart contract address

Example:

```console
> GetContractInfo TGdtALTPZ1FWQcc5MW7aK3o1ASaookkJxG
```

### update smart contract parameters

> UpdateEnergyLimit [ownerAddress] contract_address energy_limit  # Update parameter energy_limit
> UpdateSetting [ownerAddress] contract_address consume_user_resource_percent  # Update parameter consume_user_resource_percent

### create2

> Create2 address code salt

Predict the contract address generated after deploying a contract. Among them, address is the contract address for executing the create 2 instruction, code is the bytecode of the contract to be deployed, and salt is a random salt value.

Example:

```console
> Create2 TEDapYSVvAZ3aYH7w8N9tMEEFKaNKUD5Bp 5f805460ff1916600190811790915560649055606319600255 2132
```

### estimate-energy

> EstimateEnergy owner_address(use # if you own) contract_address method args isHex [value token_value token_id(e.g: TRXTOKEN, use # if don't provided)]

Estimate the energy required for the successful execution of smart contract transactions. (Confirmed state).

Example:

```console
> EstimateEnergy TSNEe5Tf4rnc9zPMNXfaTF5fZfHDDH8oyW TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs "balanceOf(address)" 000000000000000000000000a614f803b6fd780986a42c78ec9c7f77e6ded13c true
```

## How to delegate resource

### delegate resource

    > freezeBalance [OwnerAddress] frozen_balance frozen_duration [ResourceCode:0 BANDWIDTH, 1 ENERGY] [receiverAddress]

The latter two parameters are optional parameters. If not set, the TRX is frozen to obtain
resources for its own use; if it is not empty, the acquired resources are used by receiverAddress.

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

frozen_balance
> The amount of frozen TRX, the unit is the smallest unit (Sun), the minimum is 1000000sun.

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


## How to freezev2

### freezev2/unfreezev2 resource

    > freezeBalanceV2 [OwnerAddress] frozen_balance [ResourceCode:0 BANDWIDTH,1 ENERGY,2 TRON_POWER]

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

frozen_balance
> The amount of frozen, the unit is the smallest unit (Sun), the minimum is 1000000sun.

ResourceCode
> 0 BANDWIDTH;1 ENERGY

Example:
```console
wallet> FreezeBalanceV2 TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh 1000000000000000 0
txid is 82244829971b4235d98a9f09ba67ddb09690ac2f879ad93e09ba3ec1ab29177d
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

    > unfreezeBalanceV2 [OwnerAddress] unfreezeBalance ResourceCode(0 BANDWIDTH,1 ENERGY,2 TRON_POWER)

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

unfreezeBalance
> The amount of unfreeze, the unit is the smallest unit (Sun)

ResourceCode
> 0 BANDWIDTH;1 ENERGY

Example:
```console
wallet> UnFreezeBalanceV2 TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh 9000000 0
txid is dcfea1d92fc928d24c88f7f71a03ae8105d0b5b112d6d48be93d3b9c73bea634
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

### delegate/undelegate resource

    > delegateResource [OwnerAddress] balance ResourceCode(0 BANDWIDTH,1 ENERGY), ReceiverAddress [lock]

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

balance
> The amount of delegate, the unit is the smallest unit (Sun), the minimum is 1000000sun.

ResourceCode
> 0 BANDWIDTH;1 ENERGY

ReceiverAddress
> The address of the account

lock
> default is false, set true if need lock delegate for 3 days

Example:
```console
wallet> DelegateResource TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh 10000000 0 TQ4gjjpAjLNnE67UFbmK5wVt5fzLfyEVs3 true
txid is 363ac0b82b6ad3e0d3cad90f7d72b3eceafe36585432a3e013389db36152b6ed
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

    > unDelegateResource [OwnerAddress] balance ResourceCode(0 BANDWIDTH,1 ENERGY), ReceiverAddress

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

balance
> The amount of unDelegate, the unit is the smallest unit (Sun)

ResourceCode
> 0 BANDWIDTH;1 ENERGY

ReceiverAddress
> The address of the account

Example:
```console
wallet> UnDelegateResource TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh 1000000 0 TQ4gjjpAjLNnE67UFbmK5wVt5fzLfyEVs3
txid is feb334794cf361fd351728026ccf7319e6ae90eba622b9eb53c626cdcae4965c
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
### withdraw expire unfreeze
> withdrawExpireUnfreeze [OwnerAddress]

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

Example:
```console
wallet> withdrawexpireunfreeze TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh
txid is e5763ab8dfb1e7ed076770d55cf3c1ddaf36d75e23ec8330f99df7e98f54a147
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
> cancelAllUnfreezeV2 [OwnerAddress]

OwnerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

Example:
```console
wallet> cancelAllUnfreezeV2 TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh
txid is e5763ab8dfb1e7ed076770d55cf3c1ddaf36d75e23ec8330f99df7e98f54a147
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

### get resource delegation information use v2 API

    > getDelegatedResourceV2 fromAddress toAddress
> get the information from the fromAddress to the toAddress resource delegate use v2 API

fromAddress
> The address of the account that start the delegate

toAddress
> The address of the account that receive the delegate

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

    > getDelegatedResourceAccountIndexV2 address
> get the information that address is delegated to other account resources use v2 API

address
> The address of the account that start the delegate or receive the delegate

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

    > getcandelegatedmaxsize ownerAddress type
> get the max size that the ownerAddress can delegate use delegateResource

ownerAddress
> The address of the account that start the delegate, optional, default is the address of the login account.

type
> 0 bandwidth, 1 energy

Example:
```console
wallet> getCanDelegatedMaxSize TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh 0
{
	"max_size": 999999978708334
}
```

    > getavailableunfreezecount ownerAddress
> get the available unfreeze count that the ownerAddress can call unfreezeBalanceV2

ownerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

Example:
```console
wallet> getAvailableUnfreezeCount TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh
{
	"count": 31
}
```

    > getcanwithdrawunfreezeamount ownerAddress timestamp
> get the withdraw unfreeze amount that the ownerAddress can get by  withdrawexpireunfreeze 

ownerAddress
> The address of the account that initiated the transaction, optional, default is the address of the login account.

timestamp
> get can withdraw unfreeze amount until timestamp,


Example:
```console
wallet> getCanWithdrawUnfreezeAmount TJAVcszse667FmSNCwU2fm6DmfM5D4AyDh 1671100335000
{
	"amount": 9000000
}
```
## Get resource prices and memo fee
    > getbandwidthprices
> get historical unit price of bandwidth

Example:
```console
wallet> getBandwidthPrices
{
    "prices": "0:10,1606537680000:40,1614238080000:140,1626581880000:1000,1626925680000:140,1627731480000:1000"
}
```
    > getenergyprices
> get historical unit price of energy

Example:
```console
wallet> getEnergyPrices
{
    "prices": "0:100,1575871200000:10,1606537680000:40,1614238080000:140,1635739080000:280,1681895880000:420"
}
```
    > getmemofee
> get memo fee

Example:
```console
wallet> getMemoFee
{
    "prices": "0:0,1675492680000:1000000"
}
```

### get chain parameters

> GetChainParameters

Show all parameters that the blockchain committee can set.
Example:

```console
> GetChainParameters
```

## import and export mnemonic
    >ImportWalletByMnemonic
>Import wallet, you need to set a password, mnemonic

Example:
```console
wallet> ImportWalletByMnemonic
Please input password.
password:
Please input password again.
password:
Please enter 12 words (separated by spaces) [Attempt 1/3]:
```

> ExportWalletMnemonic
>export mnemonic of the address in the wallet

Example:
```console
wallet> ExportWalletMnemonic
Please input your password.
password:
exportWalletMnemonic successful !!
a*ert tw*st co*rect mat*er pa*s g*ther p*t p*sition s*op em*ty coc*nut aband*n
```

## generate sub account
    >GenerateSubAccount
>generate subaccount using the mnemonic in the wallet

Example:
```console
wallet> GenerateSubAccount  
Please input your password.  
password:  

=== Sub Account Generator ===  
-----------------------------  
Default Address: TYEhEg7b7tXm92UDbRDXPtJNU6T9xVGbbo  
Default Path: m/44'/195'/0'/0/1  
-----------------------------  

1. Generate Default Path  
2. Change Account  
3. Custom Path  

Enter your choice (1-3): 1  
mnemonic file : ./Mnemonic/TYEhEg7b7tXm92UDbRDXPtJNU6T9xVGbbo.json  
Generate a sub account successful, keystore file name is TYEhEg7b7tXm92UDbRDXPtJNU6T9xVGbbo.json  
generateSubAccount successful.  
```
## clear wallet keystore
    >ClearWalletKeystore
>clear wallet keystore of the login account

Example:
```console
wallet> ClearWalletKeystore 

Warning: Dangerous operation!
This operation will permanently delete the Wallet&Mnemonic files of the Address: TABWx7yFhWrvZHbwKcCmFLyPLWjd2dZ2Rq
Warning: The private key and mnemonic words will be permanently lost and cannot be recovered!
Continue? (y/Y to proceed):y

Final confirmation:
Please enter: 'DELETE' to confirm the delete operation:
Confirm: (DELETE): DELETE

File deleted successfully:
- /wallet-cli/Wallet/TABWx8yFhWrvZHbwKcCmFLyPLWjd2dZ2Rq.json
- /wallet-cli/Mnemonic/TABWx8yFhWrvZHbwKcCmFLyPLWjd2dZ2Rq.json
ClearWalletKeystore successful !!!
```
## export import wallet keystore
    >ExportWalletKeystore
>export the wallet keystore to the format of tronlink wallet

Example:
```console
wallet> ExportWalletKeystore tronlink /tmp
Please input your password.
password:
exported keystore file : /tmp/TYdhEg8b7tXm92UDbRDXPtJNU6T9xVGbbo.json
exportWalletKeystore successful !!
```
    >ImportWalletByKeystore
>import the keystore file of tronlink wallet to wallet-cli 

Example:
```console
wallet> ImportWalletByKeystore tronlink /tmp/tronlink.json
Please input password.
password:
Please input password again.
password:
fileName = TYQq6zp51unQDNELmT4xKMWh5WLcwpCDZJ.json
importWalletByKeystore successful !!
```
## import wallet by ledger
    >ImportWalletByLedger
>import the derived account of ledger to wallet-cli

Example:
```console
wallet> ImportWalletByLedger
((Note:This will pair Ledger to user your hardward wallet)
Only one Ledger device is supported. If you have multiple devices, please ensure only one is connected.
Ledger device found: Nano X
Please input password.
password:
Please input password again.
password:
-------------------------------------------------
Default Account Address: TAT1dA8F9HXGqmhvMCjxCKAD29YxDRw81y
Default Path: m/44'/195'/0'/0/0
-------------------------------------------------
1. Import Default Account
2. Change Path
3. Custom Path
Select an option: 1
Import a wallet by Ledger successful, keystore file : ./Wallet/Ledger-TAT1dA8F9HXGqmhvMCjxCKAD29YxDRw81y.json
You are now logged in, and you can perform operations using this account.
```
## login all
> LoginAll
>Multiple Keystore accounts can be logged in with a unified password

Example:
```console
wallet> loginall
Please input your password.
password: 
Use user defined config file in current dir
WalletApi getRpcVsersion: 2
[========================================] 100%
The 1th keystore file name is TJEEKTmaVTYSpJAxahtyuofnDSpe2seajB.json
The 2th keystore file name is TX1L9xonuUo1AHsjUZ3QzH8wCRmKm56Xew.json
The 3th keystore file name is TVuVqnJFuuDxN36bhEbgDQS7rNGA5dSJB7.json
The 4th keystore file name is Ledger-TRvVXgqddDGYRMx3FWf2tpVxXQQXDZxJQe.json
The 5th keystore file name is TYXFDtn86VPFKg4mkwMs45DKDcpAyqsada.json
Please choose between 1 and 5
5
LoginAll  successful !!!
```

## logout
> Logout
> Log out of the current wallet account.

Example:
```console
wallet> Logout
Logout  successful !!!
```

## lock
> Lock
>To use the lock function of the login account, it is necessary to configure **lockAccount = true** in the **config.conf**.
The current login account is locked, which means that signatures and transactions are not allowed.

Example:
```console
wallet> lock
lock  successful !!!
```

## unlock
> Unlock
>To use the unlock function of the login account, it is necessary to configure **lockAccount = true** in the **config.conf**.
After the current login account is locked, it can be unlocked. By default, it will be unlocked again after 300 seconds. Unlocking can specify parameters in seconds.

Example:
```console
wallet> unlock 60
Please input your password.
password: 
unlock  successful !!!
```

## switch network
    > SwitchNetwork
>This command allows for flexible network switching at any time. Unlocking can specify parameters in seconds.
>`switchnetwork local` will switch to the network configured in local config.conf.

Example:
```console
wallet> switchnetwork
Please select network：
1. MAIN
2. NILE
3. SHASTA
Enter numbers to select a network (1-3):1
Now, current network is : MAIN
SwitchNetwork  successful !!!
```
```console
wallet> switchnetwork main
Now, current network is : MAIN
SwitchNetwork  successful !!!
```

```console
wallet> switchnetwork empty localhost:50052
Now, current network is : CUSTOM
SwitchNetwork  successful !!!
```

## current network
    > CurrentNetwork
>View current network.

Example:
```console
wallet> currentnetwork
currentNetwork: NILE
```

```console
wallet> currentnetwork
current network: CUSTOM
fullNode: EMPTY, solidityNode: localhost:50052
```
## Gas Free Support

Wallet-cli now supports GasFree integration. This guide explains the new commands and provides instructions on how to use them.

For more details, please refer to  [GasFree Documentation](https://gasfree.io/specification) and [TronLink User Guide For GasFree](https://support.tronlink.org/hc/en-us/articles/38903684778393-GasFree-User-Guide).

Prerequisites
API Credentials: Users must obtain the API Key and API Secret from GasFree for authentication. Please refer to the official [application form](https://docs.google.com/forms/d/e/1FAIpQLSc5EB1X8JN7LA4SAVAG99VziXEY6Kv6JxmlBry9rUBlwI-GaQ/viewform) for instructions on setting up API authentication.

New Commands:

### Gas Free info
> GasFreeInfo
Query GasFree Information
Function: Retrieve the basic info, including the GasFree address associated with your current wallet address.
Note: The GasFree address is automatically activated upon the first transfer, which may incur an activation fee.

Example:
```console
wallet> gasfreeinfo
balanceOf(address):70a08231
{
	"gasFreeAddress":"TCtSt8fCkZcVdrGpaVHUr6P8EmdjysswMF",
	"active":true,
	"tokenBalance":998696000,
	"activateFee":0,
	"transferFee":2000,
	"maxTransferValue":998694000
}
gasFreeInfo:  successful !!
```

```console
wallet> gasfreeinfo TRvVXgqddDGYRMx3FWf2tpVxXQQXDZxJQe
balanceOf(address):70a08231
{
	"gasFreeAddress":"TCtSt8fCkZcVdrGpaVHUr6P8EmdjysswMF",
	"active":true,
	"tokenBalance":998696000,
	"activateFee":0,
	"transferFee":2000,
	"maxTransferValue":998694000
}
gasFreeInfo:  successful !!
```
### Gas Free transfer
> GasFreeTransfer
Submit GasFree Transfer
Function: Submit a gas-free token transfer request.

Example:
```console
wallet> gasfreetransfer TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT 100000

GasFreeTransfer result: {
	"code":200,
	"data":{
		"amount":100000,
		"providerAddress":"TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E",
		"apiKey":"",
		"accountAddress":"TUUSMd58eC3fKx3fn7whxJyr1FR56tgaP8",
		"signature":"",
		"targetAddress":"TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT",
		"maxFee":2000000,
		"version":1,
		"nonce":8,
		"tokenAddress":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
		"createdAt":1747909635678,
		"expiredAt":1747909695000,
		"estimatedTransferFee":2000,
		"id":"6c3ff67e-0bf4-4c09-91ca-0c7c254b01a0",
		"state":"WAITING",
		"estimatedActivateFee":0,
		"gasFreeAddress":"TNER12mMVWruqopsW9FQtKxCGfZcEtb3ER",
		"updatedAt":1747909635678
	}
}
GasFreeTransfer  successful !!!
```

### Gas Free trace
> GasFreeTrace
Track Transfer Status
Function: Check the progress of a GasFree transfer using the traceId obtained from GasFreeTransfer.

Example:
```console
wallet> gasfreetrace 6c3ff67e-0bf4-4c09-91ca-0c7c254b01a0
GasFreeTrace result: {
	"code":200,
	"data":{
		"amount":100000,
		"providerAddress":"TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E",
		"txnTotalCost":102000,
		"accountAddress":"TUUSMd58eC3fKx3fn7whxJyr1FR56tgaP8",
		"txnActivateFee":0,
		"estimatedTotalCost":102000,
		"targetAddress":"TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT",
		"txnBlockTimestamp":1747909638000,
		"txnTotalFee":2000,
		"nonce":8,
		"estimatedTotalFee":2000,
		"tokenAddress":"TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
		"txnHash":"858f9a00776163b1f8a34467b9c5727657f8971a9f4e9d492f0a247fac0384f9",
		"txnBlockNum":57175988,
		"createdAt":1747909635678,
		"expiredAt":1747909695000,
		"estimatedTransferFee":2000,
		"txnState":"ON_CHAIN",
		"id":"6c3ff67e-0bf4-4c09-91ca-0c7c254b01a0",
		"state":"CONFIRMING",
		"estimatedActivateFee":0,
		"gasFreeAddress":"TNER12mMVWruqopsW9FQtKxCGfZcEtb3ER",
		"txnTransferFee":2000,
		"txnAmount":100000
	}
}
GasFreeTrace:  successful!!
```

## switch wallet
    > SwitchWallet
>After logging in with the LoginAll command, you can switch wallets

Example:
```console
wallet> switchwallet
The 1th keystore file name is TJEEKTmaVTYSpJAxahtyuofnDSpe2seajB.json
The 2th keystore file name is TX1L9xonuUo1AHsjUZ3QzH8wCRmKm56Xew.json
The 3th keystore file name is TVuVqnJFuuDxN36bhEbgDQS7rNGA5dSJB7.json
The 4th keystore file name is Ledger-TRvVXgqddDGYRMx3FWf2tpVxXQQXDZxJQe.json
The 5th keystore file name is TYXFDtn86VPFKg4mkwMs45DKDcpAyqsada.json
Please choose between 1 and 5
5
SwitchWallet  successful !!!
```

## reset wallet
    > ResetWallet
>Use the resetWallet command to delete all local wallet's Keystore files and mnemonic files, and guide you to re register or import the wallet through prompts

Example:
```console
wallet> resetwallet
User defined config file doesn't exists, use default config file in jar

Warning: Dangerous operation!
This operation will permanently delete the Wallet&Mnemonic files 
Warning: The private key and mnemonic words will be permanently lost and cannot be recovered!
Continue? (y/Y to proceed, c/C to cancel): 
y

Final confirmation:
Please enter: 'DELETE' to confirm the delete operation:
Confirm: (DELETE): DELETE
resetWallet  successful !!!
Now, you can RegisterWallet or ImportWallet again. Or import the wallet through other means.
```

## create account
> CreateAccount
>This command can create a new account with an inactive address and burn a 1-trx handling fee for it

Example:
```console
wallet> createaccount TDJ13zZzT3w91WMBm98gC3mwL7NbA6sQPA
{
	"raw_data":{
		"contract":[
			{
				"parameter":{
					"value":{
						"owner_address":"TQLaB7L8o3ikjRVcN7tTjMZsRYPJ23XZbd",
						"account_address":"TDJ13zZzT3w91WMBm98gC3mwL7NbA6sQPA"
					},
					"type_url":"type.googleapis.com/protocol.AccountCreateContract"
				},
				"type":"AccountCreateContract"
			}
		],
		"ref_block_bytes":"91a4",
		"ref_block_hash":"2bfcd3bb597f3d40",
		"expiration":1745333676000,
		"timestamp":1745333618318
	},
	"raw_data_hex":"0a0291a422082bfcd3bb597f3d4040e0cff9efe5325a6612640a32747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e4163636f756e74437265617465436f6e7472616374122e0a15419d9c2bb5ee381a4396dd49ce42292e756b2e5e4b12154124764e4674179d4578cfc4c833c1ac1a09f6ce56708e8df6efe532"
}
Before sign transaction hex string is 0a84010a0291a422082bfcd3bb597f3d4040e0cff9efe5325a6612640a32747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e4163636f756e74437265617465436f6e7472616374122e0a15419d9c2bb5ee381a4396dd49ce42292e756b2e5e4b12154124764e4674179d4578cfc4c833c1ac1a09f6ce56708e8df6efe532
Please confirm and input your permission id, if input y/Y means default 0, other non-numeric characters will cancel transaction.
y
Please choose your key for sign.
The 1th keystore file name is TJEEKTmaVTYSpJAxahtyuofnDSpe2seajB.json
The 2th keystore file name is TX1L9xonuUo1AHsjUZ3QzH8wCRmKm56Xew.json
The 3th keystore file name is TVuVqnJFuuDxN36bhEbgDQS7rNGA5dSJB7.json
The 4th keystore file name is Ledger-TRvVXgqddDGYRMx3FWf2tpVxXQQXDZxJQe.json
The 5th keystore file name is TYXFDtn86VPFKg4mkwMs45DKDcpAyqsada.json
Please choose between 1 and 5
1
After sign transaction hex string is 0a84010a0291a422082bfcd3bb597f3d404083bd9cfae5325a6612640a32747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e4163636f756e74437265617465436f6e7472616374122e0a15419d9c2bb5ee381a4396dd49ce42292e756b2e5e4b12154124764e4674179d4578cfc4c833c1ac1a09f6ce56708e8df6efe5321241ce53add4f75fe1838aa7e0a4e2411b3bbfce1d2164d68dac18507ed87e22ae503f65592a1161640834b3c0cef43c28f20b2d335120cc78b6f745a82ea95e451100
TxId is 26d6fcdfdc0018097ec4166eb140e19ebd597bea2212579d2f6d921b0ad6e56f
CreateAccount  successful !!
```

### set account id

> SetAccountId [owner_address] account_id

Sets a custom unique identifier (Account ID) for an account.

Example:

```console
> SetAccountId TEDapYSVvAZ3aYH7w8N9tMEEFKaNKUD5Bp 100
```

### update account

> UpdateAccount [owner_address] account_name

Modify account name.

Example:

```console
> UpdateAccount test-name
```


## Wallet related commands

**RegisterWallet**
> Register your wallet, you need to set the wallet password and generate the address and private key.

**BackupWallet**
> Back up your wallet, you need to enter your wallet password and export the private key.hex string format, such
as: 1234567890123456789012345678901234567890123456789012345678901234

**BackupWallet2Base64**
> Back up your wallet, you need to enter your wallet password and export the private key.base64 format, such as: ch1jsHTxjUHBR+BMlS7JNGd3ejC28WdFvEeo6uUHZUU=

**ChangePassword**
> Modify the password of an account

**ImportWallet**
> Import wallet, you need to set a password, hex String format

**ImportWalletByBase64**
> Import wallet, you need to set a password, base64 format

## Account related commands

**GenerateAddress**
> Generate an address and print out the address and private key

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

**GetTransactionInfoByBlockNum**
> Get the list of transaction information in the block based on the block height

## How to get block information

**GetBlock**
> Get the block according to the block number; if you do not pass the parameter, get the latest block

**GetBlockById**
> Get block based on blockID

**GetBlockByIdOrNum**
> Get blocks based on their ID or block height. If no parameters are passed, Get the header block.

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

## How to use tron-dex to sell asset

### MarketSellAsset

Create an order to sell asset    

> MarketSellAsset owner_address sell_token_id sell_token_quantity buy_token_id buy_token_quantity  

ownerAddress
> The address of the account that initiated the transaction

sell_token_id, sell_token_quantity
> ID and amount of the token want to sell

buy_token_id, buy_token_quantity
> ID and amount of the token want to buy

Example: 

```console
MarketSellAsset TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW  1000001 200 _ 100    

Get the result of the contract execution with the getTransactionInfoById command:   
getTransactionInfoById 10040f993cd9452b25bf367f38edadf11176355802baf61f3c49b96b4480d374   

{
	"id": "10040f993cd9452b25bf367f38edadf11176355802baf61f3c49b96b4480d374",
	"blockNumber": 669,
	"blockTimeStamp": 1578983493000,
	"contractResult": [
		""
	],
	"receipt": {
		"net_usage": 264
	}
} 
```

### GetMarketOrderByAccount

Get the order created by account(just include active status)

> GetMarketOrderByAccount ownerAddress

ownerAddress
> The address of the account that created market order

Example:

```console
GetMarketOrderByAccount TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW   
{
	"orders": [
		{
			"order_id": "fc9c64dfd48ae58952e85f05ecb8ec87f55e19402493bb2df501ae9d2da75db0",
			"owner_address": "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
			"create_time": 1578983490000,
			"sell_token_id": "_",
			"sell_token_quantity": 100,
			"buy_token_id": "1000001",
			"buy_token_quantity": 200,
			"sell_token_quantity_remain": 100
		}
	]
}  
```

### GetMarketOrderById

Get the specific order by order_id

> GetMarketOrderById orderId

Example:  

```console
GetMarketOrderById fc9c64dfd48ae58952e85f05ecb8ec87f55e19402493bb2df501ae9d2da75db0   
{
	"order_id": "fc9c64dfd48ae58952e85f05ecb8ec87f55e19402493bb2df501ae9d2da75db0",
	"owner_address": "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
	"create_time": 1578983490000,
	"sell_token_id": "_",
	"sell_token_quantity": 100,
	"buy_token_id": "1000001",
	"buy_token_quantity": 200,
}
```

### GetMarketPairList

Get market pair list

Example:

```console
GetMarketPairList   
{
	"orderPair": [
		{
			"sell_token_id": "_",
			"buy_token_id": "1000001"
		}
	]
}
```

### GetMarketOrderListByPair

Get order list by pair   

> GetMarketOrderListByPair sell_token_id buy_token_id   

sell_token_id
> ID of the token want to sell      

buy_token_id
> ID of the token want to buy

Example: 

```console
GetMarketOrderListByPair _ 1000001   
{
	"orders": [
		{
			"order_id": "fc9c64dfd48ae58952e85f05ecb8ec87f55e19402493bb2df501ae9d2da75db0",
			"owner_address": "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
			"create_time": 1578983490000,
			"sell_token_id": "_",
			"sell_token_quantity": 100,
			"buy_token_id": "1000001",
			"buy_token_quantity": 200,
			"sell_token_quantity_remain": 100
		}
	]
}
```

### GetMarketPriceByPair

Get market price by pair   

> GetMarketPriceByPair sell_token_id buy_token_id   

sell_token_id
> ID of the token want to sell

buy_token_id
> ID of the token want to buy

Example:   

```console
GetMarketPriceByPair _ 1000001   
{
	"sell_token_id": "_",
	"buy_token_id": "1000001",
	"prices": [
		{
			"sell_token_quantity": 100,
			"buy_token_quantity": 200
		}
	]
}
```

### MarketCancelOrder

Cancel the order   

> MarketCancelOrder owner_address order_id  

owner_address
> the account address who have created the order

order_id
> the order id which want to cancel 

Example:   

```console
MarketCancelOrder TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW fc9c64dfd48ae58952e85f05ecb8ec87f55e19402493bb2df501ae9d2da75db0  
```

Get the result of the contract execution with the getTransactionInfoById command:  
```console
getTransactionInfoById b375787a098498623403c755b1399e82910385251b643811936d914c9f37bd27   
{
	"id": "b375787a098498623403c755b1399e82910385251b643811936d914c9f37bd27",
	"blockNumber": 1582,
	"blockTimeStamp": 1578986232000,
	"contractResult": [
		""
	],
	"receipt": {
		"net_usage": 283
	}
}
```
