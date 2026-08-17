# wallet-cli witness

Register and operate a super representative (SR) candidacy.

Registering turns an ordinary account into an **SR candidate** — it can be voted for ([`vote cast`](../vote/cast.md)), and if its votes put it in the top 27 it produces blocks. Candidacy is also what unlocks governance: only a registered witness can create or approve [proposals](../proposal/index.md).

The chain stores very little about a candidate: the owner address and a single **url** — the info page shown next to the SR in explorers — which is the only field this group can change. Everything else about an SR (rank, votes, block production) is a consequence of votes, not a setting.

The one economic knob is **brokerage**: the share of block rewards the SR keeps, with the remainder distributed to its voters. It defaults to 20 %.

Registration burns a fee (currently ≈ 9,999 TRX) and cannot be undone.

## Synopsis

```
wallet-cli witness COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `witness create` | [create.md](create.md) | Register the account as an SR candidate |
| `witness update` | [update.md](update.md) | Change the candidate info page URL |
| `witness set-brokerage` | [set-brokerage.md](set-brokerage.md) | Set the share of block rewards the SR keeps |

Candidates, their votes, and their brokerage are read with [`vote list`](../vote/list.md) — which shows the 27 elected SRs by default, so a candidate outside that set needs `vote list --candidates`.

## See also

[`proposal`](../proposal/index.md) · [`vote list`](../vote/list.md) · [`reward balance`](../reward/balance.md)
