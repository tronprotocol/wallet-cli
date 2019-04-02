# wallet-cli [![Build Status](https://travis-ci.org/tronprotocol/wallet-cli.svg?branch=master)](https://travis-ci.org/tronprotocol/wallet-cli)
Wallet CLI


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
  