# wallet-cli proposal

Query and operate TRON chain-parameter proposals. Read commands are public; create, approve, and delete require a registered witness account.

## Synopsis

```
wallet-cli proposal COMMAND
```

## Subcommands

| Command | Page | Description |
|---|---|---|
| `proposal list` | [list.md](list.md) | List active or historical proposals |
| `proposal show` | [show.md](show.md) | Show one proposal and its approval progress |
| `proposal create` | [create.md](create.md) | Propose one or more chain-parameter changes |
| `proposal approve` | [approve.md](approve.md) | Add or remove this witness's approval |
| `proposal delete` | [delete.md](delete.md) | Cancel a proposal created by this account |

## See also

[`chain params`](../chain/params.md) · [`witness`](../witness/index.md) · [`vote`](../vote/index.md)
