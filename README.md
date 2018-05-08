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

rpc GetAccount (Account) returns (Account)           
rpc CreateTransaction (TransferContract) returns (Transaction)        
rpc BroadcastTransaction (Transaction) returns (Return)        
rpc ListAccounts (EmptyMessage) returns (AccountList)      
rpc CreateAccount (AccountCreateContract) returns (Transaction)      
rpc VoteWitnessAccount (VoteWitnessContract) returns (Transaction)      
rpc CreateAssetIssue (AssetIssueContract) returns (Transaction)     
rpc ListWitnesses (EmptyMessage) returns (WitnessList)     
rpc UpdateWitness (WitnessUpdateContract) returns (Transaction)     
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


冻结资金后，将获得对应数量的股权及带宽，股权可以用来投票，带宽用于交易。股权及带宽的使用及计算规则在后文中介绍。

冻结命令如下：

freezebalance password amount time
amount:冻结资金，单位是drop。amount最小为1_000_000drop，即1TRX
time：冻结时间，该值目前仅允许为3天


例子：
freezebalance 123455 10_000_000 3

冻结操作后，冻结的资金将从账户Balance中转移到Frozen，在解冻后由Frozen转移回Balance，该冻结的资金无法用于交易。

当临时需要更多的股权或带宽时，可以追加冻结资金，从而获取追加部分的股权与带宽。此时解冻时间推迟到最后一次冻结操作的3天后。

在冻结时间过后，可以解冻资金。

解冻命令如下：

unfreezebalance password 




How to vote
----------------------------------

投票需要股权，股权可以通过冻结资金获得。
- 股权的计算方法是：每冻结1TRX，就可以获得1单位股权。
- 在解冻后，以前的投票会失效。可以通过重新冻结并投票来避免投票失效。

**注意:**波场网络只记录你最后一次投票的状态，也就是说你的每一次投票都会覆盖以前所有的投票效果。

例子：
freezebalance 123455 10_000_000 3 // 冻结了10TRX，获取了10单位股权
votewitness 123455 witness1 4 witness2 6 // 同时给witness1投了4票，给witness2投了6票
votewitness 123455 witness1 10 // 给witness1投了10票

以上命令的最终结果是给witness1投了10票，给witness2投了0票



How to calculate bandwidth
----------------------------------

带宽的计算规则是： 锁定资金 * 天数 * 常数 ，假设冻结1TRX（1_000_000 DROP），时间为3天，带宽=1_000_000*3*1 = 3_000_000.

任何合约都需要消耗带宽，包括转账、转移资产、投票、冻结等，查询不消耗带宽，每个合约需要消耗100_000个带宽。

如果距离上次合约超过一定时间（10s），本次执行不消耗带宽。

发生解冻操作时，带宽不会清空，下次冻结时，新增加的带宽进行累加。


How to withdraw balance
----------------------------------

每次出块完成后，出块奖励发到账户的allowance中，每24h允许一次提取操作。从allowance转移到balance中。allowance中资金不允许锁定、交易。



How to create witness
----------------------------------
申请成为witness账户，需要消耗100_000TRX,这部分资金直接烧掉。


How to create account
----------------------------------
不允许直接创建账户，只能通过向不存在的账户转账来创建账户。向不存在的账户转账，转账金额最少1TRX。

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