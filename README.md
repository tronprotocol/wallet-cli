# wallet-cli [![Build Status](https://travis-ci.org/tronprotocol/wallet-cli.svg?branch=master)](https://travis-ci.org/tronprotocol/wallet-cli)
Wallet CLI


Download java-tron and wallet-cli

git clone https://github.com/tronprotocol/java-tron.git

git clone https://github.com/tronprotocol/wallet-cli.git


Build and run java-tron

cd java-tron

./gradlew build      
./gradlew run
 

Build and run wallet-cli  
Create a new command line terminal window.

cd wallet-cli

./gradlew build      
./gradlew run -Pcmd
 
You can enter the following command: 

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

Input any one of then, you will get more tips.

## Build webpack

Building the frontend requires [nodejs](https://nodejs.org/en/) and [yarn](https://yarnpkg.com/en/)

```
> yarn install
> yarn build:dev
```
