# REPL regression harness

Automated end-to-end coverage for the interactive shell (`java -jar wallet-cli.jar`).
It exists because v4.13.0 removed the standard CLI: the shell is now the only way to
drive the Java client, and nothing else exercises it.

The driver talks to a real REPL over a pty (`expect`), against **Nile**, with a funded
test account. It signs and broadcasts one real 1 TRX transfer per run.

## Running it

```bash
cd java
./gradlew shadowJar                     # build/libs/wallet-cli.jar
./qa-repl/run.sh build/libs/wallet-cli.jar head
./qa-repl/cli-boundary.sh build/libs/wallet-cli.jar
```

`run.sh` reads the test key and mnemonic from `ts/.private/.env.test`
(`TEST_TRON_PRIVATE_KEY`, `TEST_TRON_MNEMONIC`); override with `ENV_FILE=…`.
Every run works inside a scratch directory (`OUT_DIR=…`, a temp dir by default),
because the shell writes `./Wallet` and `./Mnemonic` relative to the working directory.
Results land in `$OUT_DIR/<label>/result.txt`, the full transcript in `full.log`.

Exit code 0 means every case passed.

## What it covers

| Area | Cases |
|---|---|
| Shell start-up | a bare `java -jar` still opens the prompt |
| Help / network | `help`, `help SendCoin`, `currentnetwork` |
| Read-only chain | `getblock`, `getchainparameters`, `getnextmaintenancetime`, `listwitnesses` |
| Wallet lifecycle | `importwallet`, `login`, `getaddress`, `backupwallet` (round-trips the imported key), `importwalletbymnemonic`, `changepassword`, `logout`, `resetwallet` |
| Account queries | `getbalance`, `getaccount`, `getaccountnet`, `getaccountresource`, `getbrokerage`, `getreward` |
| Signing & broadcast | `sendcoin` (permission id → password → broadcast), then `gettransactionbyid` / `gettransactioninfobyid` |
| Not-logged-in guards | `getaddress` before login, after logout, and after reset |

`cli-boundary.sh` covers the other half of the change: the entry point accepts only
`--version` and `--help`, and points every other argument at the TypeScript CLI with
exit code 2.

## Notes for whoever extends this

- Run the shell with `TERM=dumb`. JLine then uses a dumb terminal and prints the plain
  `wallet> ` prompt; under a full terminal it emits cursor control that is painful to match.
- Only treat `wallet> ` as a prompt when it ends the buffer — help output prints the same
  string inside its usage examples.
- `Console.readPassword` flips the tty and drops anything already buffered, so wait for
  the prompt to be the last thing on screen before typing a secret (`send_secret`).
- `expect`'s default 2000-byte match buffer truncates whole-block answers; `lib.exp`
  raises it.
- `gettransactionbyid` reads the **solidity** node, which trails the fullnode the
  broadcast went to. The fresh-transaction cases retry; the stable cases use a
  transaction that solidified long ago.

## Comparing against a baseline build

Two small dumpers help when you need to prove a change did not move the shell:

```bash
TERM=dumb JAR=<jar> expect -f qa-repl/dump-help.exp   # the whole `help` table
TERM=dumb JAR=<jar> TXID=<txid> expect -f qa-repl/dump-tx.exp
```

Strip the ANSI codes (`sed -E 's/\x1b\[[0-9;]*m//g'`) and diff the two builds.
