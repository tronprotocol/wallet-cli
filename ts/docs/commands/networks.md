# wallet-cli networks

List known networks.

## Synopsis

```
wallet-cli networks [options]
```

## Options

[Global options](index.md) only.

## Examples

```console
$ wallet-cli networks
| Network      | Family | Chain   | Fee model     |
| ------------ | ------ | ------- | ------------- |
| tron:mainnet | tron   | mainnet | tron-resource |
| tron:nile    | tron   | nile    | tron-resource |
| tron:shasta  | tron   | shasta  | tron-resource |
```

```console
$ wallet-cli networks -o json
{"schema":"wallet-cli.result.v1","success":true,"command":"networks","data":[{"id":"tron:mainnet","family":"tron","chainId":"mainnet","feeModel":"tron-resource"},{"id":"tron:nile","family":"tron","chainId":"nile","feeModel":"tron-resource"},{"id":"tron:shasta","family":"tron","chainId":"shasta","feeModel":"tron-resource"}],"meta":{"durationMs":2,"warnings":[]}}
```

## Output

`data` is an array, one entry per known network. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Canonical network id (`family:chain`) |
| `family` | string | Chain family, e.g. `tron` |
| `chainId` | string | Chain identifier within the family, e.g. `mainnet` |
| `feeModel` | string | Fee model, e.g. `tron-resource` |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[Networks concept](../concepts/networks.md) · [`config`](config.md)
