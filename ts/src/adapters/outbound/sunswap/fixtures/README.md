# V4 receipt fixtures

Unmodified successful Nile receipts fetched with `wallet/gettransactioninfobyid` on 2026-09-29. Tests run offline.

- `v4-remove.json`: [position 7 removal](https://nile.tronscan.org/transaction/d6b40b0f13034d0297979686ba44e2c31839bcd34d409cbc32c1180acb1f576b): 1,660 SUN principal + 4,821 SUN fees = 6,481 SUN transferred; USDT 602 + 3,132 = 3,734 base units.
- `v4-collect.json`: [position 5 collection](https://nile.tronscan.org/transaction/14de49e721648ad94e464ca0d6f9a4e8662f8ee7526ff9f1c138cd40791d21d6): two TRC20 currencies, including an amount exceeding JavaScript's safe integer range.
- `v4-mint.json`: [position 179 mint](https://nile.tronscan.org/transaction/0a03171de1fd1a3295e32ab49b7da68f84d1445362d43ad8129d5b8857ed5707): native TRX, liquidity 8,328,752, principal 1,000,000 SUN.

PoolManager emits its principal delta before after-modification hooks. Tests therefore verify wallet settlement transfers separately from principal plus LP fees, and mutate copies for refund, hook adjustment, malformed log, and rejected transfer cases.
