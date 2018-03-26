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
rpc GetNowBlock (EmptyMessage) returns (Block)      
rpc GetBlockByNum (NumberMessage) returns (Block)       
 
Wallet-cli supported command list:
----------------------------------

RegisterWallet  
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
SendCoin  
TransferAsset  
ParticipateAssetissue  
Assetissue  
CreateWitness  
VoteWitness  
Listaccounts  
Listwitnesses  
Listassetissue  
Getblock  
Exit or Quit  
help  

Input any one of then, you will get more tips.


