# wallet-cli [![Build Status](https://travis-ci.org/tronprotocol/wallet-cli.svg?branch=master)](https://travis-ci.org/tronprotocol/wallet-cli)
Wallet CLI


Download java-tron and wallet-cli
---------------------------------
git clone https://github.com/tronprotocol/java-tron.git

git clone https://github.com/tronprotocol/wallet-cli.git


Build and run java-tron
-------------------------
cd java-tron  
./gradlew build      
./gradlew run -Pwitness
 

Build and run wallet-cli by command line
----------------------------------------
Create a new command line terminal window.

cd wallet-cli  
./gradlew build      
./gradlew run -Pcmd

Build and run web wallet
----------------------------------------
cd wallet-cli  
./gradlew build      
cd build
cd libs          
java -jar wallet-1.0-SNAPSHOT.jar


How wallet-cli connects to java-tron :
--------------------------------------
Wallet-cli connect to java-tron by grpc protocol.          
Java-tron nodes can be deployed locally or remotely.          
We can set the connected java-tron node IP in config.conf of wallet-cli.

Java-tron provides grpc api list:
------------------------------------
Please refer to the link for details.
https://github.com/tronprotocol/Documentation

rpc GetAccount (Account) returns (Account)           
rpc CreateTransaction (TransferContract) returns (Transaction)        
rpc BroadcastTransaction (Transaction) returns (Return)        
rpc ListAccounts (EmptyMessage) returns (AccountList)      
rpc CreateAccount (AccountCreateContract) returns (Transaction)      
rpc VoteWitnessAccount (VoteWitnessContract) returns (Transaction)      
rpc CreateAssetIssue (AssetIssueContract) returns (Transaction)     
rpc ListWitnesses (EmptyMessage) returns (WitnessList)     
rpc UpdateAccount (AccountUpdateContract) returns (Transaction)      
rpc CreateWitness (WitnessCreateContract) returns (Transaction)    
rpc TransferAsset (TransferAssetContract) returns (Transaction)      
rpc ParticipateAssetIssue (ParticipateAssetIssueContract) returns (Transaction)       
rpc ListNodes (EmptyMessage) returns (NodeList)      
rpc GetAssetIssueList (EmptyMessage) returns (AssetIssueList)      
rpc GetAssetIssueByAccount (Account) returns (AssetIssueList)    
rpc GetAssetIssueByName (BytesMessage) returns (AssetIssueContract)       
rpc GetNowBlock (EmptyMessage) returns (Block)         
rpc GetBlockByNum (NumberMessage) returns (Block)       
rpc FreezeBalance (FreezeBalanceContract) returns (Transaction)       
rpc UnfreezeBalance (UnfreezeBalanceContract) returns (Transaction)       
rpc WithdrawBalance (WithdrawBalanceContract) returns (Transaction)       
rpc UpdateAsset (UpdateAssetContract) returns (Transaction)       
rpc GetAccountNet (Account) returns (AccountNetMessage) 
 
Web wallet host
----------------------------------
127.0.0.0:8088                     
Note: make sure the baseUrl configured in interface.js is what you want, for example 127.0.0.1:8088.


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

Input any one of then, you will get more tips.

How to get trx
----------------------------------
you can gen one keypair and address by command line, then modify java-tron config.conf set genesis.block.assets address to yours. 

Now that you have a lot of trx, you can send it to any address.                             
With enough trx, you can issue assets, participate in asset, apply for witnesses, and more.

How to freeze/unfreeze balance
----------------------------------

After the funds are frozen, the corresponding number of shares and bandwidth will be obtained.
 Shares can be used for voting and bandwidth can be used for trading.
 The rules for the use and calculation of share and bandwidth are described later in this article.


**Freeze operation is as follows：**

```
freezebalance password amount time
```

*amount:The amount of frozen funds，the unit is drop.
The minimum value is **1000000 drop(1TRX)**.*

*time：Freeze time, this value is currently only allowed for **3 days***


For example：
```
freezebalance 123455 10000000 3
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
freezebalance 123455 10000000 3   // Freeze 10TRX and acquire 10 units of shares

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
./gradlew run -Pcmd                                                                                  
RegisterWallet 123456      (password = 123456)                                                        
login 123456                                                                                           
getAddress                 (Print 'address = f286522619d962e6f93235ca27b2cb67a9e5c27b', backup it)                                                       
BackupWallet 123456        (Print 'priKey = 22be575f19b9ac6e94c7646a19a4c89e06fe99e2c054bd242c0af2b6282a65e9', backup it) (BackupWallet2Base64 option)                                                    
getbalance                 (Print 'Balance = 0')                                                                                                                                          
 //set genesis.block.assets address to yours. restart java-tron.
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
