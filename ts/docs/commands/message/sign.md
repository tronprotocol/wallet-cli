# wallet-cli message sign

Sign an arbitrary message (TIP-191/V2 · EIP-191).

## Synopsis

```
wallet-cli message sign (--message <text> | --message-stdin) [options]
```

## Description

Signs a message with the active account's key (or `--account`) using the personal-message scheme — TRON's TIP-191/V2 or Ethereum's EIP-191, which are the same construction over a different prefix. Signing only — nothing is broadcast, and no node is contacted.

The selected network decides **which key signs and which address is reported**: an account has one key per family, so `--network nile` signs with its TRON key and reports its base58 address, `--network sepolia` signs with its EVM key and reports its `0x` address. `--network` is still optional, and with it omitted the config default network decides.

**stdin has a single consumer (fd 0)**: `--message-stdin` and `--password-stdin` cannot both be used in one run (`secret_source_error`). In practice:

- **Ledger accounts** confirm on the device and need no master password — fd 0 is free, so you can pipe the message via `--message-stdin`.
- **Software accounts** need `--password-stdin` for non-interactive use — the message must then go inline via `--message`.

Watch-only accounts cannot sign (`watch_only_no_signer`).

## Options

| Option | Description |
|---|---|
| `--message <string>` | Message text to sign; exactly one of `--message` / `--message-stdin` |
| `--message-stdin` | Read the message from stdin (fd 0) |
| `--password-stdin` | Master password from stdin (software accounts) |

Plus the [global options](../index.md#global-options-every-command).

## Examples

In the examples, `$PW` is your master password (from an environment variable, password manager, etc.), fed on stdin via `--password-stdin`.

Software account — password via stdin, message inline:

```bash
echo "$PW" | wallet-cli message sign --message "hello" --password-stdin
```

```console
✅ Signed
  Address    TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ
  Signature  0x9f3c...
```

```bash
echo "$PW" | wallet-cli message sign --message "hello" --password-stdin -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"message.sign","data":{"address":"TMSgJxtPw29AFEHMXsjGo4kWV7UwbCToHJ","message":"hello","signature":"0x9f3c..."},"meta":{"durationMs":15,"warnings":[]},"chain":{"family":"tron","network":"tron:nile","chainId":"nile"}}
```

Ledger account — message via stdin, confirm on device:

```bash
cat challenge.txt | wallet-cli message sign --message-stdin --network tron:nile
```

The same message signed on an EVM network produces a different signature from a different key:

```bash
echo "$PW" | wallet-cli message sign --message "hello" --network evm:11155111 --password-stdin
```

## Output

| Field | Type | Meaning |
|---|---|---|
| `address` | string | Signer's address, in the selected network's format |
| `message` | string | The message that was signed |
| `signature` | string | Signature, 0x-prefixed hex |

## Exit status

`0` signed · `1` execution failure (`watch_only_no_signer`, `auth_failed`; two stdin flags → `secret_source_error`) · `2` usage error (both or neither message source → `invalid_option` / `missing_option`).

## See also

[Security model](../../concepts/security.md) · [machine-interface → Secret handling](../../machine-interface.md#secret-handling)
