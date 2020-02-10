# 文档说明
本文档介绍如何通过wallet-cli在Nile测试网中使用匿名转账功能，适合于wallet-cli用户、波场生态开发者进行阅读。

## 1 Nile测试网的匿名转账
在Nile测试网中，已经支持一种基于TRC-10发行的通证TRONZ（代币TRZ，通证id：1000016）的匿名转账功能。

## 2 使用wallet-cli
### 2.1 wallet-cli的构建
wallet-cli项目代码托管在：`https://github.com/tronprotocol/wallet-cli`  
wallet-cli是一个基于命令行的钱包应用，我们简单介绍wallet-cli的构建过程，如果你已经对此很熟悉了，可以略过这个部分。简单来说，使用wallet-cli软件进行需要完成这几步：  
1）**下载项目源代码**  
```test
git clone https://github.com/tronprotocol/wallet-cli.git
```

2）**修改配置文件**  
你可以在[这里](http://nileex.io/status/getStatusPage)找到[Nile测试网](http://nileex.io)提供的公开可用节点  
```text
Public Fullnode List
47.252.19.181
47.252.3.238
```  
并在src/main/resources/config.conf这个配置文件中对fullnode中的ip.list进行修改。  
```text
net {
 type = mainnet
}

fullnode = {
  ip.list = [
    "47.252.19.181:50051"
  ]
}

#soliditynode = {
#  ip.list = [
#    "127.0.0.1:50052"
#  ]
#}

RPC_version = 2
```
3）**将项目源代码进行构建**  
```test
$ cd wallet-cli
$ ./gradlew build
```

4）**使用构建好的wallet-cli.jar**
```test
$ cd build/libs
$ java -jar wallet-cli.jar
```

如果你在构建wallet-cli软件的过程中遇到任何问题，请参考[wallet-cli使用教程](https://github.com/tronprotocol/wallet-cli#get-started)，当你看到以下输出，说明wallet-cli软件已经成功运行。
```text
Welcome to Tron Wallet-Cli
Please type one of the following commands to proceed.
Login, RegisterWallet or ImportWallet
 
You may also use the Help command at anytime to display a full list of commands.
 
wallet> 
```

*以下所有命令的演示过程都是在wallet-cli这个软件中进行的。*  

### 2.2 匿名钱包和匿名地址
匿名钱包和匿名地址是一对多的关系，即一个匿名钱包中可以创建多个匿名地址。另外，匿名地址可以从匿名钱包中被导出，并且匿名地址也可以被导入到匿名钱包中。下面介绍一些相关的命令。
#### 2.2.1 创建匿名地址
> 执行命令`GenerateShieldedAddress`创建匿名地址，如果此时本地还没有匿名钱包，这个命令会首先创建一个匿名钱包，然后再创建一个匿名地址。  

```text
wallet> GenerateShieldedAddress 
ShieldedAddress list:
ztron13ef0cjxz536snelt0rdnyqe80h2qq8j2zsh8kx7fqm4grh35rnnycx5rmewq6xwsn5elzfyshrx
```

至此成功创建了1个匿名地址:  
`ztron13ef0cjxz536snelt0rdnyqe80h2qq8j2zsh8kx7fqm4grh35rnnycx5rmewq6xwsn5elzfyshrx`  
**注意：`GenerateShieldedAddress n`命令也支持一次性创建n个匿名地址，如果不填写参数n则默认创建1个匿名地址，如一次性创建5个匿名地址的命令**
```test
GenerateShieldedAddress 5 
```
此时，你可以尝试查看之前已经创建的匿名地址。
#### 2.2.2 查看匿名地址  
> 执行命令`ListShieldedAddress`可以查看匿名钱包中已经创建的匿名地址。  
```test  
wallet> ListShieldedAddress 
ShieldedAddress :
ztron13ef0cjxz536snelt0rdnyqe80h2qq8j2zsh8kx7fqm4grh35rnnycx5rmewq6xwsn5elzfyshrx
```

如果你重新运行wallet-cli程序，可以通过下面命令登陆到已经创建成功的本地钱包。
#### 2.2.3 登陆匿名钱包  
> 执行`LoadShieldedWallet`命令登陆本地的匿名钱包。  
```test 
wallet> LoadShieldedWallet 
Please input your password for shielded wallet.
password: 
user defined config file doesn't exists, use default config file in jar
LoadShieldedWallet successful !!!
```

当然，你有时可能需要将本地的匿名地址同时备份到其他匿名钱包中，这可通过以下两个命令完成： 
#### 2.2.4 导出匿名钱包地址  
> 在本地钱包执行命令`BackupShieldedWallet`将匿名钱包地址进行导出:  
  
```test
wallet> BackupShieldedWallet
Please input your password for shielded wallet.
password: 
The 1th shielded address is ztron13ef0cjxz536snelt0rdnyqe80h2qq8j2zsh8kx7fqm4grh35rnnycx5rmewq6xwsn5elzfyshrx
sk:00645e78310c0619a62defeb5be3d48ba183f66e249c63e2eed4164e072e87ea
d :8e52fc48c2a47509e7eb78
BackupShieldedWallet successful !!!
```
#### 2.2.5 导入匿名地址  
> 在其他匿名钱包中执行`ImportShieldedWallet`命令将该匿名地址进行导入:  

```test  
wallet> ImportShieldedWallet
Please input your password for shielded wallet.
password: 
Please input shielded wallet hex string. such as 'sk d',Max retry time:3
00645e78310c0619a62defeb5be3d48ba183f66e249c63e2eed4164e072e87ea 8e52fc48c2a47509e7eb78
Import shielded wallet hex string is : 
sk:00645e78310c0619a62defeb5be3d48ba183f66e249c63e2eed4164e072e87ea
d :8e52fc48c2a47509e7eb78
Import new shielded wallet address is: ztron13ef0cjxz536snelt0rdnyqe80h2qq8j2zsh8kx7fqm4grh35rnnycx5rmewq6xwsn5elzfyshrx
ImportShieldedWallet successful !!!
```

**警告:导出匿名地址和导入匿名地址过程中的字符串`sk:00645e78310c0619a62defeb5be3d48ba183f66e249c63e2eed4164e072e87ea d :8e52fc48c2a47509e7eb78`是重要的秘密信息，请不要泄露给其他人。**

如果你准备好了匿名钱包，就可以进行匿名转账了，当然在此之前，我们先通过普通钱包获取一些TRZ。你可以首先创建一个普通钱包，它包含了一个公开地址。我们使用已经注册好的一个普通钱包，它包含一个公开地址`TU23LEoPKbC5xKXTEJzLFp7R2ZEWbuKiXq`，然后在[页面](http://nileex.io/join/getJoinPage)上请求获取一些TRZ用于测试。
![](./../images/nile_shielded_usage7.png)  

*在完成这些准备工作后，下面介绍如何基于wallet-cli的匿名钱包地址进行匿名转账*  

### 2.3 匿名转账

#### 2.3.1 概述
有三种模式的转账涉及到匿名地址，分别是：

| 转出地址 | ---> | 转入地址 |
| ---------|---------|-------- |
| `公开地址` | ---> | `匿名地址` |
| `匿名地址` | ---> | `匿名地址` |
| `匿名地址` | ---> | `公开地址` |
  
以上三种模式的匿名转账都可通过命令 —— `SendShieldedCoin`完成，无论是哪种模式的转账，**都要花费固定的手续费10TRZ**，这个数据会影响命令参数的设置，因此请务必谨记。另外一点，`SendShieldedCoin` 命令中TRZ数量单位都是`1,000,000`，即`1TRZ`在命令中的参数需要表示为`1000000`。

#### 2.3.2 SendShieldedCoin命令使用
下面我们先看一下`SendShieldedCoin`命令的完整描述和相关参数的含义：
```test
SendShieldedCoin [publicFromAddress] fromAmount shieldedInputNum input1 publicToAddress toAmount shieldedOutputNum shieldedAddress1 amount1 memo1 ... 
```
`publicFromAddress` 转出的公开地址，公开地址转账给匿名地址时使用，不需要则设置为`null`，如果不设置这个参数，则会默认使用当前登陆的钱包地址。  
`fromAmount` 公开地址转出的金额，如果`publicFromAddress`设置为`null`，该变量必须设置为`0`。  
`shieldedInputNum` 转出匿名note的个数，可以设置成`0`或者`1`。  
`input1` 匿名note在本地的序号，个数跟`shieldedInputNum`保存一致，如果`shieldedInputNum`为`0`，则这些变量不需要设置。  
`publicToAddress` 转入公开地址，匿名地址转账给公开地址时使用。  
`toAmount` 转入到公开地址金额。  
`shieldedOutputNum` 转入匿名note的个数，可以设置成`0`、`1`或者`2`。  
`shieldedAddress1` 转入匿名地址。  
`amount1` 转入到匿名地址`shieldedAddress1`的金额。  
`memo1` note的备注（最多512个字节）可以在不需要时设置为`null`。 

**注意：一个合法的`SendShieldedCoin`命令必须保证从转出地址转出的TRZ数量等于所有转入地址收到的TRZ数量与手续费之和。我们在下面的例子中也会提到这一点。**

*下面是分别为这三种转账模式举的例子：*  
##### 2.3.2.1	公开地址向匿名地址转账
```test
SendShieldedCoin TU23LEoPKbC5xKXTEJzLFp7R2ZEWbuKiXq 210000000 0 null 0 2 ztron16uz8hugh397ndwrxxxfr6kne2jc3zry4msdls4rw8d0m79v9w0tus9czwafys8qa9ynpkzlz4ym 120000000 first ztron13ef0cjxz536snelt0rdnyqe80h2qq8j2zsh8kx7fqm4grh35rnnycx5rmewq6xwsn5elzfyshrx 80000000 second
```

注意公开地址转出，需要额外进行签名的步骤，如果成功，可以看到下面的结果。

```test
wallet> SendShieldedCoin TU23LEoPKbC5xKXTEJzLFp7R2ZEWbuKiXq 210000000 0 null 0 2 ztron16uz8hugh397ndwrxxxfr6kne2jc3zry4msdls4rw8d0m79v9w0tus9czwafys8qa9ynpkzlz4ym 120000000 first ztron13ef0cjxz536snelt0rdnyqe80h2qq8j2zsh8kx7fqm4grh35rnnycx5rmewq6xwsn5elzfyshrx 80000000 second

... ...
Please confirm and input your permission id, if input y or Y means default 0, other non-numeric characters will cancell transaction.
y
Please choose your key for sign.
The 1th keystore file name is UTC--2019-12-31T17-01-51.940000000Z--TEKqBNRDPRW7MGS4SHvNwHAcgkhH6jzH87.json
The 2th keystore file name is UTC--2019-12-31T09-22-43.363000000Z--TU23LEoPKbC5xKXTEJzLFp7R2ZEWbuKiXq.json

Please choose between 1 and 2
2
Please input your password.
password: 

... ...

txid is ecd3149beb35b3dd817a1f26ebd5a471a3273429af643484f07bece892d4e45b
SendShieldedCoin successful !!!
```
  
*命令解读:*  
从公开地址`TU23LEoPKbC5xKXTEJzLFp7R2ZEWbuKiXq转出210TRZ`，其中向匿名地址`ztron16uz8hugh397ndwrxxxfr6kne2jc3zry4msdls4rw8d0m79v9w0tus9czwafys8qa9ynpkzlz4ym`转出120TRZ，并附言`first`，向匿名地址 
`ztron13ef0cjxz536snelt0rdnyqe80h2qq8j2zsh8kx7fqm4grh35rnnycx5rmewq6xwsn5elzfyshrx`转出80TRZ，并附言`second`。  
手续费10TRZ。
> *可以验证 210 TRZ = 120 TRZ + 80 TRZ + 10 TRZ*

命令成功执行之后，本地钱包中会增加2个note，通过`listshieldednote 0`命令获取本地钱包中所有UnSpend状态的note，可以看到如下结果：  
```test
wallet> listshieldednote 0
Unspent note list like:
0 ztron16uz8hugh397ndwrxxxfr6kne2jc3zry4msdls4rw8d0m79v9w0tus9czwafys8qa9ynpkzlz4ym 120000000 ecd3149beb35b3dd817a1f26ebd5a471a3273429af643484f07bece892d4e45b 0 UnSpend first
1 ztron13ef0cjxz536snelt0rdnyqe80h2qq8j2zsh8kx7fqm4grh35rnnycx5rmewq6xwsn5elzfyshrx 80000000 ecd3149beb35b3dd817a1f26ebd5a471a3273429af643484f07bece892d4e45b 1 UnSpend second
```

**注意所有UnSpend状态的note都会有一个编号，即每条note开头的那个数字，这个会在我们下面介绍转出地址是匿名地址的时候很有用。**

通过匿名地址向其他地址进行转账时，只有标记为UnSpend状态的note才能被匿名转出，由于1个匿名地址可以有多个note，所以需要填写note编号来指定要转出匿名地址中的note具体是哪一个。

##### 2.3.2.2 匿名地址向匿名地址转账  
为了更方便地说明，我们选择在本地钱包的两个匿名地址之间进行转账.  
  
```test
wallet> SendShieldedCoin null 0 1 1 null 0 1 ztron16uz8hugh397ndwrxxxfr6kne2jc3zry4msdls4rw8d0m79v9w0tus9czwafys8qa9ynpkzlz4ym 70000000 third
```
  
*命令解读:*  
匿名地址`ztron13ef0cjxz536snelt0rdnyqe80h2qq8j2zsh8kx7fqm4grh35rnnycx5rmewq6xwsn5elzfyshrx`的1号note转出的金额为80TRZ，转入到匿名地址`ztron16uz8hugh397ndwrxxxfr6kne2jc3zry4msdls4rw8d0m79v9w0tus9czwafys8qa9ynpkzlz4ym`的金额为70TRZ。  
手续费是10TRZ。
> *可以验证 80 TRZ = 70 TRZ + 10 TRZ*

命令执行成功之后，再查看本地钱包所有的note，可以看出之前80TRZ的那个note已经变成Spent状态，多出来一个UnSpend状态的70TRZ的note。
```test
wallet> listshieldednote 1
All notes list like:
ztron16uz8hugh397ndwrxxxfr6kne2jc3zry4msdls4rw8d0m79v9w0tus9czwafys8qa9ynpkzlz4ym 120000000 ecd3149beb35b3dd817a1f26ebd5a471a3273429af643484f07bece892d4e45b 0 UnSpent first
ztron16uz8hugh397ndwrxxxfr6kne2jc3zry4msdls4rw8d0m79v9w0tus9czwafys8qa9ynpkzlz4ym 70000000 f95185394430b49a865488a7ffc8c7e4306eecd6fcd94d9bdc3018a810879a49 0 UnSpent third
ztron13ef0cjxz536snelt0rdnyqe80h2qq8j2zsh8kx7fqm4grh35rnnycx5rmewq6xwsn5elzfyshrx 80000000 ecd3149beb35b3dd817a1f26ebd5a471a3273429af643484f07bece892d4e45b 1 Spent second
```

##### 2.3.2.3 匿名地址向公开地址转账  
首先依然通过`listshieldednote 0`命令获取本地匿名地址对应的note，  
  
```test
wallet> listshieldednote 0
Unspent note list like:
0 ztron16uz8hugh397ndwrxxxfr6kne2jc3zry4msdls4rw8d0m79v9w0tus9czwafys8qa9ynpkzlz4ym 120000000 ecd3149beb35b3dd817a1f26ebd5a471a3273429af643484f07bece892d4e45b 0 UnSpend first
2 ztron16uz8hugh397ndwrxxxfr6kne2jc3zry4msdls4rw8d0m79v9w0tus9czwafys8qa9ynpkzlz4ym 70000000 f95185394430b49a865488a7ffc8c7e4306eecd6fcd94d9bdc3018a810879a49 0 UnSpend third
```

然后执行下面的命令:  
```test
sendshieldedcoin null 0 1 0 TU23LEoPKbC5xKXTEJzLFp7R2ZEWbuKiXq 110000000 0
```
  
*命令解读:*  
匿名地址`ztron16uz8hugh397ndwrxxxfr6kne2jc3zry4msdls4rw8d0m79v9w0tus9czwafys8qa9ynpkzlz4ym`的0号note转出120TRZ，公开地址 `TU23LEoPKbC5xKXTEJzLFp7R2ZEWbuKiXq`收到110TRZ。  
手续费10TRZ。  
> *可以验证 120 TRZ = 110 TRZ + 10 TRZ。*  
  
如果命令执行成功，再通过执行`listshieldednote 1`命令可以看到之前的UnSpend状态的120TRZ的note已经变为Spent状态了。  

```test
wallet> listshieldednote 1
All notes list like:
ztron16uz8hugh397ndwrxxxfr6kne2jc3zry4msdls4rw8d0m79v9w0tus9czwafys8qa9ynpkzlz4ym 70000000 f95185394430b49a865488a7ffc8c7e4306eecd6fcd94d9bdc3018a810879a49 0 UnSpent third
ztron13ef0cjxz536snelt0rdnyqe80h2qq8j2zsh8kx7fqm4grh35rnnycx5rmewq6xwsn5elzfyshrx 80000000 ecd3149beb35b3dd817a1f26ebd5a471a3273429af643484f07bece892d4e45b 1 Spent second
ztron16uz8hugh397ndwrxxxfr6kne2jc3zry4msdls4rw8d0m79v9w0tus9czwafys8qa9ynpkzlz4ym 120000000 ecd3149beb35b3dd817a1f26ebd5a471a3273429af643484f07bece892d4e45b 0 Spent first
```

## 支持
本文尽可能向用户介绍wallet-cli软件的相关内容，并着重介绍通过wallet-cli进行匿名转账的一些基本命令，如果你有任何疑问或发现任何错误，欢迎加入我们的讨论 [Gitter](https://gitter.im/tronprotocol/wallet-cli)
