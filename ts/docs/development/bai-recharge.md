# B.AI recharge

B.AI now authenticates recharge operations with each user's personal API key.
The CLI calls B.AI directly to resolve the credit recipient, create a preorder,
and report the payment transaction. The selected wallet signs the payment.

## Payment flow

1. Check the local confirmation for the API key, payer wallet and mainnet.
2. Validate the amount and trusted platform destination. Resolve `--to` when it
   identifies another B.AI user.
3. Create the preorder with the personal API key.
4. Call the existing `X402Service.roundtrip()` with the platform destination,
   token and exact amount. It starts a temporary endpoint on `127.0.0.1` using
   an automatically allocated port, pays through `X402PaymentClient`, and closes
   the endpoint in `finally`.
5. The local endpoint calls the facilitator's `/verify` and `/settle` endpoints.
   Wallet account selection and signing use the existing x402 signer bridge.
6. Validate the successful settlement, network, transaction hash and payer.
   Call `order.reportTxHash` with the original chain, amount and credit target.

The personal API key is sent only to B.AI business APIs. Neither the local payment
endpoint nor the facilitator receives it. `--to` selects the account receiving
credits; the on-chain recipient is always the platform address.

The CLI no longer calls the old recharge MCP or its merchant credit endpoint.
That removes a second credit-reporting path and a second set of recharge-server
configuration. The existing x402 SDK, facilitator and `roundtrip` remain in use.
Retiring the deployed recharge server is a separate operation.

## Wallet binding and signed message

Binding uses the personal API key to identify the B.AI user. Before signing,
construct the message using the recharge binding template from the updated API
specification. Arbitrary test text is rejected with `WalletInvalidSignature`,
even when the signature recovers the correct wallet address locally.

```javascript
const message = [
  "Welcome to BAI !",
  `${origin} wants you to confirm wallet binding for recharge:`,
  address,
  "",
  `Chain ID: ${chainId}`,
  `Expiration Time: ${expirationTime}`,
  `Nonce: ${nonce}`,
].join("\n");
```

For production, `origin` is `https://chat.bankofai.io`; the specification's
`https://chat-dev.b.ai` is the development example. Use the origin of the target
B.AI deployment. Mainnet chain IDs are `728126428` (TRON), `8453` (Base), and
`56` (BNB Chain). The live test used an ISO 8601 UTC expiration five minutes ahead
and a fresh 16-byte random nonce encoded as 32 hexadecimal characters; these are
verified client choices, not documented server limits or a server-issued challenge.

Select the wallet explicitly when signing:

```bash
wallet-cli message sign --account <wallet> --network <tron|base|bsc> \
  --message "$message" --password-stdin -o json
```

Pass the master password through stdin. Send the returned `address`, unchanged
`message`, and `signature` to `POST /trpc/lambda/wallet.bindRechargeWallet`, inside
`{"json":{...}}`, with the personal API key as Bearer authentication. Set `chain`
to `tron`, `base`, or `bnb`; `version: 2` selects TRON V2 signing and was also
accepted on both EVM chains. Never trim, reformat, or rebuild the message after
signing. Binding signatures authorize account association; this step sends no
payment transaction.

The backend canonicalizes EVM binding responses: `chain` becomes `eth`, and the
address is lowercase. The adapter accepts that family alias for `bnb`/`base`/`eth`
and compares EVM addresses without case sensitivity, while still rejecting another
address or unrelated chain. TRON addresses remain case-sensitive. The adapter
returns the server's canonical binding; subsequent network-specific checks still
use the original `base` or `bnb` request chain.

On 2026-09-09, three different wallets were signed with Wallet CLI and bound using
one personal API key. Every successful binding returned the same user ID. After
each binding, all three original chain/address pairs were queried through
`wallet.isRechargeBound` using that same key:

| After binding | TRON wallet | Base wallet | BNB Chain wallet |
| --- | --- | --- | --- |
| TRON | true | false | false |
| Base | true | true | false |
| BNB Chain | true | true | true |

This verifies those three bindings coexist on the server; it does not establish an
unlimited wallet count or prove recharge settlement. No funds were transferred.
The local `bai-binding.json` still stores only the last confirmed API-key/chain/address
fingerprint. Switching wallet or network requires configuring the same key again
for that selection to refresh local confirmation; this does not remove server
bindings. CLI credential setup checks existing bindings, rather than creating one.
`BaiRechargeClient.bind()` accepts an already signed message; there is no automatic
binding or new binding command in this change.

## Networks and payment requirements

| Network | Token | B.AI payment scheme |
| --- | --- | --- |
| TRON mainnet | USDT, USDD | exact / Permit2 |
| BNB Chain mainnet | USDT | exact / Permit2 |
| Base mainnet | USDC | exact / EIP-3009 |

B.AI uses `exact`; it does not select GasFree automatically. Generic x402 commands
continue to support TRON `exact_gasfree`. The local server owns token metadata,
including Base USDC's six decimals and EIP-712 domain version `2`.

Platform addresses live in `adapters/outbound/config/bai-builtins.ts`. Only TRON,
BNB Chain and Base are retained. The allowlist cannot be overridden by user
configuration; changing it requires a CLI release. Minimum recharge rules remain
in `domain/bai/recharge-policy.ts`.

Roundtrip enforces token, scheme, destination and exact amount before signing.
The explicit maximum equals the requested amount. On TRON, the SDK checks Permit2
allowance and automatically signs, broadcasts and waits for an approval when it is
insufficient and the server has not declared approval resource sponsoring. The SDK
approves the maximum uint256 amount. A failed approval stops payment; tokens that
require resetting an existing allowance to zero may still require manual handling.
When the server declares approval resource sponsoring, the signed approval is sent
in the extension instead. EVM self-funded approval fallback is not implemented.
For EVM approval sponsoring, the x402 signer bridge maps the SDK transaction
`gas` field to wallet `gasLimit`, preserving an explicit `gasLimit` when supplied.

## Failure and verification

The roundtrip port validates the token and decimal precision before target resolution
and preorder creation, using the same adapter rules as server startup. Classified
payment errors retain their codes and any settlement evidence through the recharge
flow. Preorder failure stops payment. An uncertain payment is never retried automatically.
Only a successful settlement with a valid hash and matching network can be reported.
Reporting failure preserves the hash, original target and `retryPayment: false`.
`bai recharge-report <txHash> --chain tron|bnb|base [--amount <original amount>]`
retries reporting without creating an order, resolving a recipient, signing or
paying. It requires the original personal API key but no local wallet. For another
recipient, supply both `--to <original identifier>` and `--target-id <original ID>`
from `rechargeTarget`; omit both only for self recharge. Backend verification remains
authoritative. A persistent recovery log is not implemented; retain the JSON result.

Settlement validation failures preserve a syntactically valid hash as
`details.candidateTxHash`, with a fixed `reason`, `paymentStatus: unknown`,
`settled: false` and `retryPayment: false`. Original chain, amount and recipient are
retained by the recharge flow. A candidate is evidence for reconciliation, not a
confirmed payment: verify it before using the report-only command.

Tests cover the local HTTP roundtrip with the installed SDK on BSC and Base,
settlement validation, endpoint cleanup, self/recipient CLI orchestration and
reporting failure. The facilitator and B.AI backend are mocked. Real settlement,
credit attribution, repeated reporting and Ledger operation still need live
integration verification.
