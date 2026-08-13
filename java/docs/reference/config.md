# Configuration reference

Full reference for `config.conf`. wallet-cli reads the node config from `src/main/resources/config.conf`. You can also switch networks at runtime with the [`SwitchNetwork`](../commands/network.md) command, so editing `config.conf` is only needed for a custom node or the advanced features below.

## Minimal config

A minimal `config.conf` only needs a network type and a full node to talk to:

```
net {
  type = mainnet
}

fullnode = {
  ip.list = [
    "fullnode ip : port"
  ]
}
```

## Full annotated config

Optional Solidity node, Ledger debug, account lock, GasFree, TronGrid API key, TronLink multi-sig, and record limits:

```
net {
 type = mainnet
}

fullnode = {
  ip.list = [
    "fullnode ip : port"
  ]
}

#soliditynode = {
#  //The IPs in this list can only be totally set to solidity.
#  ip.list = [
#     "ip : solidity port" // default solidity
#  ]
#  // NOTE: solidity node is optional
#}

# open ledger debug
# ledger_debug = true

# To use the lock and unlock function of the login account, it is necessary to configure
# lockAccount = true in the config.conf. The current login account is locked, which means that
# signatures and transactions are not allowed. After the current login account is locked, it can be
# unlocked. By default, it will be unlocked again after 300 seconds. Unlocking can specify
# parameters in seconds.

# lockAccount = true

# To use the gasfree feature, please first apply for an APIkey and apiSecret.
# For details, please refer to
# https://docs.google.com/forms/d/e/1FAIpQLSc5EB1X8JN7LA4SAVAG99VziXEY6Kv6JxmlBry9rUBlwI-GaQ/viewform
gasfree = {
  mainnet = {
     apiKey = ""
     apiSecret = ""
  }
  testnet = {
     apiKey = ""
     apiSecret = ""
  }
}

# If gRPC requests on the main network are limited in speed, you can apply for an apiKey of Trongrid to improve the user experience
grpc = {
  mainnet = {
    apiKey = ""
  }
}

# Set the maximum number of transactions and backup records that can be retained
maxRecords = 1000

# To use the tronlink multi-sign feature, please first apply for an secretId and secretKey.
# For details, please refer to
# https://docs.google.com/forms/d/e/1FAIpQLSc5EB1X8JN7LA4SAVAG99VziXEY6Kv6JxmlBry9rUBlwI-GaQ/viewform
# If you prefer not to apply, a speed-limited secretId and secretKey will be provided for use:
# secretId = "TEST", secretKey = "TESTTESTTEST", channel = "test".
tronlink = {
  mainnet = {
    secretId = ""
    secretKey = ""
    channel = ""
  }
  testnet = {
    secretId = ""
    secretKey = ""
    channel = ""
  }
}
```

## Field summary

| Field | Purpose |
|---|---|
| `net.type` | Network type (e.g. `mainnet`). |
| `fullnode.ip.list` | Full node endpoint(s) `ip : port`. |
| `soliditynode.ip.list` | Optional Solidity node endpoint(s). |
| `ledger_debug` | Enable Ledger debug output. |
| `lockAccount` | Enable the [`Lock`/`Unlock`](../commands/wallet.md#lock) feature (default unlock duration 300 seconds). |
| `gasfree.{mainnet,testnet}.apiKey` / `apiSecret` | [GasFree](../commands/gasfree.md) credentials. |
| `grpc.mainnet.apiKey` | TronGrid API key to raise gRPC rate limits. |
| `maxRecords` | Maximum retained transactions / backup records. |
| `tronlink.{mainnet,testnet}.secretId` / `secretKey` / `channel` | [TronLink multi-sign](../commands/multisig.md#tronlinkmultisign) credentials. |

## Connecting to Java-tron

wallet-cli connects to Java-tron via the gRPC protocol, which can be deployed locally or remotely. Configure the Java-tron node IP and port in `src/main/resources/config.conf` so wallet-cli can talk to the node. You can also use `SwitchNetwork` to switch among mainnet, testnets (Nile and Shasta), and custom networks — see [commands/network](../commands/network.md).

## See also

- [../../README.md](../../README.md) — install and build steps
- [commands/network](../commands/network.md) · [commands/gasfree](../commands/gasfree.md) · [commands/multisig](../commands/multisig.md)
