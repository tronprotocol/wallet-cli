# Exchange (Bancor)

The built-in on-chain exchange. The trading and price fluctuations of trading pairs are in accordance with the Bancor Agreement, which can be found in TRON's [related documents](https://tronprotocol.github.io/documentation-en/clients/wallet-cli-command/#dex).

## ExchangeCreate

Create a trading pair.

```console
> exchangeCreate [OwnerAddress] first_token_id first_token_balance second_token_id second_token_balance
```

- `OwnerAddress` (optional) — the address of the account which initiated the transaction. Default: the address of the login account.
- `first_token_id`, `first_token_balance` — ID and amount of the first token.
- `second_token_id`, `second_token_balance` — ID and amount of the second token. The ID is the ID of the issued TRC10 token. If it is TRX, the ID is `_`. The amount must be greater than 0, and less than 1,000,000,000,000,000.

Example:

```console
> exchangeCreate 1000001 10000 _ 10000
    # Create trading pairs with the IDs of 1000001 and TRX, with amount 10000 for both.
```

## GetExchange

Query exchange pair based on id (confirmed state).

```console
> getExchange 1
```

## ExchangeInject

Capital injection. When conducting a capital injection, depending on its quantity (`quant`), a proportion of each token in the trading pair will be withdrawn from the account and injected into the trading pair. Depending on the difference in the balance of the transaction, the same amount of money for the same token would vary.

```console
> exchangeInject [OwnerAddress] exchange_id token_id quant
```

- `OwnerAddress` (optional) — the address of the account which initiated the transaction. Default: the address of the login account.
- `exchange_id` — the ID of the trading pair to be funded.
- `token_id`, `quant` — tokenId and quantity (unit in base unit) of capital injection.

## ExchangeTransaction

```console
> exchangeTransaction [OwnerAddress] exchange_id token_id quant expected
```

- `OwnerAddress` (optional) — the address of the account which initiated the transaction. Default: the address of the login account.
- `exchange_id` — ID of the trading pair.
- `token_id`, `quant` — the ID and quantity of tokens being exchanged, equivalent to selling.
- `expected` — expected quantity of another token. `expected` must be less than `quant`, or an error will be reported.

Example:

```console
> ExchangeTransaction 1 1000001 100 80
```

It is expected to acquire 80 TRX by exchanging 1000001 from the trading pair with ID 1, and the amount is 100. (Equivalent to selling an amount of 100 tokenID - 1000001, at a price of 80 TRX, in trading pair ID - 1.)

## ExchangeWithdraw

Capital withdrawal. When conducting a capital withdrawal, depending on its quantity (`quant`), a proportion of each token in the transaction pair is withdrawn from the trading pair and injected into the account. Depending on the difference in the balance of the transaction, the same amount of money for the same token would vary.

```console
> exchangeWithdraw [OwnerAddress] exchange_id token_id quant
```

- `OwnerAddress` (optional) — the address of the account which initiated the transaction. Default: the address of the login account.
- `Exchange_id` — the ID of the trading pair to be withdrawn.
- `Token_id`, `quant` — tokenId and quantity (unit in base unit) of capital withdrawal.

## Obtain information on trading pairs

- `ListExchanges` — list trading pairs.
- `ListExchangesPaginated` — list trading pairs by page.

## See also

- [proposals](proposals.md) — on-chain governance proposals
- [dex](dex.md) — the TRON-DEX order market
- [transfer-trc10](transfer-trc10.md) — issue the TRC10 assets being traded
