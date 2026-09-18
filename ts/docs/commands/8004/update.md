# wallet-cli 8004 update

Change an Agent's registration URI.

## Synopsis

```
wallet-cli 8004 update <id> <uri>
                  [--wait [--wait-timeout <ms>] | --sign-only | --build-only | --dry-run]
                  [--fee-limit <sun>] [--permission-id <n>] [--expiration <ms>] [options]
```

## Description

Calls the registry's `setAgentURI(uint256,string)`. Only the Agent's owner, its approved operator, or an operator the owner added with [`8004 add-operator`](add-operator.md) can do this; anyone else is refused during fee estimation with `not_authorized`, before anything is signed. An Agent ID that does not exist fails the same way with `agent_not_found`.

The URI rules are the same as for [`8004 register`](register.md): `https://`, `ipfs://`, or base64 JSON `data:`, at most 2048 characters. [`8004 show`](show.md) loads only `https://` and `http://` documents, so an Agent registered with an `ipfs://` or `data:` URI shows no registration details there; prefer `https://` if you want them readable with wallet-cli.

The receipt names the URI read before the change (`oldURI`) and the one requested. With `--wait`, it reads the URI again after confirmation and adds `newURI`.

Requires an account. The master password (via `--password-stdin`) is needed only by the modes that sign.

Runs on networks with an ERC-8004 Identity Registry: `tron`, `nile`, `shasta`, `bsc`, `bsc-testnet`, `base`, `base-sepolia`. See [`8004`](index.md).

## Arguments

- `id` — Agent ID, optionally prefixed with its canonical network id (`<network-id>:<id>`, e.g. `tron:3448148188:172`; an alias such as `nile:172` is not accepted)
- `uri` — new registration URI

## Options

| Option | Description |
|---|---|
| `--wait` / `--wait-timeout <ms>` | Poll after broadcast until confirmed/failed (cap default: config `waitTimeoutMs`, built-in 60000) |
| `--sign-only` | Sign without broadcasting, output the signed hex; excludes `--dry-run` / `--build-only` |
| `--build-only` | Build and estimate, output the **unsigned** hex without unlocking the wallet; excludes `--dry-run` / `--sign-only` |
| `--dry-run` | Estimate only, no signature/broadcast; excludes `--sign-only` / `--build-only` |
| `--password-stdin` | Master password from stdin |

TRON only:

| Option | Description |
|---|---|
| `--fee-limit <sun>` | Max energy fee to burn, in SUN (default 100000000) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |

There are no EVM fee flags: on EVM the gas limit and fees come from the node's estimate, and `--gas-limit` and the like are refused as unknown options.

Plus the [global options](../index.md#global-options-every-command).

## Examples

Point Agent 173 at a new registration document and wait for confirmation. `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

```bash
printf '%s' "$PW" | wallet-cli 8004 update 173 "data:application/json;base64,eyJuYW1lIjoiV2VhdGhlciBBZ2VudCIsImRlc2NyaXB0aW9uIjoiUmV0dXJucyB3ZWF0aGVyIGZvcmVjYXN0cyBhbmQgYWxlcnRzIGZvciBhIGNpdHkifQ==" --network nile --wait --password-stdin
```

```console
✅ Called setAgentURI
  Contract       TDDk4vc69nzBCbsY4kfu7gw2jmvbinirj5
  Agent ID       173
  Previous URI   data:application/json;base64,eyJuYW1lIjoiV2VhdGhlciBBZ2VudCIsImRlc2NyaXB0aW9uIjoiUmV0dXJucyB3ZWF0aGVyIGZvcmVjYXN0cyBmb3IgYSBjaXR5In0=
  Requested URI  data:application/json;base64,eyJuYW1lIjoiV2VhdGhlciBBZ2VudCIsImRlc2NyaXB0aW9uIjoiUmV0dXJucyB3ZWF0aGVyIGZvcmVjYXN0cyBhbmQgYWxlcnRzIGZvciBhIGNpdHkifQ==
  Current URI    data:application/json;base64,eyJuYW1lIjoiV2VhdGhlciBBZ2VudCIsImRlc2NyaXB0aW9uIjoiUmV0dXJucyB3ZWF0aGVyIGZvcmVjYXN0cyBhbmQgYWxlcnRzIGZvciBhIGNpdHkifQ==
  TxID           ea234c8c75d336e75d53cde5966b570912a2267979a8c3a4a0a817aab7820ee0
  Block          #71,015,905
  Energy         36,791
  Fee            4.218 TRX
  Status         success
```

```bash
printf '%s' "$PW" | wallet-cli 8004 update 173 "data:application/json;base64,eyJuYW1lIjoiV2VhdGhlciBBZ2VudCIsImRlc2NyaXB0aW9uIjoiUmV0dXJucyB3ZWF0aGVyIGZvcmVjYXN0cyBhbmQgYWxlcnRzIGZvciBhIGNpdHkifQ==" --network nile --wait --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"8004.update","data":{"kind":"contract-send","stage":"confirmed","txId":"b6231d3f66e5c8d58a82318e76bb2ab4a7f6a96f731db80043e86d64f49470fe","confirmed":true,"blockNumber":71015908,"feeSun":4218000,"energyUsed":36791,"energyFeeSun":3679000,"netFeeSun":539000,"result":"SUCCESS","failed":false,"method":"setAgentURI(uint256,string)","contract":"TDDk4vc69nzBCbsY4kfu7gw2jmvbinirj5","identity":{"agentId":"173","oldURI":"data:application/json;base64,eyJuYW1lIjoiV2VhdGhlciBBZ2VudCIsImRlc2NyaXB0aW9uIjoiUmV0dXJucyB3ZWF0aGVyIGZvcmVjYXN0cyBmb3IgYSBjaXR5In0=","requestedURI":"data:application/json;base64,eyJuYW1lIjoiV2VhdGhlciBBZ2VudCIsImRlc2NyaXB0aW9uIjoiUmV0dXJucyB3ZWF0aGVyIGZvcmVjYXN0cyBhbmQgYWxlcnRzIGZvciBhIGNpdHkifQ==","newURI":"data:application/json;base64,eyJuYW1lIjoiV2VhdGhlciBBZ2VudCIsImRlc2NyaXB0aW9uIjoiUmV0dXJucyB3ZWF0aGVyIGZvcmVjYXN0cyBhbmQgYWxlcnRzIGZvciBhIGNpdHkifQ=="}},"meta":{"durationMs":6539,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

`Previous URI` is the URI before the change, `Requested URI` the one you sent, and `Current URI` the one read back after confirmation.

## Output

`data` varies by stage:

| Mode | Fields |
|---|---|
| default (submit) | `kind: "contract-send"`, `stage: "submitted"`, `txId`, `method`, `contract`, `identity` |
| `--wait` (confirmed/failed) | above, but `stage: "confirmed"` or `"failed"`, plus `confirmed`, `blockNumber`, `failed`, and the realised cost — `feeSun` / `energyUsed` / `energyFeeSun` / `netFeeSun` / `result` on TRON, `gasUsed` / `feeWei` / `effectiveGasPriceWei` on EVM |
| `--sign-only` | `kind`, `mode: "sign-only"`, `hex`, `signed`, `address` (signer), `txId`, `fee`, `method`, `contract`, `identity` |
| `--build-only` | `kind`, `mode: "build-only"`, `hex` (**unsigned**), `tx`, `fee`, `method`, `contract`, `identity` |
| `--dry-run` | `kind`, `mode: "dry-run"`, `fee`, unsigned `tx`, `method`, `contract`, plus `nonce` on EVM, `identity` |

`identity` holds `agentId`, `oldURI` and `requestedURI`, plus `newURI` after a confirmed `--wait`.

## Exit status

`0` submitted (or built/signed in early-exit modes) · `1` execution failure (`not_authorized` — the account is not the owner or an operator of this Agent; `agent_not_found` — no Agent with that id; `execution_reverted` — the registry refused the call for another reason, with the raw revert data in `error.details.revertData`; `auth_required` — a signing mode without `--password-stdin`; `watch_only_no_signer`, `auth_failed`, `rpc_error`, `timeout` — on timeout the tx may still be in flight; check [`tx status`](../tx/status.md)) · `2` usage error (`invalid_value` — a malformed id or URI, or a bad option combination such as `--expiration` without `--sign-only` / `--build-only`; `family_mismatch` — an address of the other chain family; `invalid_option` — `--wait` with an early-exit mode; `unsupported_network_capability` — no registry on the selected network)

## See also

[`8004 show`](show.md) · [`8004 register`](register.md)
