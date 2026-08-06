# wallet-cli current

Show the current (active) account.

## Synopsis

```
wallet-cli current [--qr] [options]
```

## Description

Shows the selected account entirely locally — no unlock, no network access. By default that is the
persisted **active** account; `--account <accountId|label|address>` inspects a different one
without changing the active selection (use [`use`](use.md) for that).

`--qr` appends a scannable TRON **receive-address** QR code, encoding exactly the address and
nothing else — no amount, no memo, no URI scheme. The full address is printed underneath so you can
verify by eye what the code contains before anyone scans it.

`--qr` applies to text output only:

- In `-o json` it is ignored — the envelope stays a stable data frame rather than gaining terminal
  art.
- If the terminal is non-interactive or too narrow to render a complete code, the command warns
  (`terminal is non-interactive or too narrow for a complete QR code; showing the full address
  only`) and prints the address alone. A **partial** QR is never shown — a truncated code could
  scan as a different address.
- An account with no TRON address fails with `invalid_value`.

## Options

| Option | Description |
|---|---|
| `--qr` | Render a terminal receive QR for the selected TRON address (text output, interactive TTY) |

Plus the [global options](index.md).

## Examples

```bash
wallet-cli current
```

```console
Active account: main-1
  TRON address  TRs9HgTuY3dT3yDasdFdP9WQHqL37891Ax
```

```bash
wallet-cli current -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"current","data":{"accountId":"wlt_758891fa.1","label":"main-1","type":"seed","index":1,"active":true,"addresses":{"tron":"TRs9HgTuY3dT3yDasdFdP9WQHqL37891Ax"},"seedId":"wlt_758891fa"},"meta":{"durationMs":13,"warnings":[]}}
```

Show a receive QR to be scanned by a phone wallet:

```bash
wallet-cli current --qr
```

```console
Active account: main-1
  TRON address  TRs9HgTuY3dT3yDasdFdP9WQHqL37891Ax

█▀▀▀▀▀█ ▀▄█ ▄▀ █▀▀▀▀▀█
█ ███ █ █▄▀ ▄█ █ ███ █
█ ▀▀▀ █ ▀ █▄▄▀ █ ▀▀▀ █
▀▀▀▀▀▀▀ █▄█▄▀ ▀▀▀▀▀▀▀

Receive address  TRs9HgTuY3dT3yDasdFdP9WQHqL37891Ax
```

Inspect another account without switching to it — the heading reads `Selected account:` rather than
`Active account:`, because it is not the active one:

```bash
wallet-cli current --qr --account treasury
```

With no active account yet, it fails with `missing_wallet_address` (exit 1):

```bash
wallet-cli current
```

```console
error [missing_wallet_address]: no active account; import one first
```

## Output

`data` is the current active account. Local command — no `chain` block.

| Field | Type | Meaning |
|---|---|---|
| `accountId` | string | Active account id |
| `label` | string | Account label |
| `type` | string | `seed` / `privateKey` / `watch` / `ledger` |
| `index` | number \| null | HD derivation index; `null` for non-HD accounts |
| `active` | boolean | Whether this is the active account — `false` when `--account` selected another |
| `addresses.tron` | string | Base58 TRON address |
| `seedId` | string | Owning seed wallet id (`seed` accounts only) |
| `family` | string | Chain family, e.g. `tron` (`watch` accounts only) |

## Exit status

`0` success · `1` execution failure · `2` usage error. See [machine-interface](../machine-interface.md).

## See also

[`use`](use.md) · [`list`](list.md)
