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
 

Build and run wallet-cli
------------------------
Create a new command line terminal window.

cd wallet-cli
./gradlew build      
./gradlew run -Pcmd
 
wallet-cli supported commands
-----------------------------

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
