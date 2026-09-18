# Accounts and HD Wallets

How wallet-cli organizes what you see in `list`.

## Seeds and accounts

A **seed wallet** is one BIP39 mnemonic; it can derive many **accounts**. Ids reflect that:

```
wlt_4473p34m        ← seedId (one mnemonic)
wlt_4473p34m.0      ← accountId = seedId.index (one account, one address per family)
wlt_4473p34m.1
```

`create` makes a new seed plus account #0; `derive` adds the next account (or an explicit `--index`) from the same mnemonic. It works on the active account's seed by default; pick another with `--account` (any account of that seed) or `--seed-id`. Restoring the mnemonic elsewhere re-derives the same addresses — which is why the mnemonic is the real backup and the master password is only local protection. Note that `create` does not print the mnemonic; run [`backup`](../commands/backup.md) to export it to an offline file.

## One account, one address per chain family

A key is not tied to a chain, so **an account holds one address per [family](networks.md)** — a TRON base58 address and an EVM `0x` address — derived from the same seed at different BIP44 coin types:

```
m/44'/195'/0'/0/<index>   TRON
m/44'/60'/0'/0/<index>    EVM
```

Only the coin type differs; the account index is the last level in both. Account `.1` is therefore `m/44'/195'/0'/0/1` and `m/44'/60'/0'/0/1`.

Both are real, independent addresses: they hold separate balances, and funding one does nothing for the other. `list -o json` and `current -o json` report them together, under `addresses` keyed by family. These commands take no master password, so they can't tell an old TRON path from a current one without opening the seed; they deliberately return `derivationPath: null`. `derive` and `backup`, which do open the seed, report the verified path of each address:

```json
{"accountId":"wlt_kwyjcwdh.0","label":"main","type":"seed","index":0,"active":false,"addresses":{"tron":"TEKbsrcsL74XyNWH6ju9zfjGDNok78dtTa","evm":"0xeb0a0D15e3B8f6E2FC4bc011Eb6644f1ce3E4fa2"},"seedId":"wlt_kwyjcwdh","derivationPath":null}
```

Which one a command acts as follows the **selected network**, not a setting on the account: `--network nile` uses the TRON address, `--network sepolia` the EVM one. Text listings show one family at a time and say how many accounts they left out; JSON always carries every family.

Ledger accounts use a different template: `import ledger --index <n>` follows Ledger Live's `m/44'/<coin>'/<n>'/0/0`. The two agree only at index 0. See [`import ledger`](../commands/import/ledger.md).

### Accounts from before 4.13.1

Earlier versions derived TRON accounts at `m/44'/195'/<index>'/0/0`. For account #0 that is the same path, so nothing changes. Accounts #1 and later keep their old TRON address, but this version no longer signs with it:

- Signing as that TRON address fails with `legacy_derivation`. The account's EVM address, `--build-only`, and queries still work.
- `derive` refuses to add new accounts to that seed with `legacy_derivation`.
- Re-importing the mnemonic will not bring the old TRON address back.

Follow [Recover addresses after `legacy_derivation`](../troubleshooting/legacy-derivation-recovery.md) before deleting anything.

Not every account has both. A `watch` or `ledger` account holds exactly one address — the one you pasted, or the one the device app derives — so it carries a `family` field and only works on networks of that family. Selecting it on another is `family_mismatch`.

## Account types

| Type | Created by | Secret stored locally? | Can sign? | Families |
|---|---|---|---|---|
| `seed` | `create`, `import mnemonic`, `derive` | encrypted seed | yes | TRON + EVM |
| private-key | `import private-key`, `import keystore` | encrypted key; **no derivation possible** | yes | TRON + EVM |
| ledger | `import ledger` | none (watch-only entry) | on the device | the one `--app` selects |
| watch | `import watch` | none | no — queries only | the one the address is |

## The active account

Most wallet-bound commands need an account. Resolution order:

1. `--account <accountId|label|address>` on the command;
2. otherwise the **active** account — set with `use <account>`, shown by `current` and the `(active)` marker in `list`.

Labels are unique, 1–64 chars, renameable (`rename`) — the stable handle is always the `accountId`.

## Lifecycle

- `backup <account>` exports secret + metadata to a file created with mode **0600** and never overwritten (in the current working directory by default). Treat the file as the secret it contains — and mind where you run it, since the CLI does not check whether that directory is shared or version-controlled. The native format carries the seed or key itself, so it covers every family at once; `backup --keystore` carries a **single private key**, so `--network` selects which family's key it holds.
- `delete` removes accounts; **deleting an HD wallet cascades from the seed root** — all derived accounts of that seed go with it. The on-chain assets are untouched. Run `backup` first and follow any warning it prints — see [Accounts from before 4.13.1](#accounts-from-before-4131).
- Losing the master password is unrecoverable locally; the escape hatch is always the mnemonic → `import mnemonic`.

## See also

[`list`](../commands/list.md) · [`create`](../commands/create.md) · [`import`](../commands/import/index.md) · [Networks](networks.md) · [Security model](security.md)
