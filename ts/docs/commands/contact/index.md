# wallet-cli contact

A local address book of recipients.

## Synopsis

```
wallet-cli contact COMMAND
```

## Subcommands

| Command | Description | Network |
|---|---|---|
| [`contact add`](add.md) | Add a recipient | none |
| [`contact list`](list.md) | List recipients | none |
| [`contact remove`](remove.md) | Remove a recipient | none |

## What a contact is for

A contact maps a **name** to a validated TRON base58 address. Once stored, the name can be used
anywhere a recipient is expected:

```bash
wallet-cli tx send --to alice --amount 1 --network tron:nile
wallet-cli gasfree transfer --to alice --amount 25
```

The point is not convenience but transcription safety: the address is checksum-validated **once**,
when you add it, instead of being re-typed (and re-risked) on every transfer. Receipts show both,
so the resolution stays auditable — `To  alice (TR7NHq…)`.

## Storage and trust

The address book lives in `contacts.json` under the wallet home. It is **not encrypted** — it holds
no secrets, only public addresses — but it is treated as security-relevant input: the file must be a
regular file (not a symlink), owned by you, with mode `0600`, and every entry is re-validated on
read. A file that fails those checks is rejected (`insecure_permissions` / `encoding_error`) rather
than trusted.

That protects the file, not the decision. A contact is local data, not authority: anything that can
write your wallet directory can change where a name points. Verify the address printed on the
receipt before confirming a large transfer, exactly as you would a pasted address.

Names are matched by a case-insensitive, NFKC-normalized key, so `Alice` and `alice` are the same
contact, and a name that resembles a TRON address is refused outright. The book holds at most
10,000 entries per family and is kept sorted by name.

Contacts are chain-family scoped (`tron` today) and are **not** per-network: the same address is
valid on mainnet, Nile, and Shasta.

## See also

[`token add`](../token/add.md) — the equivalent address book for tokens ·
[`tx send`](../tx/send.md) · [`gasfree transfer`](../gasfree/transfer.md)
