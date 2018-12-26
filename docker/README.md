# Command 

`docker image build -t tron-wallet-cli .`


# diff from official
## official:  
https://github.com/tronprotocol/wallet-cli  
failed

https://github.com/flyq/wallet-cli/blob/master/gradle/wrapper/gradle-wrapper.properties#L6

https://github.com/flyq/wallet-cli/blob/master/src/main/resources/config.conf#L7  



# docker address
https://cloud.docker.com/repository/docker/flyq/tron-wallet-cli-test
flyq/tron-wallet-cli-test


$ cd build/libs
$ java -jar ./wallet-cli.jar
导入私钥:   
导入私钥的过程会创建一个钱包   
> ImportWallet   
Please input password.   
password:   
Please input password again.   
password:  
Please input private key.  
7C98xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1DDF280C  
Import a wallet successful, keystore file name is UTC--2018-12-26T10-11-51.545000000Z--TCi3dTqMtduzTCKs7wHd9JQ2nBPqpgZQdM.json   

转trx：  
SendCoin ToAddress Amount   
> SendCoin TApJWSBd1tPgGnXjQzUTizGcQWvEMoLPBs 1   

转移其他资产  
TransferAsset ToAddress AssertName Amount   
> TransferAsset TApJWSBd1tPgGnXjQzUTizGcQWvEMoLPBs GOC 1   
