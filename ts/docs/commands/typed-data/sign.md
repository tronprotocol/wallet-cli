# wallet-cli typed-data sign

Sign EIP-712 / TIP-712 structured data.

## Synopsis

```
wallet-cli typed-data sign --typed-data <json> [options]
```

## Description

Signs structured data with the active account's key (or `--account`) using the EIP-712 / TIP-712
scheme, and prints the signature together with the digest that was signed. Signing only — nothing
is broadcast, and `--network` is optional since signing is offline for software accounts.

The payload is the standard EIP-712 JSON object:

```json
{
  "domain":  { "name": "SunPerp", "version": "1", "chainId": 728126428 },
  "types":   { "Order": [{ "name": "trader", "type": "address" }, { "name": "size", "type": "uint256" }] },
  "message": { "trader": "TW7xMzawfuGcowC3rYN1qPnvrkrxVVMive", "size": "1000000" }
}
```

Accommodations for real-world payloads:

- **`EIP712Domain` is ignored** if present in `types`. Wallet-produced payloads routinely include
  it, but it describes `domain` rather than being a struct to hash, and the encoder rejects it.
- **`value` is accepted** as an alias for `message`.
- **`primaryType` is optional** — it is inferred from `types` and always echoed back in the result,
  so a caller can assert what was signed.
- **TRON base58 addresses work** in `address`-typed fields; `T…` and `41…` hash identically.

`domain.chainId` is signed as given and is **not** validated against `--network`: TRON networks are
identified by name (`mainnet`/`nile`/`shasta`) rather than by an EIP-155 number, so there is nothing
meaningful to compare against. Make sure the domain you pass targets the chain you intend.

Watch-only accounts cannot sign (`watch_only_no_signer`).

### Ledger

Ledger accounts **can** sign typed data — the signature is produced on the device like any other.

The caveat is *blind signing*: the TRON app exposes only the hashed TIP-712 instruction, so the
screen shows the domain separator and the struct hash rather than the fields you are agreeing to.
There is no way to render the message on-device, so check the payload before approving.

**The TRON app blocks this by default.** Hash-only signing is gated behind a setting, so the first
attempt fails with `ledger_setting_required`:

```console
{"success":false,"error":{"code":"ledger_setting_required","message":"enable \"Sign by Hash\" in the Ledger TRON app settings (Settings › Sign by Hash › Allowed)"}}
```

Enable it on the device under **Settings › Sign by Hash › Allowed**, then retry. App versions
predating the TIP-712 instruction fail with `ledger_unsupported`; update the TRON app.

## Options

| Option | Description |
|---|---|
| `--typed-data <string>` | EIP-712/TIP-712 JSON: `{"domain":…,"types":…,"primaryType"?:…,"message":…}` |
| `--password-stdin` | Master password from stdin (software accounts) |

Plus the [global options](../index.md#global-options-every-command).

The payload is passed on argv, not stdin: it is not a secret, and this leaves fd 0 free for
`--password-stdin`.

## Examples

In the examples, `$PW` is your master password (fed on stdin via `--password-stdin`) and
`$DATA` holds the EIP-712 JSON.

```bash
echo "$PW" | wallet-cli typed-data sign --typed-data "$DATA" --password-stdin
```

```console
✅ Signed typed data
  Address    TW7xMzawfuGcowC3rYN1qPnvrkrxVVMive
  Type       Order
  Digest     0x0a8d555d85874979f93b7f36b3518c825c0f8af12a97c21863610509732cdadd
  Signature  0x8cbad926adcba9c155dc791d1412632d95c415ad5bd83e35fa71752b602db03429e2f866180802fea83268d6bac601c33ea00218e43fc42840e589200b3491fb1b
```

Digest and signature are printed in full; nothing in this receipt is abbreviated.

```bash
echo "$PW" | wallet-cli typed-data sign --typed-data "$DATA" --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"typed-data.sign","data":{"address":"TW7xMzawfuGcowC3rYN1qPnvrkrxVVMive","signature":"0x8cbad926adcba9c155dc791d1412632d95c415ad5bd83e35fa71752b602db03429e2f866180802fea83268d6bac601c33ea00218e43fc42840e589200b3491fb1b","digest":"0x0a8d555d85874979f93b7f36b3518c825c0f8af12a97c21863610509732cdadd","primaryType":"Order"},"meta":{"durationMs":955,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Signer's base58 address |
| `primaryType` | string | The struct that was signed (inferred when omitted) |
| `digest` | string | The EIP-712/TIP-712 hash that was signed, 0x-prefixed |
| `signature` | string | Signature, 0x-prefixed hex (`r‖s‖v`) |

## Exit status

`0` signed · `1` execution failure (`watch_only_no_signer`, `auth_failed`, `signing_rejected`,
`ledger_setting_required`, `ledger_unsupported`) · `2` usage error (missing or malformed `--typed-data` → `missing_option` /
`invalid_value`).

## See also

[`message sign`](../message/sign.md) · [`tx sign`](../tx/sign.md) ·
[Security model](../../concepts/security.md)
