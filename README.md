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