# wallet-cli witness create

Register an activated account as an SR candidate.

## Synopsis

```
wallet-cli witness create --url <url> [--dry-run | --sign-only | --build-only] [options]
```

## Description

Registration burns the current `getAccountUpgradeCost` chain parameter and cannot be undone. The command reads that value from the selected network, verifies account activation and exact SUN balance before building, and reports the burn as both `feeSun` and `registrationFeeSun`.

## Options

| Option | Description |
|---|---|
| `--url <string>` | Required candidate information URL, at most 256 UTF-8 bytes |
| `--dry-run`, `--sign-only`, `--build-only` | Mutually exclusive transaction modes |
| `--expiration <ms>` | Transaction expiration in ms, up to `86400000` (24h); only with `--sign-only` or `--build-only`; omitted = node default (~60s) |
| `--permission-id <n>` | Permission group to sign with (0=owner, 1=witness, 2-9=active); default `0` |

Plus `--account`, `--wait`, `--password-stdin`, and the [global options](../index.md#global-options-every-command).

## Example

```bash
echo "$PW" | wallet-cli witness create --url https://sr.example --network tron:nile --wait --password-stdin
```

## Output

Returns the witness address, URL, irreversible registration fee, transaction stage/id, and confirmed bandwidth/resource usage.

## Exit status

`0` built/signed/submitted · `1` `already_witness`, `account_not_active`, `insufficient_balance`, missing chain fee, signer/auth, RPC, or chain failure · `2` invalid input.

## See also

[`witness update`](update.md) · [`chain params`](../chain/params.md)
