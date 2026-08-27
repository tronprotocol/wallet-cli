# wallet-cli typed-data sign

Sign EIP-712 / TIP-712 structured data.

## Synopsis

```
wallet-cli typed-data sign --typed-data <json> [options]
```

## Description

Signs structured (typed) data with the active account's key (or `--account`), and prints the signature, the digest that was signed, and the primary type. Signing only — nothing is broadcast, and no node is contacted.

Works on TRON and EVM: the selected network decides which of the account's keys signs and which address is reported. EIP-712 and TIP-712 are the same construction, so the same payload can be signed for either — the domain inside the payload, not `--network`, is what a verifying contract checks.

The `--typed-data` value is EIP-712 / TIP-712 JSON with the shape `{"domain":…,"types":…,"primaryType"?:…,"message":…}`. Three conveniences apply when it is parsed:

- `EIP712Domain` inside `types` is **ignored** (you may include it or leave it out).
- `value` is accepted as an alias for `message`.
- TRON **base58** addresses work in `address` fields, alongside `0x` hex.

`primaryType` is optional — it is inferred when omitted.

Unlike [`message sign`](../message/sign.md), this command **never prompts** for the master password: software accounts must pass `--password-stdin`. Watch-only accounts cannot sign (`watch_only_no_signer`).

## Options

| Option | Description |
|---|---|
| `--typed-data <json>` | **Required.** EIP-712/TIP-712 JSON: `{"domain":…,"types":…,"primaryType"?:…,"message":…}` |
| `--password-stdin` | Master password from stdin (software accounts) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

```bash
echo "$PW" | wallet-cli typed-data sign --typed-data "$(cat permit.json)" --password-stdin --network tron:nile
```

```console
✅ Signed typed data
  Address    TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
  Type       Permit
  Digest     0x1e0f...
  Signature  0x9f3c...
```

```bash
echo "$PW" | wallet-cli typed-data sign --typed-data "$(cat permit.json)" --password-stdin --network tron:nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"typed-data.sign","data":{"address":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","primaryType":"Permit","digest":"0x1e0f...","signature":"0x9f3c..."},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

The same payload signed on an EVM network, with the account's EVM key:

```bash
echo "$PW" | wallet-cli typed-data sign --typed-data "$(cat permit.json)" --password-stdin --network evm:11155111
```

Ledger account — confirm on device, no master password needed:

```bash
wallet-cli typed-data sign --typed-data "$(cat permit.json)" --network tron:nile
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Signer's address, in the selected network's format |
| `primaryType` | string | The primary type that was signed |
| `digest` | string | The digest that was signed, 0x-prefixed hex |
| `signature` | string | Signature, 0x-prefixed hex |

## Exit status

`0` signed · `1` execution failure (`watch_only_no_signer`, `auth_failed`, `signing_rejected` — declined on the Ledger, `ledger_setting_required` — enable blind signing / EIP-712 support in the device app, `ledger_unsupported` — the device app cannot sign this payload) · `2` usage error (`--typed-data` missing → `missing_option`, or its value is not JSON → `invalid_value`).

## See also

[`message sign`](../message/sign.md) — sign a plain text message · [Security model](../../concepts/security.md) · [machine-interface → Secret handling](../../machine-interface.md#secret-handling)
