# wallet-cli bai usage-summary

Show your B.AI credit balance and monthly usage.

## Synopsis

```
wallet-cli bai usage-summary [options]
```

## Description

Reads the account summary of the API key's B.AI account: the current credit balance, credits spent this month, and credits spent per month. Figures are whatever B.AI reports. No wallet or password is needed.

Requires a B.AI API key stored with [`config baiApiKey`](../config.md); see [`bai`](index.md#the-api-key).

## Options

No command-specific options; the [global options](../index.md#global-options-every-command) only.

## Examples

```bash
wallet-cli bai usage-summary
```

```console
B.AI usage summary
  Credit balance: 2025000
  Month: 2026-09
  Credits spent this month: 88000
  Monthly usage:
    1.
      month: 2025-10
      credits: 0
    2.
      month: 2025-11
      credits: 0
    3.
      month: 2025-12
      credits: 0
    4.
      month: 2026-01
      credits: 0
    5.
      month: 2026-02
      credits: 0
    6.
      month: 2026-03
      credits: 42000
    7.
      month: 2026-04
      credits: 118500
    8.
      month: 2026-05
      credits: 96000
    9.
      month: 2026-06
      credits: 203400
    10.
      month: 2026-07
      credits: 175200
    11.
      month: 2026-08
      credits: 231900
    12.
      month: 2026-09
      credits: 88000
```

```bash
wallet-cli bai usage-summary -o json
```

```json
{"schema":"wallet-cli.result.v1","success":true,"command":"bai.usage-summary","data":{"credits":"2025000","thisMonth":{"month":"2026-09","credits":"88000"},"trend":[{"month":"2025-10","credits":"0"},{"month":"2025-11","credits":"0"},{"month":"2025-12","credits":"0"},{"month":"2026-01","credits":"0"},{"month":"2026-02","credits":"0"},{"month":"2026-03","credits":"42000"},{"month":"2026-04","credits":"118500"},{"month":"2026-05","credits":"96000"},{"month":"2026-06","credits":"203400"},{"month":"2026-07","credits":"175200"},{"month":"2026-08","credits":"231900"},{"month":"2026-09","credits":"88000"}]},"meta":{"durationMs":1119,"warnings":[]}}
```

`Credit balance` (JSON `credits`) is the current balance. `Credits spent this month` (JSON `thisMonth`) is what was spent this month, and `Monthly usage` (JSON `trend`) lists the spend for each of the last 12 months.

## Output

| Field | Type | Meaning |
|---|---|---|
| `credits` | string | Current credit balance |
| `thisMonth` | object | `{month, credits}` — the current month (`YYYY-MM`) and the credits spent in it, as a string |
| `trend[]` | array | `{month, credits}` for each month B.AI reports, oldest first |

## Exit status

`0` success · `1` execution failure (`bai_auth_failed` — B.AI rejected the key; `bai_rejected`; `provider_error`; `timeout`) · `2` usage error (`bai_credentials_missing`).

## See also

[`bai usage-records`](usage-records.md) · [`bai recharge`](recharge.md)
