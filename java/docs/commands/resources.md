# Resource prices & memo fee

Query historical resource unit prices and the memo fee. For how bandwidth and energy work, see [concepts/resources](../concepts/resources.md). Reward withdrawal (`WithdrawBalance`) lives on the [voting & rewards](vote-reward.md) page.

## GetBandwidthPrices

Get the historical unit price of bandwidth.

```console
wallet> getBandwidthPrices
{
    "prices": "0:10,1606537680000:40,1614238080000:140,1626581880000:1000,1626925680000:140,1627731480000:1000"
}
```

## GetEnergyPrices

Get the historical unit price of energy.

```console
wallet> getEnergyPrices
{
    "prices": "0:100,1575871200000:10,1606537680000:40,1614238080000:140,1635739080000:280,1681895880000:420"
}
```

## GetMemoFee

Get the memo fee.

```console
wallet> getMemoFee
{
    "prices": "0:0,1675492680000:1000000"
}
```

## See also

- [concepts/resources](../concepts/resources.md) — bandwidth / energy model and bandwidth calculation
- [stake-v2](stake-v2.md) — freeze TRX to obtain resources
- [chain-data](chain-data.md) — `GetChainParameters` and other chain queries
