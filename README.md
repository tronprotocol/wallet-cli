# wallet-cli [![Build Status](https://travis-ci.org/tronprotocol/wallet-cli.svg?branch=master)](https://travis-ci.org/tronprotocol/wallet-cli)  

Wallet CLI

[gitter](https://gitter.im/tronprotocol/wallet-cli)  

Download wallet-cli
---------------------------------
git clone https://github.com/tronprotocol/wallet-cli.git


Edit config.conf in src/main/resources
----------------------------------------
```
net {
 type = mainnet
 #type = testnet 
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
}//note: solidity node is optional

```
Build and run wallet-cli by command line
----------------------------------------
Create a new command line terminal window.

```
cd wallet-cli  
./gradlew build      
./gradlew run
```

Build and run web wallet
----------------------------------------
```
cd wallet-cli  
./gradlew build
cd build/libs
java -jar wallet-cli.jar
```


How wallet-cli connects to java-tron :
--------------------------------------
Wallet-cli connect to java-tron by grpc protocol.          
Java-tron nodes can be deployed locally or remotely.          
We can set the connected java-tron node IP in config.conf of wallet-cli.
 

Wallet-cli supported command list:
----------------------------------

RegisterWallet  
RegisterWallet Password
Register a wallet in local.
Generate a pair of ecc keys.
Derive a AES Key by password and then use the AES algorithm to encrypt and save the private key.
The account address is calculated by the public key sha3-256, and taking the last 20 bytes.
All subsequent operations that require the use of a private key must enter the password.

ImportWallet  
ImportwalletByBase64  
ChangePassword  
Login  
Logout  
BackupWallet  
BackupWallet2Base64  
Getaddress  
GetBalance  
GetAccount  
GetAssetissueByAccount                          
GetAssetIssueByName                       
SendCoin  
TransferAsset  
ParticipateAssetissue  
Assetissue  
CreateWitness  
VoteWitness  
FreezeBalance
UnfreezeBalance
WithdrawBalance
Listaccounts  
Listwitnesses  
Listassetissue    
listNodes               
GetAssetIssueByName   
Getblock
UpdateAccount  
Exit or Quit  
help  

Input any one of them, you will get more tips.


How to freeze/unfreeze balance
----------------------------------

After the funds are frozen, the corresponding number of shares and bandwidth will be obtained.
 Shares can be used for voting and bandwidth can be used for trading.
 The rules for the use and calculation of share and bandwidth are described later in this article.


**Freeze operation is as follows：**

```
freezeBalance amount time energy/bandwidth address
```

*amount:The amount of frozen funds，the unit is drop.
The minimum value is **1000000 drop(1TRX)**.*

*time：Freeze time, this value is currently only allowed for **3 days***


For example：
```
freezeBalance 100000000 3 1 address
```


After the freeze operation,frozen funds will be transferred from Account Balance to Frozen,
You can view frozen funds from your account information.
After being unfrozen, it is transferred back to Balance by Frozen, and the frozen funds cannot be used for trading.


When more share or bandwidth is needed temporarily, additional funds may be frozen to obtain additional share and bandwidth.
The unfrozen time is postponed until 3 days after the last freeze operation

After the freezing time expires, funds can be unfroze.


**Unfreeze operation is as follows：**
```
unfreezebalance password 
```



How to vote
----------------------------------

Voting requires share. Share can be obtained by freezing funds.

- The share calculation method is: **1** unit of share can be obtained for every **1TRX** frozen. 
- After unfreezing, previous vote will expire. You can avoid the invalidation of the vote by re-freezing and voting.

**Note:** The Tron Network only records the status of your last vote, which means that each of your votes will cover all previous voting results.

For example：

```
freezeBalance 100000000 3 1 address  // Freeze 10TRX and acquire 10 units of shares

votewitness 123455 witness1 4 witness2 6   // Cast 4 votes for witness1 and 6 votes for witness2 at the same time.

votewitness 123455 witness1 10   // Voted 10 votes for witness1.
```

The final result of the above command was 10 votes for witness1 and 0 votes for witness2.



How to calculate bandwidth
----------------------------------

The bandwidth calculation rule is：
```
constant * FrozenFunds * days
```
Assuming freeze 1TRX（1_000_000 DROP），3 days，bandwidth obtained = 1* 1_000_000 * 3 = 3_000_000. 

Any contract needs to consume bandwidth, including transfer, transfer of assets, voting, freezing, etc. 
The query does not consume bandwidth, and each contract needs to consume **100_000 bandwidth**. 

If the previous contract exceeds a certain time (**10s**), this operation does not consume bandwidth. 

When the unfreezing operation occurs, the bandwidth is not cleared. 
The next time the freeze is performed, the newly added bandwidth is accumulated.


How to withdraw balance
----------------------------------

After each block is produced, the block award is sent to the account's allowance, 
and an withdraw operation is allowed every **24 hours** from allowance to balance. 
The funds in allowance cannot be locked or traded.
 

How to create witness
----------------------------------
Applying to become a witness account needs to consume **100_000TRX**.
This part of the funds will be burned directly.


How to create account
----------------------------------
It is not allowed to create accounts directly. You can only create accounts by transferring funds to non-existing accounts.
Transfer to a non-existent account with a minimum transfer amount of **1TRX**.

Command line operation flow example
-----------------------------------      

cd wallet-cli  
./gradlew build      
./gradlew run                                                                               
RegisterWallet 123456      (password = 123456)                                                        
login 123456                                                                                           
getAddress                 (Print 'address = f286522619d962e6f93235ca27b2cb67a9e5c27b', backup it)                                                       
BackupWallet 123456        (Print 'priKey = 22be575f19b9ac6e94c7646a19a4c89e06fe99e2c054bd242c0af2b6282a65e9', backup it) (BackupWallet2Base64 option)                                                    
getbalance                 (Print 'Balance = 0')                                                                                                                                          
 
getbalance                                                             
          
assetIssue 123456 testAssetIssue00001 10000000000000000 1 100 2018-4-1 2018-4-30 1 just-test https://github.com/tronprotocol/wallet-cli/                   
getaccount  f286522619d962e6f93235ca27b2cb67a9e5c27b                                                                        
(Print balance: 9999900000                                                                          
asset {                                                                                                     
  key: "testAssetIssue00001"                                                                           
  value: 10000000000000000                                                                             
})                                                                                                       
(cost trx 1000 trx for assetIssue)                                                                    
(You can query the trx balance and other asset balances for any account )                                                
TransferAsset 123456 649DDB4AB82D558AD6809C7AB2BA43D1D1054B3F testAssetIssue00001 10000    

How to issue TRC10 tokens
-------------------------
Each account can only issue one TRC10 token.     
a. Issue TRC10 tokens        
AssetIssue AssetName TotalSupply TrxNum AssetNum Precision StartDate EndDate Description Url 
FreeNetLimitPerAccount PublicFreeNetLimit FrozenAmount0 FrozenDays0 ... FrozenAmountN FrozenDaysN   
AssetName: 				The name of the issued TRC10 token      
TotalSupply:			Total issuing amount = account balance of the issuer at the time of 
issuance + all the frozen amount, before asset transfer and the issuance.     
TrxNum,AssetNum:		these two parameters determine the exchange rate between the issued token
 and the minimum unit of TRX (sun) when the token is issued.    
FreeNetLimitPerAccount:	The maximum amount of bandwidth an account is allowed to use. Token 
issuers can freeze TRX to obtain bandwidth (TransferAssetContract only)   
PublicFreeNetLimit:		The maximum amount of bandwidth issuing accounts are allowed user. Token 
issuers can freeze REX to obtain bandwidth (TransferAssetContract only).   
StartDate,EndDate:		The start and end date of token issuance. Within this period time, other 
users can participate in token issuance.     
FrozenAmount0 FrozenDays0:	Amount and time of token freeze. FrozenAmount0 must be bigger than 0,
 FrozenDays0 must be bigger than 1 and smaller than 3653.     
Example:   
AssetIssue TestTRX 100000 1 1 2 "2019-04-04 11:48:00" "2019-04-05" "just for test" www.test.com 
100 100000 10000 10 10000 1     
View published information:    
GetAssetIssueByAccount TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ     
11:50:02.688 INFO  [main] [Client](Client.java: 361)     
assetIssue 0 :::   
[   
Id: 1000001   
Owner_address: TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ   
Name: TestTRX   
Order: 0   
Total_supply: 100000   
Trx_num: 1   
Num: 1   
Precision 2   
Start_time: Thu Apr 04 11:48:00 CST 2019   
End_time: Fri Apr 05 00:00:00 CST 2019   
Vote_score: 0   
Description: just for test   
Url: www.test.com   
Free asset net limit: 100   
Public free asset net limit: 100000   
Public free asset net usage: 0   
Public latest free net time: 0   
Frozen_supply   
{   
  Amount: 10000   
  Frozen_days: 1    
}   
Frozen_supply    
{   
  Amount: 10000    
  Frozen_days: 10    
}   
]   
 
b. Update parameters of TRC10 token    
UpdateAsset FreeNetLimitPerAccount PublicFreeNetLimit Description Url   
Specific meaning of the parameters is the same with that of AssetIssue   
Example:   
UpdateAsset 1000 1000000 "change description" www.changetest.com    
View the modified information:   
GetAssetIssueByAccount TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ   
11:52:16.677 INFO  [main] [Client](Client.java: 361)    
assetIssue 0 :::  
[  
Id: 1000001   
Owner_address: TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ   
Name: TestTRX   
Order: 0   
Total_supply: 100000   
Trx_num: 1   
Num: 1   
Precision 2   
Start_time: Thu Apr 04 11:48:00 CST 2019   
End_time: Fri Apr 05 00:00:00 CST 2019    
Vote_score: 0   
description: change description    
url: www.changetest.com   
Free asset net limit: 1000   
public free asset net limit: 1000000   
Public free asset net usage: 0   
public latest free net time: 0   
Frozen_supply  
{   
  Amount: 10000   
  Frozen_days: 1   
}   
Frozen_supply    
{   
  Amount: 10000    
  Frozen_days: 10    
}   
]   
  
c. TRC10 transfer    
TransferAsset ToAddress AssertName Amount    
ToAddress:				Address of the target account     
AssertName:				TRC10 id, 1000001 in the example    
Amount:                 The number of TRC10 token to transfer       
Example:  
TransferAsset TN3zfjYUmMFK3ZsHSsrdJoNRtGkQmZLBLz 1000001 1000    
View target account information after the transfer:    
getaccount TN3zfjYUmMFK3ZsHSsrdJoNRtGkQmZLBLz  
11:54:33.118 INFO  [main] [Client](Client.java:260)      
address: TN3zfjYUmMFK3ZsHSsrdJoNRtGkQmZLBLz     
...   
assetV2   
{   
  id: 1000001    
  balance: 1000    
  latest_asset_operation_timeV2: null    
  free_asset_net_usageV2: 0    
}    
...    
}    
    
d. Participating in the issue of TRC10   
ParticipateAssetIssue ToAddress AssetName Amount    
ToAddress:				Account address of Token 10 issuers     
AssertName:				TRC10 ID,1000001 in the example    
Amount:                 The number of TRC10 token to transfers	    		
It must happen during the release of Token 10, otherwise an error may occur    
Example:    
ParticipateAssetIssue TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ 1000001 1000    
View remaining balance:    
getaccount TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW    
11:59:57.558 INFO  [main] [Client](Client.java:260)     
address: TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW    
...    
assetV2    
{    
  id: 1000001    
  balance: 1000    
  latest_asset_operation_timeV2: null    
  free_asset_net_usageV2: 0    
}    
...    
}    
    
e. unfreeze TRC10 token    
It must be unfrozen after the freezing period, unfreeze Token10, which has stopped being frozen.    
UnfreezeAsset    
    
f. Obtain information about Token 10    
ListAssetIssue			Obtain all of the published Token 10 information     
GetAssetIssueByAccount	Obtain Token10 information according to the issuing address    
GetAssetIssueById		Obtain Token10 Information based on ID    
GetAssetIssueByName		Obtain Token10 Information based on names 	    
GetAssetIssueListByName	Get list information on Token10 based on names     

    
How to initiate a proposal
--------------------------
Any proposal-related operations, except for viewing operations, must be performed by committee 
members.     
a. Initiate a proposal    
createProposal id0 value0 ... idN valueN    
id0:					the serial number of the parameter. Every parameter of TRON network has a
 serial number. Go to "http://tronscan.org/#/sr/committee" to see the specifics  
Value0:                 the modified value
In the example, modification No.4 (modifying token issuance fee) costs 1000TRX as follows:      
createProposal 4 1000    
View initiated proposal:     
listproposals    
12:20:50.288 INFO  [main] [Client](Client.java:1043)    
proposal 0 :::    
[    
id: 1    
state: PENDING    
createTime: 1554351564000    
expirationTime: 1554616800000    
parametersMap: {4=1000}    
approvalsList: [     
]]    
The corresponding id is 1    
     
b. Approve/cancel the proposal    
approveProposal id is_or_not_add_approval    
id:                         ID of the initiated proposal, 1 in the example    
is_or_not_add_approval:	    true for approve; false against    
Example:    
ApproveProposal 1 true              in favor of the offer    
ApproveProposal 1 false             Cancel the approved proposal    
    
c Cancel the created proposal    
DeleteProposal proposal ID    
proposalId ID of the initiated proposal, 1 in the example    
The proposal must be canceled by the supernode that initiated the proposal    
Example：    
DeleteProposal 1    
    
d Obtain proposal information    
ListProposals Obtain initiated proposals    
ListProposalsPaginated Use the paging mode to obtain the initiated proposal    
GetProposal Obtain proposal information based on the proposal ID    
    

How to trade on the exchange
----------------------------
The trading and price fluctuations of trading pairs are in accordance with the Bancor Agreement, 
which can be found in TRON's related documents.    
a Create a trading pair    
exchangeCreate first_token_id first_token_balance second_token_id second_token_balance    
First_token_id, first_token_balance:    ID and amount of the first token    
second_token_id, second_token_balance:  ID and amount of the second token    
The ID is the ID of the issued TRC10 token. If it is TRX, the ID is "_", the amount must be greater 
than 0, and less than 1,000,000,000,000,000.    
Example:    
exchangeCreate 1000001 10000 _ 10000    
Create trading pairs with the IDs of 1000001 and TRX, the amount is 10000 for both.    
    
b Capital injection    
exchangeInject exchange_id token_id quant    
exchange_id:    The ID of the transaction pair to be funded    
token_id,quant: TokenId and quantity of capital injection	   
When conducting capital injection, depending on the amount of capital injection, the proportion 
of each token in the transaction pair is deducted from the account and added to the transaction 
pair. Depending on the difference in the balance of the transaction, the same amount of money for
 the same token is different.    
    
c Transactions   
exchangeTransaction exchange_id token_id quant expected    
exchange_id:        ID of the transaction pair    
token_id, quant:    The ID and quantity of tokens being exchanged, equivalent to selling    
expected:           Expected quantity of another token     
The expected must be less than exchanged, otherwise, an error will be reported.    
Example：    
ExchangeTransaction 1 1000001 100 80    
It is expected to acquire the 80 TRX by exchanging 1000001 from the transaction pair ID of 1, and
 the amount is 100 (equivalent to selling token10, the ID is 1000001, the amount is 100).    
    
d Divestment    
exchangeWithdraw exchange_id token_id quant    
Exchange_id:    The ID of the transaction pair to be divested    
Token_id,quant: TokenId and quantity of divestment	    
When conducting divestment, depending on the amount of divestment, the proportion of each token 
in the transaction pair is deducted from the account and added to the transaction pair. Depending
 on the difference in the balance of the transaction, the same amount of money for the same token
  is different.    

e Obtain information on trading pairs    
ListExchanges               lists trading pairs    
ListexchangesPaginated      List trading pairs by page         
                                            

How to use the multi-signature feature of wallet-cli?   
-------------------------------
Multi-signature allows other users to access the account in order to better manage it. There are 
three types of accesses:  
owner: access to the owner of account        
active:	access to other features of accounts, and access that authorizes a certain feature
. Block production authorization is not included if it's for witness purposes.       
witness: only for witness, block production authorization will be granted to one of the 
other users.     


The rest of the users will be granted        
Updateaccountpermission TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ {"owner_permission":{"type":0,
"permission_name":"owner","threshold":1,"keys":[{"address":"TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ",
"weight":1}]},"witness_permission":{"type":1,"permission_name":"owner","threshold":1,
"keys":[{"address":"TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ","weight":1}]},
"active_permissions":[{"type":2,"permission_name":"active12323","threshold":2,
"operations":"7fff1fc0033e0000000000000000000000000000000000000000000000000000",
"keys":[{"address":"TNhXo1GbRNCuorvYu5JFWN3m2NYr9QQpVR","weight":1},
{"address":"TKwhcDup8L2PH5r6hxp5CQvQzZqJLmKvZP","weight":1}]}]}       
The account TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ gives the owner access to itself, active access to
 TNhXo1GbRNCuorvYu5JFWN3m2NYr9QQpVR and TKwhcDup8L2PH5r6hxp5CQvQzZqJLmKvZP. Active access will 
 need signatures from both accounts in order to take effect.  
If the account is not a witness, it's not necessary to set witness_permission, otherwise an error
 will occur.   
 
 
Signed transaction   
SendCoin TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW 10000000000000000    
will show "Please confirm and input your permission id, if input y or Y means default 0, other 
non-numeric characters will cancell transaction."     
This will require the transfer authorization of active access. Enter: 2     
Then select accounts and put in local password, i.e. TNhXo1GbRNCuorvYu5JFWN3m2NYr9QQpVR needs a 
private key TNhXo1GbRNCuorvYu5JFWN3m2NYr9QQpVR to sign a transaction.  
Select another account and enter the local password. i.e. TKwhcDup8L2PH5r6hxp5CQvQzZqJLmKvZP will
 need a private key of TKwhcDup8L2PH5r6hxp5CQvQzZqJLmKvZP to sign a transaction. 
The weight of each account is 1, threshold of access is 2. When the requirements are met, users 
will be notified with “Send 10000000000000000 drop to TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW 
successful !!”。  
This is how multiple accounts user multi-signature when using the same cli.   
Use the instruction addTransactionSign according to the obtained transaction hex string if 
signing at multiple cli. After signing, the users will need to broadcast final transactions 
manually.      
 
 
Obtain weight information according to transaction    
getTransactionSignWeight 
0a8c010a020318220860e195d3609c86614096eadec79d2d5a6e080112680a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412370a1541a7d8a35b260395c14aa456297662092ba3b76fc01215415a523b449890854c8fc460ab602df9f31fe4293f18808084fea6dee11128027094bcb8bd9d2d1241c18ca91f1533ecdd83041eb0005683c4a39a2310ec60456b1f0075b4517443cf4f601a69788f001d4bc03872e892a5e25c618e38e7b81b8b1e69d07823625c2b0112413d61eb0f8868990cfa138b19878e607af957c37b51961d8be16168d7796675384e24043d121d01569895fcc7deb37648c59f538a8909115e64da167ff659c26101      
The information displays as follows:          
14:56:30.574 INFO  [main] [Client](Client.java:1764) permission:   
{   
permission_type: Active   
permission_id: 2   
permission_name: active12323   
threshold: 2  
parent_id: 0  
operations: 7fff1fc0033e0000000000000000000000000000000000000000000000000000   
keys:  
[   
address: TNhXo1GbRNCuorvYu5JFWN3m2NYr9QQpVR  
weight: 1  
address: TKwhcDup8L2PH5r6hxp5CQvQzZqJLmKvZP  
weight: 1  
]  
}  
current_weight: 2  
result:  
{  
code: ENOUGH_PERMISSION  
}  
approved_list:  
[  
TKwhcDup8L2PH5r6hxp5CQvQzZqJLmKvZP  
TNhXo1GbRNCuorvYu5JFWN3m2NYr9QQpVR  
]  
transaction:  
{  
txid:   
7da63b6a1f008d03ef86fa871b24a56a501a8bbf15effd7aca635de6c738df4b   
raw_data:   
{  
ref_block_bytes: 0318   
ref_block_hash: 60e195d3609c8661   
contract:   
{   
contract 0 :::  
[  
contract_type: TransferContract   
owner_address: TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ  
to_address: TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW   
amount: 10000000000000000  
]  
  
}   
timestamp: Mon Apr 01 14:55:06 CST 2019   
fee_limit: 0   
}  
signature:   
{   
signature 0 
:c18ca91f1533ecdd83041eb0005683c4a39a2310ec60456b1f0075b4517443cf4f601a69788f001d4bc03872e892a5e25c618e38e7b81b8b1e69d07823625c2b01  
signature 1 
:3d61eb0f8868990cfa138b19878e607af957c37b51961d8be16168d7796675384e24043d121d01569895fcc7deb37648c59f538a8909115e64da167ff659c26101   
}  
}  
   
 
Get signature information according to transactions    
getTransactionApprovedList 
0a8c010a020318220860e195d3609c86614096eadec79d2d5a6e080112680a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412370a1541a7d8a35b260395c14aa456297662092ba3b76fc01215415a523b449890854c8fc460ab602df9f31fe4293f18808084fea6dee11128027094bcb8bd9d2d1241c18ca91f1533ecdd83041eb0005683c4a39a2310ec60456b1f0075b4517443cf4f601a69788f001d4bc03872e892a5e25c618e38e7b81b8b1e69d07823625c2b0112413d61eb0f8868990cfa138b19878e607af957c37b51961d8be16168d7796675384e24043d121d01569895fcc7deb37648c59f538a8909115e64da167ff659c26101      
14:57:37.807 INFO  [main] [Client](Client.java:1784) result:    
{    
code: SUCCESS   
}   
approved_list:   
[   
TKwhcDup8L2PH5r6hxp5CQvQzZqJLmKvZP  
TNhXo1GbRNCuorvYu5JFWN3m2NYr9QQpVR   
]   
transaction:  
{  
txid:    
7da63b6a1f008d03ef86fa871b24a56a501a8bbf15effd7aca635de6c738df4b   
raw_data:    
{   
ref_block_bytes: 0318   
ref_block_hash: 60e195d3609c8661   
contract:    
{    
contract 0 :::  
[   
contract_type: TransferContract   
owner_address: TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ   
to_address: TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW   
amount: 10000000000000000   
]  
   
}   
timestamp: Mon Apr 01 14:55:06 CST 2019  
fee_limit: 0   
}  
signature:    
{   
signature 0 
:c18ca91f1533ecdd83041eb0005683c4a39a2310ec60456b1f0075b4517443cf4f601a69788f001d4bc03872e892a5e25c618e38e7b81b8b1e69d07823625c2b01    
signature 1 
:3d61eb0f8868990cfa138b19878e607af957c37b51961d8be16168d7796675384e24043d121d01569895fcc7deb37648c59f538a8909115e64da167ff659c26101   
}   
}  

How to use smart contracts 
-------------------------- 
a deploy smart contracts   
DeployContract contractName ABI byteCode constructor params isHex fee_limit 
consume_user_resource_percent origin_energy_limit value token_value token_id <library:address,
library:address,...>   
contractName:					name of smart contract   
ABI:							Compile generated ABI code   
byteCode:						Compile generated byte code   
constructor,params,isHex: 		Define the format of the bytecode，which determines the way to 
parse byteCode from parameters   
fee_limit:						Transaction allows for the most consumed TRX   
consume_user_resource_percent:	Percentage of user resource consumed, in the range [0, 100]   
origin_energy_limit:			The most amount of developer Energy consumed by trigger contract 
once   
value:							The amount of trx transferred to the contract account   
token_value:					Number of TRX10   
token_id:						TRX10 Id   
Example:    
deployContract normalcontract544 [{"constant":false,"inputs":[{"name":"i","type":"uint256"}],
"name":"findArgsByIndexTest","outputs":[{"name":"z","type":"uint256"}],"payable":false,
"stateMutability":"nonpayable","type":"function"}] 
608060405234801561001057600080fd5b50610134806100206000396000f3006080604052600436106100405763ffffffff7c0100000000000000000000000000000000000000000000000000000000600035041663329000b58114610045575b600080fd5b34801561005157600080fd5b5061005d60043561006f565b60408051918252519081900360200190f35b604080516003808252608082019092526000916060919060208201838038833901905050905060018160008151811015156100a657fe5b602090810290910101528051600290829060019081106100c257fe5b602090810290910101528051600390829060029081106100de57fe5b6020908102909101015280518190849081106100f657fe5b906020019060200201519150509190505600a165627a7a72305820b24fc247fdaf3644b3c4c94fcee380aa610ed83415061ff9e65d7fa94a5a50a00029  # # false 1000000000 75 50000 0 0 #    
Get the result of the contract execution with the getTransactionInfoById command:  
getTransactionInfoById 4978dc64ff746ca208e51780cce93237ee444f598b24d5e9ce0da885fb3a3eb9   
14:13:40.627 INFO  [main] [Client](Client.java:1326) txid:    
4978dc64ff746ca208e51780cce93237ee444f598b24d5e9ce0da885fb3a3eb9    
fee:   
6170500   
blockNumber:    
26   
blockTimeStamp:    
1554703977000   
result:    
SUCCESS   
resMessage:   
   
contractResult:    
6080604052600436106100405763ffffffff7c0100000000000000000000000000000000000000000000000000000000600035041663329000b58114610045575b600080fd5b34801561005157600080fd5b5061005d60043561006f565b60408051918252519081900360200190f35b604080516003808252608082019092526000916060919060208201838038833901905050905060018160008151811015156100a657fe5b602090810290910101528051600290829060019081106100c257fe5b602090810290910101528051600390829060029081106100de57fe5b6020908102909101015280518190849081106100f657fe5b906020019060200201519150509190505600a165627a7a72305820b24fc247fdaf3644b3c4c94fcee380aa610ed83415061ff9e65d7fa94a5a50a00029     
contractAddress:    
TGdtALTPZ1FWQcc5MW7aK3o1ASaookkJxG    
logList:    
    
receipt:     
EnergyUsage:     
0    
EnergyFee(SUN):    
6170500     
OriginEnergyUsage:     
0     
EnergyUsageTotal:     
61705    
NetUsage:    
704    
NetFee:    
0   
   
InternalTransactionList:    
   
b trigger smart contarct   
TriggerContract contractAddress method args isHex fee_limit value token_value token_id    
contractAddress:				smart contarct address    
method:							The name of function and parameters, please refer to the example    
args:							Parameter value    
isHex:							The format of the parameters method and args,is hex string or not
.      
fee_limit:						The most amount of trx allows for the consumption	    		
token_value:					Number of TRX10    
token_id:						TRC10 id，If not, use ‘#’ instead    
Example:   
triggerContract TGdtALTPZ1FWQcc5MW7aK3o1ASaookkJxG findArgsByIndexTest(uint256) 0 false 
1000000000 0 0 #    
Get the result of the contract execution with the getTransactionInfoById command:   
getTransactionInfoById 7d9c4e765ea53cf6749d8a89ac07d577141b93f83adc4015f0b266d8f5c2dec4    
14:27:50.055 INFO  [main] [Client](Client.java:1326) txid:    
7d9c4e765ea53cf6749d8a89ac07d577141b93f83adc4015f0b266d8f5c2dec4    
fee:    
54400   
blockNumber:    
318    
blockTimeStamp:    
1554704853000   
result:    
SUCCESS   
resMessage:    
    
contractResult:     
0000000000000000000000000000000000000000000000000000000000000001    
contractAddress:    
TGdtALTPZ1FWQcc5MW7aK3o1ASaookkJxG   
logList:    
   
receipt:     
EnergyUsage:    
0   
EnergyFee(SUN):    
54400    
OriginEnergyUsage: 
0
EnergyUsageTotal:     
544   
NetUsage:    
314   
NetFee:   
0   
   
InternalTransactionList:    
   
c get details of a smart contract    
GetContract contractAddress   
contractAddress:		smart contarct address   
Example:    
GetContract  TGdtALTPZ1FWQcc5MW7aK3o1ASaookkJxG    
contract :entrys {   
  name: "findArgsByIndexTest"   
  inputs {   
    name: "i"   
    type: "uint256"   
  }   
  outputs {   
    name: "z"    
    type: "uint256"    
  }    
  type: Function    
  stateMutability: Nonpayable    
}    
    
contract owner:TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ    
contract ConsumeUserResourcePercent:75    
contract energy limit:50000    
    
d update smart contract parameters    
UpdateEnergyLimit contract_address energy_limit					Update parameter energy_limit    
UpdateSetting contract_address consume_user_resource_percent	Update parameter 
consume_user_resource_percent    
    
How to delegate resource
------------------------    
a delegate resource    
The latter two parameters are optional parameters. If not set, the TRX is frozen to obtain 
resources for its own use; if it is not empty, the acquired resources are used by receiverAddress
.    
freezeBalance frozen_balance frozen_duration [ResourceCode:0 BANDWIDTH,1 ENERGY] 
[receiverAddress]    
frozen_balance:				The amount of frozen TRX, the unit is the smallest unit (sun), the 
minimum is 1000000sun    
frozen_duration:			frezen duration, 3 days    
ResourceCode:				0 BANDWIDTH;1 ENERGY    
receiverAddress:			target account address    
    
b unfreeze delegated resource     
The latter two parameters are optional. If they are not set, the BANDWIDTH resource is unfreeze 
by default; when the receiverAddress is set, the delegate resources are unfreezed.    
unfreezeBalance  [ResourceCode:0 BANDWIDTH,1 CPU] [receiverAddress]     
     
c get resource delegation information    
getDelegatedResource fromAddress toAddress 	   
get the information from the fromAddress to the  toAddress resource delegate    
getDelegatedResourceAccountIndex address	   
get the information that address is delegated to other account resources    


Wallet related commands
-----------------------   
RegisterWallet: 			Register your wallet, you need to set the wallet password and generate 
the address and private key.    
BackupWallet:  			Back up your wallet, you need to enter your wallet password and export 
the private key.hex string format,such 
as:721d63b074f18d41c147e04c952ec93467777a30b6f16745bc47a8eae5076545    
BackupWallet2Base64: 	Back up your wallet, you need to enter your wallet password and export 
the private key.base64 format,such as:ch1jsHTxjUHBR+BMlS7JNGd3ejC28WdFvEeo6uUHZUU=    
ChangePassword:			Modify the password of an account    
ImportWallet:			Import wallet, you need to set a password，hex String format    
ImportWalletByBase64:	Import wallet, you need to set a password，base64 fromat    

  
Account related commands
------------------------   
GenerateAddress:		Generate an address and print out the public and private keys     
GetAccount:				Get account information based on address    
GetAccountNet:			The usage of bandwidth    
GetAccountResource:		The usage of bandwidth and energy    
GetAddress:				Get the address of the current login account    
GetBalance:				Get the balance of the current login account    
    
	
How to get transaction information    
----------------------------------    
GetTransactionById:					Get transaction information based on transaction id    
GetTransactionCountByBlockNum:		Get the number of transactions in the block based on the 
block height    
GetTransactionInfoById:				Get transaction-info based on transaction id,generally used 
to check the result of a smart contract trigger     

How to get block information
----------------------------    
GetBlock:							Get the block according to the block number; if you do not 
pass the parameter, get the latest block    
GetBlockById: 						Get block based on blockID    
GetBlockByLatestNum n				
Get the latest n blocks, where 0< n < 100    
GetBlockByLimitNext	startBlockId endBlockId     
Get the block in the range [startBlockId, endBlockId)     

Some others
-----------    
GetNextMaintenanceTime:	Get the start time of the next maintain period    
ListNodes:				Get other peer information    
ListWitnesses:			Get all miner node information    
BroadcastTransaction:	Broadcast the transaction, where the transaction is in hex string format.

How to transfer to shielded address
-----------------------------------
a loadshieldedwallet                Load shielded address, shielded note and start to scan by ivk    
Example:     
loadshieldedwallet    
Please input your password for shielded wallet.    
1qa@WS#ED    
LoadShieldedWallet successful !!!    
    
b generateshieldedaddress number    Generate shielded addresses    
number            The number of shielded addresses, the default is 1   
Example:    
generateshieldedaddress 2    
10:11:02.482 INFO  [main] [Client](Client.java:1914) ShieldedAddress list:    
10:11:02.526 INFO  [main] [Client](Client.java:1919) ztron1ghdy60hya8y72deu0q0r25qfl60unmue6889m3xfc3296a5ut6jcyafzhtp9nlutndukufzap4h    
10:11:02.567 INFO  [main] [Client](Client.java:1919) ztron1hn9r3wmytavslztwmlzvuzk3dqpdhwcmda2d0deyu5pwv32dp78saaslyt82w0078y6uzfg8x6w    
10:11:02.567 INFO  [main] [Client](Client.java:1923) GenerateShieldedAddress successful !!    
    
c listshieldedaddress             Display cached local shielded address list    
Example:    
listshieldedaddress    
10:11:55.370 INFO  [main] [Client](Client.java:1928) ShieldedAddress :    
10:11:55.371 INFO  [main] [Client](Client.java:1930) ztron16j06s3p5gvp2jde4vh7w3ug3zz3m62zkyfu86s7ara5lafhp22p9wr3gz0lcdm3pvt7qx0aftu4    
10:11:55.371 INFO  [main] [Client](Client.java:1930) ztron1ghdy60hya8y72deu0q0r25qfl60unmue6889m3xfc3296a5ut6jcyafzhtp9nlutndukufzap4h    
10:11:55.371 INFO  [main] [Client](Client.java:1930) ztron1hn9r3wmytavslztwmlzvuzk3dqpdhwcmda2d0deyu5pwv32dp78saaslyt82w0078y6uzfg8x6w    

d SendShieldedCoin publicFromAddress fromAmount shieldedInputNum input1 input2 input3 ... publicToAddress toAmount shieldedOutputNum shieldedAddress1 amount1 memo1 shieldedAddress2 amount2 memo2 ...    
Shielded transfer, support from public address or shielded address to public address and shielded address, does not support public address to public address, does not support automatic change.    
Public from amount / shielded input amount = public output amount + shielded output amount + fee    
publicFromAddress 	Public from address, set to null if not needed.    
fromAmount			    The amount transfer from public address, if publicFromAddress set to null, this variable must be 0.   
shieldedInputNum	  The number of shielded input note, should be 0 or 1.    
input				        The index of shielded input note, get from execute command listshieldednote,if shieldedInputNum set to 0,no need to set.
publicToAddress		  Public to address, set to null if not needed.    
toAmount			      The amount transfer to public address, if publicToAddress set to null, this variable must be 0.  
shieldedOutputNum	  The amount of shielded output note. That is the number of (shieldedAddress amount meno) pairs, should be 0,1,2    
shieldedAddress1	  Output shielded address
amount1				      The amount transfer to shieldedAddress1    
memo1				        The memo of this note, up to 512 bytes, can be set to null if not needed    
Example:    
1. Public address transfer to two shielded addresses    
sendshieldedcoin TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ 210000000 0 null 0 2 ztron16j06s3p5gvp2jde4vh7w3ug3zz3m62zkyfu86s7ara5lafhp22p9wr3gz0lcdm3pvt7qx0aftu4 100000000 test1 ztron1ghdy60hya8y72deu0q0r25qfl60unmue6889m3xfc3296a5ut6jcyafzhtp9nlutndukufzap4h 100000000 null    
Receive txid = 4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1    
transaction hex string is hash:     
259979e238ea70d76802a77c6fb50810a94a198e4ae7b8a5d51ae6b1a0d18fb9    
txid:     
4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1    
raw_data:     
{    
ref_block_bytes: 04ac    
ref_block_hash: eb00771525105249    
contract:     
{    
contract 0 :::    
[    
contract_type: ShieldedTransferContract    
transparent_from_address: TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ    
from_amount: 210000000    
receive_description:     
[    
{     
value_commitment:de75bc31efea3a115c387d70721cb0f9aecfec2474f27475abcb980886ad0d3d    
note_commitment:3b89783436db7d908b0639a4da16ffe16be3af123dcac2d7bbd34c0e6d7d6544    
epk:13905055444c524ada9730e591360fef353e7badfd5111aa483d2c18ff1aa325    
c_enc:283bad882abc89bf5726535ccbbcb279ff6858bc5882c32380117ea693dfeb145377b4509e9d8ac7211519af29a07f95dd3c92c937352e12c33c8f23a1eab8669a7f4a0b87ae0173e47e2b63488f7568e3960101b9b30be87f7e8ccae954fab14776dfaf7157eddaf92e76385b3c03364a14689e661e225f13414e3a2930bb03b374e6afe01e3e1109963d9cf2a89598226f4617fda887390bf96227befcf13769ca733ed8b5966fcf4e24142399530b86dd2b310760eb5be40aeb617a8f417532417c7a6c1dabcf511be38545ff37be77a7868a9bcefed6d64c906975e55172f23e2bd5e5fad01fe881b43df1bc5305b01f6790929f06aa2ff76edd22d7f07a076a1df670424dd49b0f9736f2e732e69b46ee533dc9772a960c81f57555a98367554d2baece36155dd8cf8fc62b9474117bcf8eb9a7905e4b143d64c168ae2490d811749aaccc44f9a91a2630cb90bfc922e2b49a3083f18e2b227fc1db9c91a725c17bb5400b769c0c5c80c0083a3e0a8f00e72565b927ba4a95d6d79187219fb836282ebac38671929ac232739ee1a35b21e51ff01dd3d6de1a3a1a0b42ca8b1ae435f124860c2d9ecd5835ad0e94dd33a36edbd37ed2e581e28cc0d6740945dc5f71f9310fbabcd881036f3ccfb7524e7877de54c295577f43c7551accab575b9bcde331ee529d69e40540414f179d914c8b7c62e0e11547d3687d837bd129af855902f647a6eca89d83a4b4442e8b44d87839d0c95a79727ffed286ac78a512b20a03c8e5aeb7c997bd24e8e61a74cd6824afe1f844c14e52958f72896c91214d46    
c_out:28084dab0df35e91f297508e71de534ed8ea9aaa5f9c2c5e8fcc472552107581c58a11fbfb500c05d3b75472e770e4aec9dafa97a4e11a0a145ee4f58eeb996e4d0b8f90a29480f43be490e6119989ef    
zkproof:8eed2aef1edf5d000f8bcdbb1bc228fa6ea4ca1e237da41dde6e49057398ca9db4f785f0327ff87cd2685594ab637c0989604856571d6b2373c949796d52a432094bce27d445e1ec751203480803c19c1ddd5b435f88c27a90700296f2d5473d11234dde23740cd532987b7e7a5eb129f67f63f2b64b07f980856d19dee4965ef2c8d9cea30778db888e0500d04d910d990fb2de69d5062a5e9bababfd54d23376c9aa53c6359551bd296658be04dc1392b1d30ea2d8572862deb1e9402d5d6c    
},{    
value_commitment:c43166a68ea4585bd99a28f2b22be8c9acf35874ab19d94314eb7972a89723a4    
note_commitment:93f76ff28e95094e2bbd3f3b8a0680bdfdc4f06cf67abb59d6cf6bb2a30ffb13    
epk:28aeccd4e7c6ec30db5c8cfa0f0c530ade45a0e0802ae77279d35b1cf086f947    
c_enc:6c62fde60d4c0cc48e84b1b023c6664332a244d8a2e650f41f323b9d05c0637959796b9ef6c3dabee35c81a409e8d5279197af772eddf3fd609822393d2e17fc215f09da41ebd991407b9b206e93fcdbbb3ccf53dcdacdb9759460cb35bd00e281ba2ebd6f04af46c3872b12bccb7b70f61397d27dbfee5e508ca02451047b25520307831ceb7cb39ea35305dae84b3a9a5871ade0f364a35b7214b1b7bb4e5b2bd80ab83740d3e00e57218e499ee2763fa683f9e2118eb7dab943cfac6cef8fd36d37e91cf08459d1077813d506040fa8b6c5cf76a75c7cf0a476a8eb36ad428db29a31d0eadcca7f70f8768a6893991899ba0a3f469ef5f0a8feb0877e4557a2ca1d41ca944db3de4d13125b82dabcbbf36624308eaff2055109446777ca592a3c4f62a9823cd53de6993d5edeaef7e9cd471fd7bc0973e46732c5dbc2f642504fb6fe840c99c012f2dcf035495237f2451dc7e708bf4e22010e86fe21c30aac0e9f3ad31feee69849d6eafeba8337690e163bb22c8d9aff2c55865663af5d4dd23132a7d6d9748dbdc86d71cf773a0a1a2768ce8da9e6fbecda29ab2eb1ad75705ab1fb448cd6c2987b814d759462e4930e124b48838319f5907f33911cb80a583e91c552d1d41de91ed02aba232b9a53331260c8061ae354646e96fde0818d695b7aa058d0ac09fb4f92cb412e218f4e9f9771c1cd067023e844c96ac188db8869c50b1297010d9c21dbce60d815a1c936170df77e057a13b4798f39f5bfc36f5acf36728ea7e017ab5fc39a06e2bbd42ad3118a8c2e5531fb6ae63adf525591ed1a    
c_out:ecf81a290d80573434d45024a8050a0d51c6e74f4ac2c539f6d68694b367a3568ba9187872d9b648fd4dcc9a01de7b2c8d1036d7b2e37b57d89c8df37e26be4bad0728e2922915901339b8a908fb2a56    
zkproof:8b6ca51f29b66e7cc833e1b602f954d3ccc6ed80cf727ce0e4bd74500b32635d909fb7dda7be7d0807b93318e81108c4a1d2c4dc73e7b393b5cc66e18fb7a49d665f3bde62b1832ec01fabecdf8fa77668b78db3679376938820ada3ccf23f540c1fa1c32b4c3303c0ac72351da080c0bab70b8effdc304089601feb613f0c11b57822474a788479ca7322b6d3f606fea2208d45ff3c1f893617f628304ba6765a4eeb1ac52a0e666373e5c746ddc48a781331eff4e465f8993c1bbaafd25d3b    
}    
]    
binding_signature: 1c9732654d45f51fd2cadf1baf0d85a50f55f08d181ef08eb704392d5ee03bc4bc77d56e26b706ab88cae85f6ac608abd2e16b2242653c90e058a3c8a3d23108    
]    
    
}    
timestamp: Fri Jul 19 10:28:20 CST 2019    
fee_limit: 0    
}    
    
txid:     
4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1    
raw_data:     
{    
ref_block_bytes: 04ac    
ref_block_hash: eb00771525105249    
contract:     
{    
contract 0 :::    
[    
contract_type: ShieldedTransferContract    
transparent_from_address: TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ    
from_amount: 210000000    
receive_description:     
[    
{    
value_commitment:de75bc31efea3a115c387d70721cb0f9aecfec2474f27475abcb980886ad0d3d    
note_commitment:3b89783436db7d908b0639a4da16ffe16be3af123dcac2d7bbd34c0e6d7d6544    
epk:13905055444c524ada9730e591360fef353e7badfd5111aa483d2c18ff1aa325    
c_enc:283bad882abc89bf5726535ccbbcb279ff6858bc5882c32380117ea693dfeb145377b4509e9d8ac7211519af29a07f95dd3c92c937352e12c33c8f23a1eab8669a7f4a0b87ae0173e47e2b63488f7568e3960101b9b30be87f7e8ccae954fab14776dfaf7157eddaf92e76385b3c03364a14689e661e225f13414e3a2930bb03b374e6afe01e3e1109963d9cf2a89598226f4617fda887390bf96227befcf13769ca733ed8b5966fcf4e24142399530b86dd2b310760eb5be40aeb617a8f417532417c7a6c1dabcf511be38545ff37be77a7868a9bcefed6d64c906975e55172f23e2bd5e5fad01fe881b43df1bc5305b01f6790929f06aa2ff76edd22d7f07a076a1df670424dd49b0f9736f2e732e69b46ee533dc9772a960c81f57555a98367554d2baece36155dd8cf8fc62b9474117bcf8eb9a7905e4b143d64c168ae2490d811749aaccc44f9a91a2630cb90bfc922e2b49a3083f18e2b227fc1db9c91a725c17bb5400b769c0c5c80c0083a3e0a8f00e72565b927ba4a95d6d79187219fb836282ebac38671929ac232739ee1a35b21e51ff01dd3d6de1a3a1a0b42ca8b1ae435f124860c2d9ecd5835ad0e94dd33a36edbd37ed2e581e28cc0d6740945dc5f71f9310fbabcd881036f3ccfb7524e7877de54c295577f43c7551accab575b9bcde331ee529d69e40540414f179d914c8b7c62e0e11547d3687d837bd129af855902f647a6eca89d83a4b4442e8b44d87839d0c95a79727ffed286ac78a512b20a03c8e5aeb7c997bd24e8e61a74cd6824afe1f844c14e52958f72896c91214d46    
c_out:28084dab0df35e91f297508e71de534ed8ea9aaa5f9c2c5e8fcc472552107581c58a11fbfb500c05d3b75472e770e4aec9dafa97a4e11a0a145ee4f58eeb996e4d0b8f90a29480f43be490e6119989ef    
zkproof:8eed2aef1edf5d000f8bcdbb1bc228fa6ea4ca1e237da41dde6e49057398ca9db4f785f0327ff87cd2685594ab637c0989604856571d6b2373c949796d52a432094bce27d445e1ec751203480803c19c1ddd5b435f88c27a90700296f2d5473d11234dde23740cd532987b7e7a5eb129f67f63f2b64b07f980856d19dee4965ef2c8d9cea30778db888e0500d04d910d990fb2de69d5062a5e9bababfd54d23376c9aa53c6359551bd296658be04dc1392b1d30ea2d8572862deb1e9402d5d6c    
},{    
value_commitment:c43166a68ea4585bd99a28f2b22be8c9acf35874ab19d94314eb7972a89723a4    
note_commitment:93f76ff28e95094e2bbd3f3b8a0680bdfdc4f06cf67abb59d6cf6bb2a30ffb13    
epk:28aeccd4e7c6ec30db5c8cfa0f0c530ade45a0e0802ae77279d35b1cf086f947    
c_enc:6c62fde60d4c0cc48e84b1b023c6664332a244d8a2e650f41f323b9d05c0637959796b9ef6c3dabee35c81a409e8d5279197af772eddf3fd609822393d2e17fc215f09da41ebd991407b9b206e93fcdbbb3ccf53dcdacdb9759460cb35bd00e281ba2ebd6f04af46c3872b12bccb7b70f61397d27dbfee5e508ca02451047b25520307831ceb7cb39ea35305dae84b3a9a5871ade0f364a35b7214b1b7bb4e5b2bd80ab83740d3e00e57218e499ee2763fa683f9e2118eb7dab943cfac6cef8fd36d37e91cf08459d1077813d506040fa8b6c5cf76a75c7cf0a476a8eb36ad428db29a31d0eadcca7f70f8768a6893991899ba0a3f469ef5f0a8feb0877e4557a2ca1d41ca944db3de4d13125b82dabcbbf36624308eaff2055109446777ca592a3c4f62a9823cd53de6993d5edeaef7e9cd471fd7bc0973e46732c5dbc2f642504fb6fe840c99c012f2dcf035495237f2451dc7e708bf4e22010e86fe21c30aac0e9f3ad31feee69849d6eafeba8337690e163bb22c8d9aff2c55865663af5d4dd23132a7d6d9748dbdc86d71cf773a0a1a2768ce8da9e6fbecda29ab2eb1ad75705ab1fb448cd6c2987b814d759462e4930e124b48838319f5907f33911cb80a583e91c552d1d41de91ed02aba232b9a53331260c8061ae354646e96fde0818d695b7aa058d0ac09fb4f92cb412e218f4e9f9771c1cd067023e844c96ac188db8869c50b1297010d9c21dbce60d815a1c936170df77e057a13b4798f39f5bfc36f5acf36728ea7e017ab5fc39a06e2bbd42ad3118a8c2e5531fb6ae63adf525591ed1a    
c_out:ecf81a290d80573434d45024a8050a0d51c6e74f4ac2c539f6d68694b367a3568ba9187872d9b648fd4dcc9a01de7b2c8d1036d7b2e37b57d89c8df37e26be4bad0728e2922915901339b8a908fb2a56    
zkproof:8b6ca51f29b66e7cc833e1b602f954d3ccc6ed80cf727ce0e4bd74500b32635d909fb7dda7be7d0807b93318e81108c4a1d2c4dc73e7b393b5cc66e18fb7a49d665f3bde62b1832ec01fabecdf8fa77668b78db3679376938820ada3ccf23f540c1fa1c32b4c3303c0ac72351da080c0bab70b8effdc304089601feb613f0c11b57822474a788479ca7322b6d3f606fea2208d45ff3c1f893617f628304ba6765a4eeb1ac52a0e666373e5c746ddc48a781331eff4e465f8993c1bbaafd25d3b    
}    
]    
binding_signature: 1c9732654d45f51fd2cadf1baf0d85a50f55f08d181ef08eb704392d5ee03bc4bc77d56e26b706ab88cae85f6ac608abd2e16b2242653c90e058a3c8a3d23108    
]    
    
}    
timestamp: Fri Jul 19 10:28:20 CST 2019    
fee_limit: 0    
}    
    
Please confirm and input your permission id, if input y or Y means default 0, other non-numeric characters will cancell transaction.    
Please choose your key for sign.    
The 1th keystore file name is UTC--2019-07-11T07-48-10.599000000Z--TK46L2BNfbmbScnAnaqgZuobkSBVyNsvTM.json    
The 2th keystore file name is UTC--2018-11-20T07-47-52.297000000Z--TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ.json    
Please choose between 1 and 2    
2    
Please input your password.    
1qa@WS#ED    
current transaction hex string is 0ac6100a0204ac2208eb0077152510524940b0e0bfc0c02d5aa710083312a2100a35747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e536869656c6465645472616e73666572436f6e747261637412e80f0a1541a7d8a35b260395c14aa456297662092ba3b76fc01080b1916422c2070a20de75bc31efea3a115c387d70721cb0f9aecfec2474f27475abcb980886ad0d3d12203b89783436db7d908b0639a4da16ffe16be3af123dcac2d7bbd34c0e6d7d65441a2013905055444c524ada9730e591360fef353e7badfd5111aa483d2c18ff1aa32522c404283bad882abc89bf5726535ccbbcb279ff6858bc5882c32380117ea693dfeb145377b4509e9d8ac7211519af29a07f95dd3c92c937352e12c33c8f23a1eab8669a7f4a0b87ae0173e47e2b63488f7568e3960101b9b30be87f7e8ccae954fab14776dfaf7157eddaf92e76385b3c03364a14689e661e225f13414e3a2930bb03b374e6afe01e3e1109963d9cf2a89598226f4617fda887390bf96227befcf13769ca733ed8b5966fcf4e24142399530b86dd2b310760eb5be40aeb617a8f417532417c7a6c1dabcf511be38545ff37be77a7868a9bcefed6d64c906975e55172f23e2bd5e5fad01fe881b43df1bc5305b01f6790929f06aa2ff76edd22d7f07a076a1df670424dd49b0f9736f2e732e69b46ee533dc9772a960c81f57555a98367554d2baece36155dd8cf8fc62b9474117bcf8eb9a7905e4b143d64c168ae2490d811749aaccc44f9a91a2630cb90bfc922e2b49a3083f18e2b227fc1db9c91a725c17bb5400b769c0c5c80c0083a3e0a8f00e72565b927ba4a95d6d79187219fb836282ebac38671929ac232739ee1a35b21e51ff01dd3d6de1a3a1a0b42ca8b1ae435f124860c2d9ecd5835ad0e94dd33a36edbd37ed2e581e28cc0d6740945dc5f71f9310fbabcd881036f3ccfb7524e7877de54c295577f43c7551accab575b9bcde331ee529d69e40540414f179d914c8b7c62e0e11547d3687d837bd129af855902f647a6eca89d83a4b4442e8b44d87839d0c95a79727ffed286ac78a512b20a03c8e5aeb7c997bd24e8e61a74cd6824afe1f844c14e52958f72896c91214d462a5028084dab0df35e91f297508e71de534ed8ea9aaa5f9c2c5e8fcc472552107581c58a11fbfb500c05d3b75472e770e4aec9dafa97a4e11a0a145ee4f58eeb996e4d0b8f90a29480f43be490e6119989ef32c0018eed2aef1edf5d000f8bcdbb1bc228fa6ea4ca1e237da41dde6e49057398ca9db4f785f0327ff87cd2685594ab637c0989604856571d6b2373c949796d52a432094bce27d445e1ec751203480803c19c1ddd5b435f88c27a90700296f2d5473d11234dde23740cd532987b7e7a5eb129f67f63f2b64b07f980856d19dee4965ef2c8d9cea30778db888e0500d04d910d990fb2de69d5062a5e9bababfd54d23376c9aa53c6359551bd296658be04dc1392b1d30ea2d8572862deb1e9402d5d6c22c2070a20c43166a68ea4585bd99a28f2b22be8c9acf35874ab19d94314eb7972a89723a4122093f76ff28e95094e2bbd3f3b8a0680bdfdc4f06cf67abb59d6cf6bb2a30ffb131a2028aeccd4e7c6ec30db5c8cfa0f0c530ade45a0e0802ae77279d35b1cf086f94722c4046c62fde60d4c0cc48e84b1b023c6664332a244d8a2e650f41f323b9d05c0637959796b9ef6c3dabee35c81a409e8d5279197af772eddf3fd609822393d2e17fc215f09da41ebd991407b9b206e93fcdbbb3ccf53dcdacdb9759460cb35bd00e281ba2ebd6f04af46c3872b12bccb7b70f61397d27dbfee5e508ca02451047b25520307831ceb7cb39ea35305dae84b3a9a5871ade0f364a35b7214b1b7bb4e5b2bd80ab83740d3e00e57218e499ee2763fa683f9e2118eb7dab943cfac6cef8fd36d37e91cf08459d1077813d506040fa8b6c5cf76a75c7cf0a476a8eb36ad428db29a31d0eadcca7f70f8768a6893991899ba0a3f469ef5f0a8feb0877e4557a2ca1d41ca944db3de4d13125b82dabcbbf36624308eaff2055109446777ca592a3c4f62a9823cd53de6993d5edeaef7e9cd471fd7bc0973e46732c5dbc2f642504fb6fe840c99c012f2dcf035495237f2451dc7e708bf4e22010e86fe21c30aac0e9f3ad31feee69849d6eafeba8337690e163bb22c8d9aff2c55865663af5d4dd23132a7d6d9748dbdc86d71cf773a0a1a2768ce8da9e6fbecda29ab2eb1ad75705ab1fb448cd6c2987b814d759462e4930e124b48838319f5907f33911cb80a583e91c552d1d41de91ed02aba232b9a53331260c8061ae354646e96fde0818d695b7aa058d0ac09fb4f92cb412e218f4e9f9771c1cd067023e844c96ac188db8869c50b1297010d9c21dbce60d815a1c936170df77e057a13b4798f39f5bfc36f5acf36728ea7e017ab5fc39a06e2bbd42ad3118a8c2e5531fb6ae63adf525591ed1a2a50ecf81a290d80573434d45024a8050a0d51c6e74f4ac2c539f6d68694b367a3568ba9187872d9b648fd4dcc9a01de7b2c8d1036d7b2e37b57d89c8df37e26be4bad0728e2922915901339b8a908fb2a5632c0018b6ca51f29b66e7cc833e1b602f954d3ccc6ed80cf727ce0e4bd74500b32635d909fb7dda7be7d0807b93318e81108c4a1d2c4dc73e7b393b5cc66e18fb7a49d665f3bde62b1832ec01fabecdf8fa77668b78db3679376938820ada3ccf23f540c1fa1c32b4c3303c0ac72351da080c0bab70b8effdc304089601feb613f0c11b57822474a788479ca7322b6d3f606fea2208d45ff3c1f893617f628304ba6765a4eeb1ac52a0e666373e5c746ddc48a781331eff4e465f8993c1bbaafd25d3b2a401c9732654d45f51fd2cadf1baf0d85a50f55f08d181ef08eb704392d5ee03bc4bc77d56e26b706ab88cae85f6ac608abd2e16b2242653c90e058a3c8a3d2310870f8a2bcc0c02d1241f1e90556d1ef91c26c01261c30c79a20a2a14a68196956bb1d0375179c897a143eaf5f357df22f21b556b17e12335ae01c9929bda86dcf101367407e0d115de401    
10:28:26.914 INFO  [main] [Client](Client.java:2040) SendShieldedCoin successful !!    
    
2. shielded address transfer to shielded address    
listshieldednote    
Unspend note list like:    
1 ztron1ghdy60hya8y72deu0q0r25qfl60unmue6889m3xfc3296a5ut6jcyafzhtp9nlutndukufzap4h 100000000 4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1 1 UnSpend     
0 ztron16j06s3p5gvp2jde4vh7w3ug3zz3m62zkyfu86s7ara5lafhp22p9wr3gz0lcdm3pvt7qx0aftu4 100000000 4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1 0 UnSpend test1    
    
sendshieldedcoin null 0 1 0 null 0 1 ztron1hn9r3wmytavslztwmlzvuzk3dqpdhwcmda2d0deyu5pwv32dp78saaslyt82w0078y6uzfg8x6w 90000000 test2    
address ztron16j06s3p5gvp2jde4vh7w3ug3zz3m62zkyfu86s7ara5lafhp22p9wr3gz0lcdm3pvt7qx0aftu4    
value 100000000    
rcm 224463fbba4ef49a4e547d5b7fe608ebd9ec717591db2f6b6644a862a5528b07    
trxId 4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1    
index 0    
memo test1    
Receive txid = 840b127fea05f7f86c43ad9fb5fe7fa27e977465cea4e4ae25e59e0de75ad99e    
transaction hex string is hash:     
69ef6fa21da0d1633187a0c55c1ba20f323e88ba8e27e52ece452860c9726e9f    
txid:     
06b55fc27f7ec649396706d149d18a0bb003347bdd7f489e3d47205da9cee802    
raw_data:     
{    
ref_block_bytes: 05d8    
ref_block_hash: d5877abdc498f58f    
contract:     
{    
contract 0 :::    
[    
contract_type: ShieldedTransferContract    
spend_description:     
[    
{    
value_commitment:d972b1946f3884732f0c1d67d447ab6aa2128cc70fc44f7ec664c257361e7638    
anchor:efe6dd711e8dc619a892b3a3f8b0e86bb51e867718e34e8e5c483e45ba1d1f13    
nullifier:8a5185c92d707bde700aad36ae54966cb9bc747cacc422425e41c176f3c7294c    
rk:1fd62d517815b8f717b86d93cd1c6cd196c6ac6be785a8043cbd860264908fc3    
zkproof:975a3ea4d6682945ad6d036401027cff7ec26b554ece18bc42e69acdbeb3742daa1a556d2b707dee5cfd6ab391e35705a7fef815c69cb76974c7519f82c8115110aa9ce702dcc0dd07322ea07bdffdfa7947b90f2beb50308fb4640352c7e4fd07ae8d23f77dec6ee7f0ef538064002b5e6b3a35b781d64080adb0a244afa86d06811c145551516948c834343a85a938942b3b538d8ba5d1d765a7cf3bb16a1a4f211bb1dff93ca85b16f814cf0939f64cfa89dcd833cb31a726b689e0d4b4d4    
spend_authority_signature:5caaa268628276ef71a709e31c9cc5ab1160ba6ab82be0064fbaa31fc372ab4f311dd2ccb50e5d908522acea4cd512241aed7c54bdf65bc76fbba27d8451dc03    
}    
]    
receive_description:     
[    
{    
value_commitment:9e9bd0ff2d6c1dfa134dd7c834426c3158a1c0b1780cd7cfd4fdf3a055ff2e50    
note_commitment:7ffbb461e35abd8c7505e71399ad2d2d41749af8b567043940cee496790e773f    
epk:ef92ed5d2725ffc92fb02fa632bc4b68b246600149e2207d69c7209d4fbb88bf    
c_enc:b462cecb440db4cb994a9f2877f812972bd93f127f8c0b6e0909532ba013f70c7953146a7d22149f96b04c23a820f0cbb422ccdb01f676c4345230c67325f1de1bba5f8bd88db21db6c86f7da7765dbbe9b389326cab3deaaa59ea903c3d2db50394e6d431e193ff37ecd164cd3b9579904cc79096acdc7b1c47d91142d0d5beea48bcfbc540aa78ef02f3fb8ba68a1ee0705abc1aaa07200a02a7c9aaa930649de0adf8f90b6acd349136b550a3b1adbad913fef482b73914f5511e758ec280d463b2df8c89c127b0c127bc1e8b68f5dca0682684c9c2a560015593762ee6e401ce6aac23c97de7f636d01b27dc4caa1bff8c98a36342661ff26e41826601d0945aefb9d86b94382fb912e8f32cb2c8990101765aa9e78cbe6c48c2ee3c0fd4df3050cb1395f98d3335b01a5f8bdbfefd3a445ab91cd69f30b1ed5da2c7b0c4ef732cc1e33951714bcce6d2f580711d86a7663defdd09998237282c710de15db31dbbcfe043efad8ee55f9c5de779553a173a7b87bb062412d061c20ebf46f918024e460bf9f7a9650986eb9962478e5c069ae8bc7c01d6399e60d0154f956d0b7613d774d2e8b8bde3d4b1cf5ed46edfec663017a70312eb04ee68baaae9c0779d782031fad6f99a37981db699fdcfa29fdc5e0628b73209b8fef58ca70581f90899c756a0b2911caab7685b9cdaf7da3a02a258df8d8fe16a939f2c601e39ec795faa1c7d06e00e9c2dbc9181f9a97dde5fc23053a2753262d7c570eca6e104bf0e308de99d0e04dab9130a4b3fb1fec21f75f4d1096270130199664e39687d3cc777    
c_out:fcb1be9acda155d265301b76eb6dd199dad759af298746bfd6588844affb7c53c702b4915978483c28a5753d3a02a91d1769874d7b5b5e55288aa1420b90b9eb71f21a25fb653f41352cb9cf762f1a77    
zkproof:a5229d0065d15720421f5dc95236521aa5a1f676ed695892a6c5e6cb504f72712ac2b462a78b7b57543bd7939a74550eb978c343080926480d1119e9b299ed07a943f8cdc937f5f68e3b1fdd17cffb8e81225ef867ffbdf288b61947e4cf69d70b8cf697fc77bd8132c1ed9d8b816a07a285e6b77955ac6d9b8009094875ce531abac0443486aba986afd61bc6d1e05484390f1444de7d54f6af5d8bba38106a2262e9c74d86d981388ea1cba44280e0d993e21b358bbc7a80f13e4236cdb62e    
}    
]    
binding_signature: 87e087f3eb8455a327c9621787bf6fbf592a3d6307bfee7e5ac7282e5c50c9556f8feb4cbe21d33e22b4d6c40046419be88cc3acd6ebae781945aea904627e02    
]    
    
}    
timestamp: Fri Jul 19 10:43:38 CST 2019    
fee_limit: 0    
}    
    
txid:     
840b127fea05f7f86c43ad9fb5fe7fa27e977465cea4e4ae25e59e0de75ad99e    
raw_data:     
{    
ref_block_bytes: 05d8    
ref_block_hash: d5877abdc498f58f    
contract:     
{    
contract 0 :::    
[    
contract_type: ShieldedTransferContract    
spend_description:     
[    
{    
value_commitment:d972b1946f3884732f0c1d67d447ab6aa2128cc70fc44f7ec664c257361e7638    
anchor:efe6dd711e8dc619a892b3a3f8b0e86bb51e867718e34e8e5c483e45ba1d1f13    
nullifier:8a5185c92d707bde700aad36ae54966cb9bc747cacc422425e41c176f3c7294c    
rk:1fd62d517815b8f717b86d93cd1c6cd196c6ac6be785a8043cbd860264908fc3    
zkproof:975a3ea4d6682945ad6d036401027cff7ec26b554ece18bc42e69acdbeb3742daa1a556d2b707dee5cfd6ab391e35705a7fef815c69cb76974c7519f82c8115110aa9ce702dcc0dd07322ea07bdffdfa7947b90f2beb50308fb4640352c7e4fd07ae8d23f77dec6ee7f0ef538064002b5e6b3a35b781d64080adb0a244afa86d06811c145551516948c834343a85a938942b3b538d8ba5d1d765a7cf3bb16a1a4f211bb1dff93ca85b16f814cf0939f64cfa89dcd833cb31a726b689e0d4b4d4    
spend_authority_signature:5caaa268628276ef71a709e31c9cc5ab1160ba6ab82be0064fbaa31fc372ab4f311dd2ccb50e5d908522acea4cd512241aed7c54bdf65bc76fbba27d8451dc03    
}    
]    
receive_description:     
[    
{    
value_commitment:9e9bd0ff2d6c1dfa134dd7c834426c3158a1c0b1780cd7cfd4fdf3a055ff2e50    
note_commitment:7ffbb461e35abd8c7505e71399ad2d2d41749af8b567043940cee496790e773f    
epk:ef92ed5d2725ffc92fb02fa632bc4b68b246600149e2207d69c7209d4fbb88bf    
c_enc:b462cecb440db4cb994a9f2877f812972bd93f127f8c0b6e0909532ba013f70c7953146a7d22149f96b04c23a820f0cbb422ccdb01f676c4345230c67325f1de1bba5f8bd88db21db6c86f7da7765dbbe9b389326cab3deaaa59ea903c3d2db50394e6d431e193ff37ecd164cd3b9579904cc79096acdc7b1c47d91142d0d5beea48bcfbc540aa78ef02f3fb8ba68a1ee0705abc1aaa07200a02a7c9aaa930649de0adf8f90b6acd349136b550a3b1adbad913fef482b73914f5511e758ec280d463b2df8c89c127b0c127bc1e8b68f5dca0682684c9c2a560015593762ee6e401ce6aac23c97de7f636d01b27dc4caa1bff8c98a36342661ff26e41826601d0945aefb9d86b94382fb912e8f32cb2c8990101765aa9e78cbe6c48c2ee3c0fd4df3050cb1395f98d3335b01a5f8bdbfefd3a445ab91cd69f30b1ed5da2c7b0c4ef732cc1e33951714bcce6d2f580711d86a7663defdd09998237282c710de15db31dbbcfe043efad8ee55f9c5de779553a173a7b87bb062412d061c20ebf46f918024e460bf9f7a9650986eb9962478e5c069ae8bc7c01d6399e60d0154f956d0b7613d774d2e8b8bde3d4b1cf5ed46edfec663017a70312eb04ee68baaae9c0779d782031fad6f99a37981db699fdcfa29fdc5e0628b73209b8fef58ca70581f90899c756a0b2911caab7685b9cdaf7da3a02a258df8d8fe16a939f2c601e39ec795faa1c7d06e00e9c2dbc9181f9a97dde5fc23053a2753262d7c570eca6e104bf0e308de99d0e04dab9130a4b3fb1fec21f75f4d1096270130199664e39687d3cc777    
c_out:fcb1be9acda155d265301b76eb6dd199dad759af298746bfd6588844affb7c53c702b4915978483c28a5753d3a02a91d1769874d7b5b5e55288aa1420b90b9eb71f21a25fb653f41352cb9cf762f1a77    
zkproof:a5229d0065d15720421f5dc95236521aa5a1f676ed695892a6c5e6cb504f72712ac2b462a78b7b57543bd7939a74550eb978c343080926480d1119e9b299ed07a943f8cdc937f5f68e3b1fdd17cffb8e81225ef867ffbdf288b61947e4cf69d70b8cf697fc77bd8132c1ed9d8b816a07a285e6b77955ac6d9b8009094875ce531abac0443486aba986afd61bc6d1e05484390f1444de7d54f6af5d8bba38106a2262e9c74d86d981388ea1cba44280e0d993e21b358bbc7a80f13e4236cdb62e    
}    
]    
binding_signature: 87e087f3eb8455a327c9621787bf6fbf592a3d6307bfee7e5ac7282e5c50c9556f8feb4cbe21d33e22b4d6c40046419be88cc3acd6ebae781945aea904627e02    
]    
    
}
timestamp: Fri Jul 19 10:43:38 CST 2019    
fee_limit: 0    
}    
    
10:43:38.722 INFO  [main] [Client](Client.java:2058) SendShieldedCoinWithoutAsk successful !!    
    
3. shielded address transfer to public address    
listshieldednote    
Unspend note list like:    
1 ztron1ghdy60hya8y72deu0q0r25qfl60unmue6889m3xfc3296a5ut6jcyafzhtp9nlutndukufzap4h 100000000 4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1 1 UnSpend     
2 ztron1hn9r3wmytavslztwmlzvuzk3dqpdhwcmda2d0deyu5pwv32dp78saaslyt82w0078y6uzfg8x6w 90000000 06b55fc27f7ec649396706d149d18a0bb003347bdd7f489e3d47205da9cee802 0 UnSpend test2    
    
sendshieldedcoin null 0 1 2 TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ 80000000 0    
address ztron1hn9r3wmytavslztwmlzvuzk3dqpdhwcmda2d0deyu5pwv32dp78saaslyt82w0078y6uzfg8x6w    
value 90000000    
rcm becfc0d183a9fe0f8571c9a071bd91fafa7f84c0a5c8c704b100a1ecbd611804    
trxId 06b55fc27f7ec649396706d149d18a0bb003347bdd7f489e3d47205da9cee802    
index 0    
memo test2    
Receive txid = f8bd9e486bdd3a7fa99b4e0b8492f6dac6179c143e44c94e363a397a1ab9fc3b    
transaction hex string is hash:     
d6487d07461fc5c32e61469be9deec6d6e0288e5906eb840b6bac287b2e946e6    
txid:     
f8bd9e486bdd3a7fa99b4e0b8492f6dac6179c143e44c94e363a397a1ab9fc3b    
raw_data:     
{    
ref_block_bytes: 060c    
ref_block_hash: c047800cdbd6b5db    
contract:     
{    
contract 0 :::    
[    
contract_type: ShieldedTransferContract    
spend_description:     
[    
{    
value_commitment:65f4ee0430e1d6ee492be68885ac38aa44a0d341ceec915dc4c6821bd1e09535    
anchor:e43b41c9f42c98aa5f88c2d78760c2bf592a73b9fc5f5f62deb24aa0ce5e7113    
nullifier:047965dfee699250578d728e9a11ca733774e604b4c28a4b40d4d1f8cd8b8c2c    
rk:460b69899b5d18dcba9a2af5e9520542396731caf09611cc4f1d7c61bc7ceddb    
zkproof:a87f2f3445338304142a0b515b2bc90525dcc51c6f16cfd49b00e7592efa9847004a253334408bfe0637e3cb831647968bd8117cf152d3233296a2d5b3cce6c70d80ffb95917ebc5ef378b994c7ecf95217496de41ddf09a9618279cf697352d0c2d4546d53ce1d9f7c6a05915fa5bc66745b58984fc6d76adff9292237bbd75c306fc0e9576a1b0478d80ca6dba2185a4dde684669e0e1af50de954fad5ef440f8248f10f08c22185585d30c917506ec98a92ee8d0cd8c7e31503697280d010    
spend_authority_signature:588f25beaf8d2a52bb4b5ff09d34c756cd2da4623b08f580046e0a858b32a41b2fc8c5acecce59c74368fbfff05d64f09a72dde569b16d2ac020f7df1bb15105    
}    
]    
receive_description:     
[    
{    
value_commitment:577acf5e74a0359cd2850287ac141845a5cdae3152e0b1770842c01516a1606b    
note_commitment:bf656bf6273c96507dd0316284be8894a738c674498e64389235f033df1e0d41    
epk:8a2666e7762a31a4a796bd4b1630cafc475f47699c1c05e1e2f0265537f14f66    
c_enc:4c0a89428c210d848f8f7cbb89f2305aad60d9bc9a222d46f588fcf03b73341f3a400a2026f999e7c8a0a74a7fb37bd4aa6072c05ea1bff8ecf234b4cdc064a00481ab153c2f5168de1cbec568c305956b2d1459e7d75effc8902958f51de77efb8ee1614d5de22bd80536d5a24c8799e5c04294f3db9e6180f91de3d83209e6b7e7bf7c54c7e3da8fa938a975446e5227c34227a7ce5e1cff66420a641aca44c0a85a527a1cedb49934c38665d91ebc8623678f99de7aa46af27b9f060552686c9e1911298729404e2cbe317d0cf3779861538af9307f76079f7afb725dda3c80912e5b869d85fe0781518e1cb41c2275ef776e4bf31fb6bec99ee70eb4cba35fc5816d7c809c810a13dd685cd2d7aa08fb4cbc75767af82657d50d1594c6e6aafe0c2b4fffbb897e68c506d33efaacff8b9b8cd099b3b291a045dbc76dd54a87780c6f83b340f00fb0d436f7f71ab6a2487fab39c3826f2cddb50d367e9fac61b949f8593cd6dbf26e26c5772bd3a5a3145768303442708151b27a714b142d9dc9ad96ea4fd69e9ae3b8c2a78aae7c25e32b6d23330f5ba1950ab1357c5c8a1400d920d16ae30a5c30921c93d1f6beda6bb58825a59a75a322325b87690656c8370eeb50e500690fb7076017f029997bc8c8ca6f1d1d555fe630076057bc3327ff00a518c1a36a21156175639e50c78fea2a3ac44df60e96e7b3f731f9d947166328b85ffbeb938e3dbddfce0a07b9b11ec7da5a319471401f1a40da6b70e330e484159408526ea7a4c350216d15ca62e084608f0adae5fa3c1e8312019fdf2543ed4c    
c_out:eb8baa73655503aee8d8ec3d4e281c58de48693fac562862c3b875faa7e3b915cfba3bb8a497dd6d3a13b49c02a034d10df0df2029c0b8a9080ef88f6152e6f4ecd4c639e8f450a5d5e818ba4620475b    
zkproof:93556b5e801251c410930717abbb8f4aaecf102383ec0ac0cbec0dab16f5fd11009154e2e7260c7de14b4a52d2f5e3d898816ff8377e9c7e4592afbe716924239b56f776cf1c4a505a78ff5b8c783432bb3eeacda3ae3a73d8297de0786abe91123ea85faa3531021e6ede128fb2cc4aed1b0ef34f178e011e1b05f348d8b0d199fe97308f2ae0a681b03c273bc8925cb00850d59f8274613ee02563f61a9160bcb9b88d0c07824ef6a8f68051dc1b21fa815452b3a1b692983f5139abbc1ccc    
}    
]    
binding_signature: 3780fa22547965820a00f9e3fbe94f49f8e4d9afcd1cf561946557a08de1b28aba8597ca4159b29cf42fa4ce6beb6570af8d622f642b7ac4896c012cf8d1fb00    
transparent_to_address: TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ    
to_amount: 80000000    
]    
    
}    
timestamp: Fri Jul 19 10:46:19 CST 2019    
fee_limit: 0    
}    
    
txid:     
f8bd9e486bdd3a7fa99b4e0b8492f6dac6179c143e44c94e363a397a1ab9fc3b    
raw_data:     
{    
ref_block_bytes: 060c    
ref_block_hash: c047800cdbd6b5db    
contract:     
{    
contract 0 :::    
[
contract_type: ShieldedTransferContract    
spend_description:     
[    
{    
value_commitment:65f4ee0430e1d6ee492be68885ac38aa44a0d341ceec915dc4c6821bd1e09535    
anchor:e43b41c9f42c98aa5f88c2d78760c2bf592a73b9fc5f5f62deb24aa0ce5e7113    
nullifier:047965dfee699250578d728e9a11ca733774e604b4c28a4b40d4d1f8cd8b8c2c    
rk:460b69899b5d18dcba9a2af5e9520542396731caf09611cc4f1d7c61bc7ceddb    
zkproof:a87f2f3445338304142a0b515b2bc90525dcc51c6f16cfd49b00e7592efa9847004a253334408bfe0637e3cb831647968bd8117cf152d3233296a2d5b3cce6c70d80ffb95917ebc5ef378b994c7ecf95217496de41ddf09a9618279cf697352d0c2d4546d53ce1d9f7c6a05915fa5bc66745b58984fc6d76adff9292237bbd75c306fc0e9576a1b0478d80ca6dba2185a4dde684669e0e1af50de954fad5ef440f8248f10f08c22185585d30c917506ec98a92ee8d0cd8c7e31503697280d010    
spend_authority_signature:588f25beaf8d2a52bb4b5ff09d34c756cd2da4623b08f580046e0a858b32a41b2fc8c5acecce59c74368fbfff05d64f09a72dde569b16d2ac020f7df1bb15105    
}    
]    
receive_description:     
[    
{    
value_commitment:577acf5e74a0359cd2850287ac141845a5cdae3152e0b1770842c01516a1606b    
note_commitment:bf656bf6273c96507dd0316284be8894a738c674498e64389235f033df1e0d41    
epk:8a2666e7762a31a4a796bd4b1630cafc475f47699c1c05e1e2f0265537f14f66    
c_enc:4c0a89428c210d848f8f7cbb89f2305aad60d9bc9a222d46f588fcf03b73341f3a400a2026f999e7c8a0a74a7fb37bd4aa6072c05ea1bff8ecf234b4cdc064a00481ab153c2f5168de1cbec568c305956b2d1459e7d75effc8902958f51de77efb8ee1614d5de22bd80536d5a24c8799e5c04294f3db9e6180f91de3d83209e6b7e7bf7c54c7e3da8fa938a975446e5227c34227a7ce5e1cff66420a641aca44c0a85a527a1cedb49934c38665d91ebc8623678f99de7aa46af27b9f060552686c9e1911298729404e2cbe317d0cf3779861538af9307f76079f7afb725dda3c80912e5b869d85fe0781518e1cb41c2275ef776e4bf31fb6bec99ee70eb4cba35fc5816d7c809c810a13dd685cd2d7aa08fb4cbc75767af82657d50d1594c6e6aafe0c2b4fffbb897e68c506d33efaacff8b9b8cd099b3b291a045dbc76dd54a87780c6f83b340f00fb0d436f7f71ab6a2487fab39c3826f2cddb50d367e9fac61b949f8593cd6dbf26e26c5772bd3a5a3145768303442708151b27a714b142d9dc9ad96ea4fd69e9ae3b8c2a78aae7c25e32b6d23330f5ba1950ab1357c5c8a1400d920d16ae30a5c30921c93d1f6beda6bb58825a59a75a322325b87690656c8370eeb50e500690fb7076017f029997bc8c8ca6f1d1d555fe630076057bc3327ff00a518c1a36a21156175639e50c78fea2a3ac44df60e96e7b3f731f9d947166328b85ffbeb938e3dbddfce0a07b9b11ec7da5a319471401f1a40da6b70e330e484159408526ea7a4c350216d15ca62e084608f0adae5fa3c1e8312019fdf2543ed4c    
c_out:eb8baa73655503aee8d8ec3d4e281c58de48693fac562862c3b875faa7e3b915cfba3bb8a497dd6d3a13b49c02a034d10df0df2029c0b8a9080ef88f6152e6f4ecd4c639e8f450a5d5e818ba4620475b    
zkproof:93556b5e801251c410930717abbb8f4aaecf102383ec0ac0cbec0dab16f5fd11009154e2e7260c7de14b4a52d2f5e3d898816ff8377e9c7e4592afbe716924239b56f776cf1c4a505a78ff5b8c783432bb3eeacda3ae3a73d8297de0786abe91123ea85faa3531021e6ede128fb2cc4aed1b0ef34f178e011e1b05f348d8b0d199fe97308f2ae0a681b03c273bc8925cb00850d59f8274613ee02563f61a9160bcb9b88d0c07824ef6a8f68051dc1b21fa815452b3a1b692983f5139abbc1ccc    
}    
]    
binding_signature: 3780fa22547965820a00f9e3fbe94f49f8e4d9afcd1cf561946557a08de1b28aba8597ca4159b29cf42fa4ce6beb6570af8d622f642b7ac4896c012cf8d1fb00    
transparent_to_address: TRGhNNfnmgLegT4zHNjEqDSADjgmnHvubJ    
to_amount: 80000000    
]    
    
}    
timestamp: Fri Jul 19 10:46:19 CST 2019    
fee_limit: 0    
}    
    
10:46:19.226 INFO  [main] [Client](Client.java:2040) SendShieldedCoin successful !!    
    
e sendshieldedcoinwithoutask     
Usage and parameters are consistent with the command sendshieldedcoin, the only difference is that sendshieldedcoin uses ask signature, but sendshieldedcoinwithoutask uses ak signature.    
    
f listshieldednote type          List the note scanned by the local cache address    
type		      Show type. 0 show not spent note; other value show all notes, include spend notes and not spend notes. default is 0.    
Example:  
listshieldednote 0    
Unspend note list like:    
1 ztron1ghdy60hya8y72deu0q0r25qfl60unmue6889m3xfc3296a5ut6jcyafzhtp9nlutndukufzap4h 100000000 4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1 1 UnSpend     
listshieldednote 1    
All note list like:    
ztron1ghdy60hya8y72deu0q0r25qfl60unmue6889m3xfc3296a5ut6jcyafzhtp9nlutndukufzap4h 100000000 4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1 1 UnSpend     
ztron16j06s3p5gvp2jde4vh7w3ug3zz3m62zkyfu86s7ara5lafhp22p9wr3gz0lcdm3pvt7qx0aftu4 100000000 4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1 0 Spend test1    
ztron1hn9r3wmytavslztwmlzvuzk3dqpdhwcmda2d0deyu5pwv32dp78saaslyt82w0078y6uzfg8x6w 90000000 06b55fc27f7ec649396706d149d18a0bb003347bdd7f489e3d47205da9cee802 0 Spend test2    
    
g resetshieldednote             Clean all the note scanned,rescanned all blocks.generally used when there is a problem with the notes or when switching environments    

h ScanNotebyIvk ivk startNum endNum     Scan notes by ivk    
ivk				    The ivk of shielded address    
startNum		  The starting block number of the scan     
endNum			  The end block number of the scan    
Example:      
scannotebyivk d2a4137cecf049965c4183f78fe9fc9fbeadab6ab3ef70ea749421b4c6b8de04 500 1499    
11:25:43.728 INFO  [main] [WalletApiWrapper](WalletApiWrapper.java:966)     
txid:4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1     
index:0     
address:ztron16j06s3p5gvp2jde4vh7w3ug3zz3m62zkyfu86s7ara5lafhp22p9wr3gz0lcdm3pvt7qx0aftu4     
rcm:224463fbba4ef49a4e547d5b7fe608ebd9ec717591db2f6b6644a862a5528b07     
value:100000000     
memo:test1     
11:25:43.730 INFO  [main] [WalletApiWrapper](WalletApiWrapper.java:974) complete.     
     
i ScanNotebyOvk ovk startNum endNum   Scan notes by ovk
ovk				    The ivk of shielded address
startNum		  The starting block number of the scan     
endNum			  The end block number of the scan   
Example:      
scannotebyovk a5b06ef3067855d741f966d54dfa1c124548535107333336bd9552a427f0529e 500 1499    
11:27:17.760 INFO  [main] [WalletApiWrapper](WalletApiWrapper.java:1042)     
txid:06b55fc27f7ec649396706d149d18a0bb003347bdd7f489e3d47205da9cee802    
index:0    
paymentAddress:ztron1hn9r3wmytavslztwmlzvuzk3dqpdhwcmda2d0deyu5pwv32dp78saaslyt82w0078y6uzfg8x6w    
rcm:becfc0d183a9fe0f8571c9a071bd91fafa7f84c0a5c8c704b100a1ecbd611804    
memo:test2    
value:90000000    
11:27:17.760 INFO  [main] [WalletApiWrapper](WalletApiWrapper.java:1050) complete.    
    
j GetShieldedNullifier index    Get the nullifier of the note
index			    The note index obtained by the listshieldednote command
Example:   
listshieldednote    
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
    
k ScanAndMarkNotebyAddress shieldedAddress startNum endNum  Scan the note with a locally cached shielded address and mark whether it is spent out    
shieldedAddress			  Locally cached shielded address, if it is not a locally cached shielded address, an error will be reported.    
startNum				      The starting block number of the scan 
endNum					      The end block number of the scan  
Example:    
ScanAndMarkNotebyAddress  ztron16j06s3p5gvp2jde4vh7w3ug3zz3m62zkyfu86s7ara5lafhp22p9wr3gz0lcdm3pvt7qx0aftu4 500 1500    
11:33:27.789 INFO  [main] [WalletApiWrapper](WalletApiWrapper.java:1004)     
txid:4ce5656a13049df00abc7fb3ce78d54c78944d3cbbdfdb29f288e1df5fdf67e1    
index:0    
isSpend:true    
address:ztron16j06s3p5gvp2jde4vh7w3ug3zz3m62zkyfu86s7ara5lafhp22p9wr3gz0lcdm3pvt7qx0aftu4    
rcm:224463fbba4ef49a4e547d5b7fe608ebd9ec717591db2f6b6644a862a5528b07    
value:100000000    
memo:test1    
11:33:27.789 INFO  [main] [WalletApiWrapper](WalletApiWrapper.java:1019) complete.    
    
l GetSpendingKey      Generate a sk    
Example:    
GetSpendingKey    
11:48:52.918 INFO  [main] [Client](Client.java:2194) 0eb458b309fa544066c40d80ce30a8002756c37d2716315c59a98c893dbb5f6a    
    
m getExpandedSpendingKey sk   Generate ask,nsk,ovk from sk    
Example:        
getExpandedSpendingKey 0eb458b309fa544066c40d80ce30a8002756c37d2716315c59a98c893dbb5f6a    
11:49:00.481 INFO  [main] [Client](Client.java:2212) ask:252a0f6f6f0bac114a13e1e663d51943f1df9309649400218437586dea78260e    
11:49:00.485 INFO  [main] [Client](Client.java:2213) nsk:5cd2bc8d9468dbad26ea37c5335a0cd25f110eaf533248c59a3310dcbc03e503    
11:49:00.485 INFO  [main] [Client](Client.java:2214) ovk:892a10c1d3e8ea22242849e13f177d69e1180d1d5bba118c586765241ba2d3d6    
		    
n getAkFromAsk ask          Generate ak from ask    
Example:    
GetAkFromAsk 252a0f6f6f0bac114a13e1e663d51943f1df9309649400218437586dea78260e    
11:49:33.547 INFO  [main] [Client](Client.java:2232) ak:f1b843147150027daa5b522dd8d0757ec5c8c146defd8e01b62b34cf917299f1    
    
o getNkFromNsk nsk         Generate nk from nsk    
Example:    
GetNkFromNsk 5cd2bc8d9468dbad26ea37c5335a0cd25f110eaf533248c59a3310dcbc03e503    
11:49:44.651 INFO  [main] [Client](Client.java:2250) nk:ed3dc885049f0a716a4de8c08c6cabcad0da3c437202341aa3d9248d8eb2b74a    
    
p getIncomingViewingKey ak[64] nk[64]  Generate ivk from ak and nk    
Example:    
getincomingviewingkey  f1b843147150027daa5b522dd8d0757ec5c8c146defd8e01b62b34cf917299f1  ed3dc885049f0a716a4de8c08c6cabcad0da3c437202341aa3d9248d8eb2b74a    
11:51:45.686 INFO  [main] [Client](Client.java:2272) ivk:148cf9e91f1e6656a41dc9b6c6ee4e52ff7a25b25c2d4a3a3182d0a2cd851205    
    
q GetDiversifier      Generate a diversifier    
Example:    
GetDiversifier    
11:49:19.158 INFO  [main] [Client](Client.java:2281) 11db4baf6bd5d5afd3a8b5    

r getshieldedpaymentaddress ivk[64] d[22]   Generate a shielded address from sk and d    
Example:    
GetShieldedPaymentAddress 148cf9e91f1e6656a41dc9b6c6ee4e52ff7a25b25c2d4a3a3182d0a2cd851205  11db4baf6bd5d5afd3a8b5    
11:52:33.542 INFO  [main] [Client](Client.java:2309) pkd:65c11642115d386ed716b9cc06a3498e86e303d7f20d0869c9de90e31322ac15    
11:52:33.543 INFO  [main] [Client](Client.java:2310) shieldedAddress:ztron1z8d5htmt6h26l5agk4juz9jzz9wnsmkhz6uucp4rfx8gdccr6leq6zrfe80fpccny2kp2cray8z   

s BackupShieldedAddress 	      Back up one shielded address    
Example:    
loadshieldedwallet     
Please input your password for shielded wallet.     
1qa@WS#ED        
LoadShieldedWallet successful !!!     
BackupShieldedAddress     
Please input your password for shielded wallet.     
1qa@WS#ED     
The 1th shielded address is ztron15y0cthwduz7mjpx3mc7cl9cxj8aqq9m8z08g6xns8qsvp7hgqstp9w5t8eh0vydlyf42gtxjzun     
The 2th shielded address is ztron1akz7mt4zqsjqrdrwdsmffu6g5dnehhhtahjlc0c6syy3z9nxxjrzqszy22lyx326edmwqjhqe48     
The 3th shielded address is ztron1m5dx50gryu789q5sh5207chzmmgzf5c7hvn8lr6xs60jfxvkv3d3h0kqkglc60rwq26dchztsty     
The 4th shielded address is ztron1at9ud3crdsehe8rgrjkltqly7gsp85y8qzq93pq480hzd2az55pja5cc8r4yfwrnrqqs7q35n4x     
Please choose between 1 and 4     
1     
0b1cf73b85742e13015dc6fb8d0986e4ad34c8f468bd8c73cc8fb34bff0dfacea11f85ddcde0bdb904d1de     
BackupShieldedAddress successful !!     
     
t ImportShieldedAddress         Import one shieled address to local wallet     
Example:    
ImportShieldedAddress     
Please input your password for shielded wallet.     
1qa@WS#ED     
Please input shielded address hex string. Max retry time: 3     
0b1cf73b85742e13015dc6fb8d0986e4ad34c8f468bd8c73cc8fb34bff0dfacea11f85ddcde0bdb904d1de     
Import new shielded address is: ztron15y0cthwduz7mjpx3mc7cl9cxj8aqq9m8z08g6xns8qsvp7hgqstp9w5t8eh0vydlyf42gtxjzun     
ImportShieldedAddress successful !!     
