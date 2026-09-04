# wallet-cli networks

List known networks.

## Synopsis

```
wallet-cli networks [options]
```

## Description

Lists every network wallet-cli knows, with the short alias `--network` also accepts. Purely local — no node is contacted.

**Network** is the canonical CAIP-2 id, `namespace:reference`; **Alias** is the short name you can type instead. Both resolve to the same network, and nothing downstream ever sees the alias. The TRON ids used before CAIP-2 (`tron:mainnet`, `tron:nile`, `tron:shasta`) also still resolve, as permanent aliases.

Endpoints are shown as **hosts only**. A commercial RPC endpoint can carry its API key in the URL path, and this listing is output people paste into issues and CI logs; read the full URL with `config networks.<id>.httpEndpoint`, which is a deliberate named read rather than a listing.

## Options

[Global options](index.md) only.

## Examples

```bash
wallet-cli networks
```

```console
| Network         | Alias       | Family | Chain id   | Fee model     | Endpoint                            |
| --------------- | ----------- | ------ | ---------- | ------------- | ----------------------------------- |
| tron:728126428  | tron        | tron   | 728126428  | tron-resource | api.trongrid.io                     |
| tron:3448148188 | nile        | tron   | 3448148188 | tron-resource | nile.trongrid.io                    |
| tron:2494104990 | shasta      | tron   | 2494104990 | tron-resource | api.shasta.trongrid.io              |
| eip155:1        | ethereum    | evm    | 1          | evm-gas       | ethereum-rpc.publicnode.com         |
| eip155:11155111 | sepolia     | evm    | 11155111   | evm-gas       | ethereum-sepolia-rpc.publicnode.com |
| eip155:56       | bsc         | evm    | 56         | evm-gas       | bsc-dataseed.bnbchain.org           |
| eip155:97       | bsc-testnet | evm    | 97         | evm-gas       | bsc-testnet-dataseed.bnbchain.org   |
```

```bash
wallet-cli networks -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"networks","data":[{"id":"tron:728126428","alias":"tron","family":"tron","chainId":"728126428","feeModel":"tron-resource","endpoint":"api.trongrid.io"},{"id":"tron:3448148188","alias":"nile","family":"tron","chainId":"3448148188","feeModel":"tron-resource","endpoint":"nile.trongrid.io"},{"id":"tron:2494104990","alias":"shasta","family":"tron","chainId":"2494104990","feeModel":"tron-resource","endpoint":"api.shasta.trongrid.io"},{"id":"eip155:1","alias":"ethereum","family":"evm","chainId":"1","feeModel":"evm-gas","endpoint":"ethereum-rpc.publicnode.com"},{"id":"eip155:11155111","alias":"sepolia","family":"evm","chainId":"11155111","feeModel":"evm-gas","endpoint":"ethereum-sepolia-rpc.publicnode.com"},{"id":"eip155:56","alias":"bsc","family":"evm","chainId":"56","feeModel":"evm-gas","endpoint":"bsc-dataseed.bnbchain.org"},{"id":"eip155:97","alias":"bsc-testnet","family":"evm","chainId":"97","feeModel":"evm-gas","endpoint":"bsc-testnet-dataseed.bnbchain.org"}],"meta":{"durationMs":2,"warnings":[]}}
```

## Output

`data` is an array, one entry per known network. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Canonical CAIP-2 network id, `namespace:reference` |
| `alias` | string | Short name `--network` also accepts |
| `family` | string | Chain family — `tron` or `evm` |
| `chainId` | string | The canonical id's second segment — an EIP-155 number on EVM, the decimal genesis-hash prefix on TRON |
| `feeModel` | string | `tron-resource` or `evm-gas` |
| `endpoint` | string | **Host only** of the configured endpoint; `config networks.<id>.httpEndpoint` gives the full URL |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[Networks concept](../concepts/networks.md) · [`config`](config.md)
