# Accounts and HD Wallets

How wallet-cli organizes what you see in `list`.

## Seeds and accounts

A **seed wallet** is one BIP39 mnemonic; it can derive many **accounts**. Ids reflect that:

```
wlt_4473p34m        ← seedId (one mnemonic)
wlt_4473p34m.0      ← accountId = seedId.index (one address)
wlt_4473p34m.1
```

`create` makes a new seed plus account #0; `derive --seed-id wlt_…` adds the next account (or an explicit `--index`) from the same mnemonic. Restoring the mnemonic elsewhere re-derives the same addresses — which is why the mnemonic is the real backup and the master password is only local protection. Note that `create` does not print the mnemonic; run [`backup`](../commands/backup.md) to export it to an offline file.

## Account types

| Type | Created by | Secret stored locally? | Can sign? |
|---|---|---|---|
| `seed` | `create`, `import mnemonic`, `derive` | encrypted seed | yes |
| private-key | `import private-key` | encrypted key; **no derivation possible** | yes |
| ledger | `import ledger` | none (watch-only entry) | on the device |
| watch | `import watch` | none | no — queries only |

## The active account

Most wallet-bound commands need an account. Resolution order:

1. `--account <accountId|label|address>` on the command;
2. otherwise the **active** account — set with `use <account>`, shown by `current` and the `(active)` marker in `list`.

Labels are unique, 1–64 chars, renameable (`rename`) — the stable handle is always the `accountId`.

## Lifecycle

- `backup <account>` exports secret + metadata to a file created with mode **0600** and never overwritten (default under `<wallet-cli-root>/backups/`). Treat the file as the secret it contains.
- `delete` removes accounts; **deleting an HD wallet cascades from the seed root** — all derived accounts of that seed go with it. The on-chain assets are untouched: re-import the mnemonic to regain access.
- Losing the master password is unrecoverable locally; the escape hatch is always the mnemonic → `import mnemonic`.

## See also

[`list`](../commands/list.md) · [`create`](../commands/create.md) · [`import`](../commands/import/index.md) · [Security model](security.md)
