# wallet-cli 8004 show

Load one Agent directly from the Identity Registry.

## Synopsis

```
wallet-cli 8004 show <id> [options]
```

## Description

Reads the Agent's owner, URI, and per-Agent approved operator from the registry of the selected network, then loads the registration document the URI points to. No wallet or password is needed.

The on-chain fields always come back. Loading the document is best-effort, and **only `https://` and `http://` URIs are fetched**. The response must be JSON (`application/json`, UTF-8), at most 1 MiB, and a JSON object; redirects and addresses on local or private networks are refused, and the request gives up after at most 10 seconds.

Anything else becomes a warning instead of an error, and the document is left out. That includes `data:` and `ipfs://` URIs: [`8004 register`](register.md) and [`8004 update`](update.md) accept them, but `show` does not read them. The warning is in `meta.warnings` (text output prints it as `warning: …`).

A loaded document appears whole under `data.metadata`; text output shows its `name`, `description`, `image`, and the names of its `services` (or `endpoints`).

`approved` is the zero address when no operator is approved — `T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb` on TRON, `0x0000000000000000000000000000000000000000` on EVM — which text output shows as `None`.

Runs on networks with an ERC-8004 Identity Registry: `tron`, `nile`, `shasta`, `bsc`, `bsc-testnet`, `base`, `base-sepolia`. See [`8004`](index.md).

## Arguments

- `id` — Agent ID, a decimal number. It may be prefixed with its canonical network id, `<network-id>:<id>` (for example `tron:3448148188:172` or `eip155:97:42`); that network must be the selected one, and an alias such as `nile:172` is not accepted

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only.

## Examples

Show Agent 55 on Base, whose registration document is served over HTTPS:

```bash
wallet-cli 8004 show 55 --network base
```

```console
Agent ID     55
Owner        0x67722c823010ceb4bed5325fe109196c0f67d053
URI          https://marketplace.olas.network/erc8004/base/ai-agents/53
Approved     None
Registry     0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
Name         garnor-tarko73 by Olas
Description  An optimism liquidity trader service.
Image        https://gateway.autonolas.tech/ipfs/bafybeiaakdeconw7j5z76fgghfdjmsr6tzejotxcwnvmp3nroaw3glgyve
Endpoints    web
```

```bash
wallet-cli 8004 show 55 --network base -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"8004.show","data":{"agentId":"55","owner":"0x67722c823010ceb4bed5325fe109196c0f67d053","uri":"https://marketplace.olas.network/erc8004/base/ai-agents/53","approved":"0x0000000000000000000000000000000000000000","registry":"0x8004A169FB4a3325136EB29fA0ceB6D2e539a432","metadata":{"type":"https://eips.ethereum.org/EIPS/eip-8004#registration-v1","name":"garnor-tarko73 by Olas","description":"An optimism liquidity trader service.","image":"https://gateway.autonolas.tech/ipfs/bafybeiaakdeconw7j5z76fgghfdjmsr6tzejotxcwnvmp3nroaw3glgyve","services":[{"name":"web","endpoint":"https://marketplace.olas.network/base/ai-agents/53"}],"x402Support":false,"active":true,"registrations":[{"agentId":55,"agentRegistry":"eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"}],"supportedTrust":["reputation"]}},"meta":{"durationMs":1602,"warnings":[]},"chain":{"family":"evm","network":"eip155:8453","chainId":"8453"}}
```

`Name` through `Endpoints` come from the loaded registration document, which JSON returns whole under `metadata`. `Approved None` (JSON: the zero address) means no operator is approved for this Agent.

An Agent registered with a `data:` URI, such as Agent 173 on Nile, shows only its on-chain fields and a warning:

```bash
wallet-cli 8004 show 173 --network nile
```

```console
warning: Registration metadata URI is invalid or unsupported
Agent ID  173
Owner     TGkbaCYB4kRBc3Q6wjqkACefUvRwf2KzkH
URI       data:application/json;base64,eyJuYW1lIjoiV2VhdGhlciBBZ2VudCIsImRlc2NyaXB0aW9uIjoiUmV0dXJucyB3ZWF0aGVyIGZvcmVjYXN0cyBhbmQgYWxlcnRzIGZvciBhIGNpdHkifQ==
Approved  None
Registry  TDDk4vc69nzBCbsY4kfu7gw2jmvbinirj5
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `agentId` | string | Agent ID, decimal |
| `owner` | string | Current owner address |
| `uri` | string | Registration URI stored on chain |
| `approved` | string | Operator approved for this Agent; the zero address when none |
| `registry` | string | Identity Registry contract address |
| `metadata` | object | The loaded registration document; absent when it could not be loaded, with the reason in `meta.warnings` |

## Exit status

`0` success · `1` execution failure (`agent_not_found` — no Agent with that id; `chain_id_mismatch` — the id is prefixed with another network; `rpc_error`, `timeout`) · `2` usage error (`unsupported_network_capability` — no registry on the selected network; `invalid_value` — the id is not an unsigned decimal).

## See also

[`8004 update`](update.md) · [`8004 approve`](approve.md) · [`8004 operator-check`](operator-check.md)
