# TRON-DEX market

The on-chain order market — create and cancel sell orders, and query orders, pairs, and prices.

## MarketSellAsset

Create an order to sell asset.

```console
> MarketSellAsset owner_address sell_token_id sell_token_quantity buy_token_id buy_token_quantity
```

- `ownerAddress` — the address of the account that initiated the transaction.
- `sell_token_id`, `sell_token_quantity` — ID and amount of the token you want to sell.
- `buy_token_id`, `buy_token_quantity` — ID and amount of the token you want to buy.

Example:

```console
MarketSellAsset TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW  1000001 200 _ 100    

Get the result of the contract execution with the getTransactionInfoById command:   
getTransactionInfoById 10040f993cd9452b25bf367f38edadf11176355802baf61f3c49b96b4480d374   

{
	"id": "10040f993cd9452b25bf367f38edadf11176355802baf61f3c49b96b4480d374",
	"blockNumber": 669,
	"blockTimeStamp": 1578983493000,
	"contractResult": [
		""
	],
	"receipt": {
		"net_usage": 264
	}
} 
```

## GetMarketOrderByAccount

Get the orders created by an account (only includes active status).

```console
> GetMarketOrderByAccount ownerAddress
```

`ownerAddress` — the address of the account that created the market order.

Example:

```console
GetMarketOrderByAccount TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW   
{
	"orders": [
		{
			"order_id": "fc9c64dfd48ae58952e85f05ecb8ec87f55e19402493bb2df501ae9d2da75db0",
			"owner_address": "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
			"create_time": 1578983490000,
			"sell_token_id": "_",
			"sell_token_quantity": 100,
			"buy_token_id": "1000001",
			"buy_token_quantity": 200,
			"sell_token_quantity_remain": 100
		}
	]
}  
```

## GetMarketOrderById

Get the specific order by `order_id`.

```console
> GetMarketOrderById orderId
```

Example:

```console
GetMarketOrderById fc9c64dfd48ae58952e85f05ecb8ec87f55e19402493bb2df501ae9d2da75db0   
{
	"order_id": "fc9c64dfd48ae58952e85f05ecb8ec87f55e19402493bb2df501ae9d2da75db0",
	"owner_address": "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
	"create_time": 1578983490000,
	"sell_token_id": "_",
	"sell_token_quantity": 100,
	"buy_token_id": "1000001",
	"buy_token_quantity": 200,
}
```

## GetMarketPairList

Get the market pair list.

```console
GetMarketPairList   
{
	"orderPair": [
		{
			"sell_token_id": "_",
			"buy_token_id": "1000001"
		}
	]
}
```

## GetMarketOrderListByPair

Get the order list by pair.

```console
> GetMarketOrderListByPair sell_token_id buy_token_id
```

- `sell_token_id` — ID of the token you want to sell.
- `buy_token_id` — ID of the token you want to buy.

Example:

```console
GetMarketOrderListByPair _ 1000001   
{
	"orders": [
		{
			"order_id": "fc9c64dfd48ae58952e85f05ecb8ec87f55e19402493bb2df501ae9d2da75db0",
			"owner_address": "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
			"create_time": 1578983490000,
			"sell_token_id": "_",
			"sell_token_quantity": 100,
			"buy_token_id": "1000001",
			"buy_token_quantity": 200,
			"sell_token_quantity_remain": 100
		}
	]
}
```

## GetMarketPriceByPair

Get the market price by pair.

```console
> GetMarketPriceByPair sell_token_id buy_token_id
```

- `sell_token_id` — ID of the token you want to sell.
- `buy_token_id` — ID of the token you want to buy.

Example:

```console
GetMarketPriceByPair _ 1000001   
{
	"sell_token_id": "_",
	"buy_token_id": "1000001",
	"prices": [
		{
			"sell_token_quantity": 100,
			"buy_token_quantity": 200
		}
	]
}
```

## MarketCancelOrder

Cancel the order.

```console
> MarketCancelOrder owner_address order_id
```

- `owner_address` — the account address which created the order.
- `order_id` — the order id which you want to cancel.

Example:

```console
MarketCancelOrder TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW fc9c64dfd48ae58952e85f05ecb8ec87f55e19402493bb2df501ae9d2da75db0  
```

Get the result of the contract execution with the `getTransactionInfoById` command:

```console
getTransactionInfoById b375787a098498623403c755b1399e82910385251b643811936d914c9f37bd27   
{
	"id": "b375787a098498623403c755b1399e82910385251b643811936d914c9f37bd27",
	"blockNumber": 1582,
	"blockTimeStamp": 1578986232000,
	"contractResult": [
		""
	],
	"receipt": {
		"net_usage": 283
	}
}
```

## See also

- [proposals](proposals.md) — on-chain governance proposals
- [exchange](exchange.md) — the built-in Bancor exchange
- [transfer-trc10](transfer-trc10.md) — issue the TRC10 assets being traded
