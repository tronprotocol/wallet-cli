# Command-line operation flow

A worked end-to-end example of the legacy interactive session: build and run, register, back up, inspect, issue an asset, and transfer it. For one-shot commands and JSON output, see [Getting started](getting-started.md#standard-cli).

```console
$ cd wallet-cli/java
$ ./gradlew build
$ ./gradlew run
> RegisterWallet             (prompts twice for the password, then for mnemonic length)
> login                      (prompts for the password)
> getAddress
address = TRfwwLDpr4excH4V4QzghLEsdYwkapTxnm'  # backup it!
> BackupWallet               (prompts for the password)
priKey = 1234567890123456789012345678901234567890123456789012345678901234  # backup it!!! (BackupWallet2Base64 option)
> getbalance
Balance = 0
> AssetIssue TestTRX TRX 75000000000000000 1 1 2 "2019-10-02 15:10:00" "2020-07-11" "just for test121212" www.test.com 100 100000 10000 10 10000 1
> getaccount TRfwwLDpr4excH4V4QzghLEsdYwkapTxnm
(Print balance: 9999900000
"assetV2": [
    {
        "key": "1000001",
        "value": 74999999999980000
    }
],)
  # (cost trx 1000 trx for assetIssue)
  # (You can query the trx balance and other asset balances for any account )
> TransferAsset TWzrEZYtwzkAxXJ8PatVrGuoSNsexejRiM 1000001 10000
```

## See also

- [getting-started](getting-started.md) — the shorter quickstart
- [commands/transfer-trc10](../commands/transfer-trc10.md) — details of `AssetIssue` / `TransferAsset`
