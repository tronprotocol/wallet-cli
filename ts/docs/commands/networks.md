# wallet-cli networks

List known networks.

## Synopsis

```
wallet-cli networks [options]
```

## Description

Lists every network wallet-cli knows, with the short alias `--network` also accepts. Purely local — no node is contacted.

**Network** is the canonical id, `family:chain-id`; **Alias** is the short name you can type instead. Both resolve to the same network, and nothing downstream ever sees the alias.

Endpoints are shown as **hosts only**. A commercial RPC endpoint can carry its API key in the URL path, and this listing is output people paste into issues and CI logs; read the full URL with `config networks.<id>.httpEndpoint`, which is a deliberate named read rather than a listing.

## Options

[Global options](index.md) only.

## Examples

```bash
wallet-cli networks
```

```console
| Network      | Alias       | Family | Chain id | Fee model     | Endpoint                            |
| ------------ | ----------- | ------ | -------- | ------------- | ----------------------------------- |
| tron:mainnet | tron        | tron   | mainnet  | tron-resource | api.trongrid.io                     |
| tron:nile    | nile        | tron   | nile     | tron-resource | nile.trongrid.io                    |
| tron:shasta  | shasta      | tron   | shasta   | tron-resource | api.shasta.trongrid.io              |
| evm:1        | ethereum    | evm    | 1        | evm-gas       | ethereum-rpc.publicnode.com         |
| evm:11155111 | sepolia     | evm    | 11155111 | evm-gas       | ethereum-sepolia-rpc.publicnode.com |
| evm:56       | bsc         | evm    | 56       | evm-gas       | bsc-dataseed.bnbchain.org           |
| evm:97       | bsc-testnet | evm    | 97       | evm-gas       | bsc-testnet-dataseed.bnbchain.org   |
```

```bash
wallet-cli networks -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"networks","data":[{"id":"tron:mainnet","alias":"tron","family":"tron","chainId":"mainnet","feeModel":"tron-resource","endpoint":"api.trongrid.io"},{"id":"tron:nile","alias":"nile","family":"tron","chainId":"nile","feeModel":"tron-resource","endpoint":"nile.trongrid.io"},{"id":"evm:11155111","alias":"sepolia","family":"evm","chainId":"11155111","feeModel":"evm-gas","endpoint":"ethereum-sepolia-rpc.publicnode.com"}],"meta":{"durationMs":2,"warnings":[]}}
```

## Output

`data` is an array, one entry per known network. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Canonical network id, `family:chain-id` |
| `alias` | string | Short name `--network` also accepts |
| `family` | string | Chain family — `tron` or `evm` |
| `chainId` | string | Chain identifier within the family — `nile`, or an EIP-155 number as a string |
| `feeModel` | string | `tron-resource` or `evm-gas` |
| `endpoint` | string | **Host only** of the configured endpoint; `config networks.<id>.httpEndpoint` gives the full URL |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[Networks concept](../concepts/networks.md) · [`config`](config.md)
