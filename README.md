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
GetAssetIssueByName   
Getblock   
Exit or Quit  
help  

Input any one of then, you will get more tips.

How to get trx
----------------------------------
use command line：                       
importWallet 123456 cba92a516ea09f620a16ff7ee95ce0df1d56550a8babe9964981a7144c8a784a                              
or            
importwalletByBase64 123456 y6kqUW6gn2IKFv9+6Vzg3x1WVQqLq+mWSYGnFEyKeEo=                  

use web wallte             
You can login by y6kqUW6gn2IKFv9+6Vzg3x1WVQqLq+mWSYGnFEyKeEo= 

Now that you have a lot of trx, you can send it to any address.                             
With enough trx, you can issue assets, participate in asset, apply for witnesses, and more.


