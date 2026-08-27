# Accounts and HD Wallets

How wallet-cli organizes what you see in `list`.

## Seeds and accounts

A **seed wallet** is one BIP39 mnemonic; it can derive many **accounts**. Ids reflect that:

```
wlt_4473p34m        ← seedId (one mnemonic)
wlt_4473p34m.0      ← accountId = seedId.index (one account, one address per family)
wlt_4473p34m.1
```

`create` makes a new seed plus account #0; `derive --seed-id wlt_…` adds the next account (or an explicit `--index`) from the same mnemonic. Restoring the mnemonic elsewhere re-derives the same addresses — which is why the mnemonic is the real backup and the master password is only local protection. Note that `create` does not print the mnemonic; run [`backup`](../commands/backup.md) to export it to an offline file.

## One account, one address per chain family

A key is not tied to a chain, so **an account holds one address per [family](networks.md)** — a TRON base58 address and an EVM `0x` address — derived from the same seed at different BIP44 coin types:

```
m/44'/195'/0'/0/<index>   TRON
m/44'/60'/0'/0/<index>    EVM
```

Both are real, independent addresses: they hold separate balances, and funding one does nothing for the other. `list -o json` and `current -o json` report them together, under `addresses` keyed by family, with `derivationPath` naming the template each came from:

```json
{"accountId":"wlt_z259a1hq.0","label":"main","type":"seed","index":0,
 "addresses":{"tron":"TE9kPMtaMjfZN95CuPRsCHUQGWwx9EcJW8","evm":"0x7B28FE10FBccE88c3967ff0Fd64f1ffB46b46C9C"},
 "seedId":"wlt_z259a1hq",
 "derivationPath":{"tron":"m/44'/195'/0'/0/0","evm":"m/44'/60'/0'/0/0"}}
```

Which one a command acts as follows the **selected network**, not a setting on the account: `--network nile` uses the TRON address, `--network sepolia` the EVM one. Text listings show one family at a time and say how many accounts they left out; JSON always carries every family.

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
- `delete` removes accounts; **deleting an HD wallet cascades from the seed root** — all derived accounts of that seed go with it. The on-chain assets are untouched: re-import the mnemonic to regain access.
- Losing the master password is unrecoverable locally; the escape hatch is always the mnemonic → `import mnemonic`.

## See also

[`list`](../commands/list.md) · [`create`](../commands/create.md) · [`import`](../commands/import/index.md) · [Security model](security.md)
