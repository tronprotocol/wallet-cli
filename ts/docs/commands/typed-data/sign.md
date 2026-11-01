# wallet-cli typed-data sign

Sign EIP-712 / TIP-712 structured data.

## Synopsis

```
wallet-cli typed-data sign --typed-data <json> [options]
```

## Description

Signs structured (typed) data with the active account's key (or `--account`), and prints the signature, the digest that was signed, and the primary type. Signing only — nothing is broadcast, and no node is contacted.

Works on TRON and EVM. The selected network decides which of the account's keys signs and which address is reported, and must be the chain the payload is for: a `domain.chainId` that differs from the network's chain id is refused (`chain_id_mismatch`). `domain.chainId` must be an integer when present; zero is accepted on a network whose chain id is zero. A domain without `chainId` is signed as is. `--network` is optional and falls back to `config.defaultNetwork`.

The `--typed-data` value is EIP-712 / TIP-712 JSON with the shape `{"domain":…,"types":…,"primaryType"?:…,"message":…}`. Three conveniences apply when it is parsed:

- `EIP712Domain` inside `types` is **ignored** (you may include it or leave it out).
- `value` is accepted as an alias for `message`.
- TRON **base58** addresses work in `address` fields, alongside `0x` hex.

`primaryType` is optional — it is inferred when omitted. `domain` and `message` must be objects of JSON values; invalid members fail with `invalid_payload`.

Like [`message sign`](../message/sign.md), this command **never prompts** for the master password: software accounts must pass `--password-stdin`. Watch-only accounts cannot sign (`watch_only_no_signer`).

## Options

| Option | Description |
|---|---|
| `--typed-data <json>` | **Required.** EIP-712/TIP-712 JSON: `{"domain":…,"types":…,"primaryType"?:…,"message":…}` |
| `--password-stdin` | Master password from stdin (software accounts) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

```bash
echo "$PW" | wallet-cli typed-data sign --typed-data "$(cat permit.json)" --password-stdin --network nile
```

```console
✅ Signed typed data
  Address    TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
  Type       Permit
  Digest     0x1e0f...
  Signature  0x9f3c...
```

```bash
echo "$PW" | wallet-cli typed-data sign --typed-data "$(cat permit.json)" --password-stdin --network nile -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"typed-data.sign","data":{"address":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","primaryType":"Permit","digest":"0x1e0f...","signature":"0x9f3c..."},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:3448148188","chainId":"3448148188"}}
```

Ledger account — confirm on device, no master password needed:

```bash
wallet-cli typed-data sign --typed-data "$(cat permit.json)" --network nile
```

A payload for an EVM chain, signed with the account's EVM key:

```bash
echo "$PW" | wallet-cli typed-data sign --typed-data "$(cat permit-sepolia.json)" --password-stdin --network sepolia
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Signer's address, in the selected network's format |
| `primaryType` | string | The primary type that was signed |
| `digest` | string | The digest that was signed, 0x-prefixed hex |
| `signature` | string | Signature, 0x-prefixed hex |

## Exit status

`0` signed · `1` execution failure (`chain_id_mismatch` — `domain.chainId` is not the selected network's chain id, `watch_only_no_signer`, `auth_failed`, `signing_rejected` — declined on the Ledger, `ledger_setting_required` — enable blind signing / EIP-712 support in the device app, `ledger_unsupported` — the device app cannot sign this payload) · `2` usage error (`--typed-data` missing → `missing_option`, its value is not JSON → `invalid_value`, or its domain/message is not an object of JSON values → `invalid_payload`).

## See also

[`message sign`](../message/sign.md) — sign a plain text message · [Security model](../../concepts/security.md) · [machine-interface → Secret handling](../../machine-interface.md#secret-handling)
