# Chain data & utilities

Query transactions, blocks, and chain parameters, plus local encoding utilities.

## How to get transaction information

### GetTransactionById

Get transaction information based on a transaction ID.

### GetTransactionCountByBlockNum

Get the number of transactions in the block based on the block height.

```console
> GetTransactionCountByBlockNum number
```

### GetTransactionInfoById

Get transaction info based on a transaction ID, generally used to check the result of a smart contract trigger.

### GetTransactionInfoByBlockNum

Get the list of transaction information in the block based on the block height.

```console
> GetTransactionInfoByBlockNum number
```

## How to get block information

### GetBlock

Get the block according to the block number; if you do not pass the parameter, get the latest block.

```console
> GetBlock [BlockNum]
```

### GetBlockById

Get a block based on block ID.

### GetBlockByIdOrNum

Get blocks based on their ID or block height. If no parameters are passed, get the header block.

### GetBlockByLatestNum

```console
> GetBlockByLatestNum n
```

Get the latest `n` blocks, where 0 < n < 100.

### GetBlockByLimitNext

```console
> GetBlockByLimitNext start_block_number end_block_number
```

Get the blocks in the block-height range [start_block_number, end_block_number). Both arguments are block **numbers**, not block ids.

## Chain parameters & nodes

### GetChainParameters

Show all parameters that the blockchain committee can set.

```console
> GetChainParameters
```

### GetNextMaintenanceTime

Get the start time of the next maintenance period.

### ListNodes

Get other peer information.

### BroadcastTransaction

Broadcast the transaction, where the transaction is in hex-string format.

## Local utilities

### EncodingConverter

A useful encoding converter.

```console
wallet> EncodingConverter

==============================
  Encoding Converter (CLI)
==============================
1) TRON - EVM Address
2) Base64 Encode / Decode
3) Base58Check Encode / Decode
4) Public Key -> Address
5) Private Key -> Public Key & Address
0) Exit
> 
```

### GetPrivateKeyByMnemonic

Get the private key through mnemonics.

```console
wallet> GetPrivateKeyByMnemonic

Please enter 12 or 24 words (separated by spaces) [Attempt 1/3]:
```

## See also

- [account](account.md) — account-level queries
- [vote-reward](vote-reward.md) — witness lists
- [resources](resources.md) — resource unit prices
