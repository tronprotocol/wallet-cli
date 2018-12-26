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

转移其他资产  TRC10
TransferAsset ToAddress AssertName Amount   
> TransferAsset TApJWSBd1tPgGnXjQzUTizGcQWvEMoLPBs GOC 1   

TRC20 (TRC20要基于合约，所有要调用合约)
# 调用合约指令
TriggerContract contract_address method args isHex fee_limit value token_value token_id(e.g: TRXTOKEN, use # if don't provided)

# 参数说明
contract_address:即之前部署过合约的地址，格式 base58，如：TTWq4vMEYB2yibAbPV7gQ4mrqTyX92fha6
method:调用的函数签名，如set(uint256,uint256)或者 fool()，参数使用','分割且不能有空格
args:如果非十六进制，则自然输入使用','分割且不能有空格，如果是十六进制，直接填入即可
is_hex：输入参数是否为十六进制，false 或者 true
fee_limit:和deploycontract的时候类似，表示本次部署合约消耗的TRX的上限，单位是SUN(1 SUN = 10^-6 TRX)，包括CPU资源、STORAGE资源和可用余额的消耗。
value:在部署合约时，给该合约转账金额
token_value: 转trc10 token的个数
token_id: 转trc10 token的tokenid

# 调用的例子
## 设置 mapping 1->1
triggercontract TTWq4vMEYB2yibAbPV7gQ4mrqTyX92fha6 set(uint256,uint256) 1,1 false 1000000 0 0 #

## 取出 mapping key = 1的 value
triggercontract TTWq4vMEYB2yibAbPV7gQ4mrqTyX92fha6 get(uint256) 1 false 1000000  0000000000000000000000000000000000000000000000000000000000000000

## 给TApJWSBd1tPgGnXjQzUTizGcQWvEMoLPBs地址转移1000000个最小单位(看token的小数位，如果和trx一样，那么就是1 trx)的部署在TTWq4vMEYB2yibAbPV7gQ4mrqTyX92fha6的token   
triggercontract TTWq4vMEYB2yibAbPV7gQ4mrqTyX92fha6 transfer(address,uint256) TApJWSBd1tPgGnXjQzUTizGcQWvEMoLPBs,1000000 false 1000000 0 0 #
