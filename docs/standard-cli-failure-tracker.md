# Standard CLI Failure Tracker

Source: `bash qa/run.sh verify --no-build`

Current summary:
- Smoke cases: `113`
- Passed: `76`
- Failed: `30`
- Skipped: `7`
- Stateful skipped: `5`
- Overall compliance: `FAIL`

This file tracks the current smoke failures based on the actual files under `qa/results/`.
It is intentionally result-driven: buckets below reflect what the latest captured outputs show,
not older hypotheses about likely causes.
The failure inventory below is aligned to the latest failed list captured on `2026-04-10`.

## Status Legend

- `unchecked`: not inspected yet
- `diagnosed`: reproduced / understood from current `qa/results/*`
- `fix_in_progress`: code change underway
- `fixed_pending_qa`: code changed, waiting for QA rerun
- `fixed`: verified green in QA

## Failure Inventory

| Command | Family | Status | Actual Problem From `qa/results` |
|---|---|---|---|
| `approve-proposal` | proposal | fixed_pending_qa | JSON stdout pollution: raw `CONTRACT_VALIDATE_ERROR` line before formatter JSON; chain error is `Proposal[1] expired` |
| `cancel-all-unfreeze-v2` | staking | fixed_pending_qa | QA contract updated to stateful replay semantics with unfreeze-count preflight; text success is accepted, JSON replay is expected to fail after state mutation |
| `clear-contract-abi` | contract-write | fixed_pending_qa | JSON stdout pollution: raw owner-validation line before formatter JSON; chain error is `Account[...] is not the owner of the contract` |
| `create-proposal` | proposal | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `Bad chain parameter value...` |
| `create-witness` | witness | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `Witness[...] has existed` |
| `delegate-resource` | staking | fixed_pending_qa | Manifest moved to `auth-success` with delegatable-resource preflight; current chain behavior is genuine success, not execution failure |
| `delete-proposal` | proposal | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `Proposal[1] is not proposed by ...` |
| `deploy-contract` | contract-write | fixed_pending_qa | Manifest moved to `auth-success` with balance preflight; deploy path now always closes the temporary gRPC client to reduce orphan-channel stderr pollution |
| `exchange-create` | exchange | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `second token balance is not enough` |
| `exchange-inject` | exchange | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `account[...] is not creator` |
| `exchange-withdraw` | exchange | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `account[...] is not creator` |
| `exchange-transaction` | exchange | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `ExchangeTransactionContract is rejected` |
| `freeze-balance` | staking | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `freeze v2 is open, old freeze is closed` |
| `market-cancel-order` | market | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `Not support Market Transaction...` |
| `market-sell-asset` | market | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `Not support Market Transaction...` |
| `participate-asset-issue` | asset | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `The asset is not issued by ...` |
| `set-account-id` | account | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `This account id already set` |
| `transfer-asset` | transaction | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `assetBalance must be greater than 0.` |
| `undelegate-resource` | staking | fixed_pending_qa | Manifest moved to `auth-success` with delegated-resource preflight; current chain behavior is genuine success, not execution failure |
| `unfreeze-asset` | staking | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `no frozen supply balance` |
| `unfreeze-balance` | staking | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `no frozenBalance(BANDWIDTH)` |
| `update-account` | account | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `This account name is already existed` |
| `update-account-permission` | account | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `witness permission is missed` |
| `update-asset` | asset | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `Account has not issued any asset` |
| `update-brokerage` | staking | fixed_pending_qa | Manifest moved to `auth-success` with witness-wallet preflight; current chain behavior is genuine success |
| `update-energy-limit` | contract-write | fixed_pending_qa | JSON stdout pollution: raw owner-validation line before formatter JSON; chain error is `Account[...] is not the owner of the contract` |
| `update-setting` | contract-write | fixed_pending_qa | JSON stdout pollution: raw owner-validation line before formatter JSON; chain error is `Account[...] is not the owner of the contract` |
| `update-witness` | witness | fixed_pending_qa | Manifest moved to `auth-success` with witness-wallet preflight; current chain behavior is genuine success |
| `withdraw-balance` | staking | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `The last withdraw time ... less than 24 hours` |
| `withdraw-expire-unfreeze` | staking | fixed_pending_qa | JSON stdout pollution: raw validation line before formatter JSON; chain error is `no unFreeze balance to withdraw` |

## Latest QA Snapshot

Source:
- `bash qa/run.sh verify --no-build --skip-help`

Latest smoke failures observed:
- `approve-proposal`
- `cancel-all-unfreeze-v2`
- `clear-contract-abi`
- `create-proposal`
- `create-witness`
- `delegate-resource`
- `delete-proposal`
- `deploy-contract`
- `exchange-create`
- `exchange-transaction`
- `exchange-inject`
- `exchange-withdraw`
- `freeze-balance`
- `market-cancel-order`
- `market-sell-asset`
- `participate-asset-issue`
- `set-account-id`
- `transfer-asset`
- `undelegate-resource`
- `unfreeze-asset`
- `unfreeze-balance`
- `update-account`
- `update-account-permission`
- `update-asset`
- `update-brokerage`
- `update-energy-limit`
- `update-setting`
- `update-witness`
- `withdraw-balance`
- `withdraw-expire-unfreeze`

## Actual Failure Buckets

### JSON Stdout Pollution On Execution Errors (`24`, code fix landed)

These commands already end as execution failures, but a raw validation line is printed to `stdout`
before the formatter-owned error output. In JSON mode this violates the single-object contract.

Observed pattern in `qa/results/*_json.out`:
- first line is raw chain text such as `CONTRACT_VALIDATE_ERROR, ...`
- second top-level output is the formatter JSON error envelope

Commands:
- `approve-proposal`
- `clear-contract-abi`
- `create-proposal`
- `create-witness`
- `delete-proposal`
- `exchange-create`
- `exchange-inject`
- `exchange-withdraw`
- `exchange-transaction`
- `freeze-balance`
- `market-cancel-order`
- `market-sell-asset`
- `participate-asset-issue`
- `set-account-id`
- `transfer-asset`
- `unfreeze-asset`
- `unfreeze-balance`
- `update-account`
- `update-account-permission`
- `update-asset`
- `update-energy-limit`
- `update-setting`
- `withdraw-balance`
- `withdraw-expire-unfreeze`

Representative chain errors from results:
- proposal expired / wrong proposer
- contract owner mismatch
- witness already exists
- stake-v1 disabled because freeze-v2 is open
- market transaction not enabled by committee
- missing balances / missing frozen state / withdraw cooldown not met

### Unexpected Success Vs Manifest (`5`, QA contract fix landed)

These commands now succeed in both text and JSON mode under current QA chain/account conditions,
and the manifest has been updated to reflect that real success shape with deterministic preflight checks.

Commands:
- `delegate-resource`
- `undelegate-resource`
- `update-brokerage`
- `update-witness`
- `deploy-contract`

Notes:
- `deploy-contract` previously emitted a gRPC orphan-channel log in `qa/results/deploy-contract_json.err`; the temp client is now closed in `finally`.
- These cases now depend on preflight checks instead of stale `expected-execution-error` expectations.

### Text/JSON Inconsistency From Stateful Mutation (`1`, QA contract fix landed)

The command mutates chain state during the text run, so the subsequent JSON run observes a different state and fails.
The QA contract has been updated to treat that replay failure as expected for this specific once-only operation.

Commands:
- `cancel-all-unfreeze-v2`

Observed drift:
- text run: `CancelAllUnfreezeV2 successful !!`
- JSON run: `CONTRACT_VALIDATE_ERROR, Contract validate error : No unfreezeV2 list to cancel`

### Passed After Fixes

These previously failed cases are now passing in the current QA result set:
- `clear-wallet-keystore`
- `reset-wallet`
- `switch-network`
- `estimate-energy`

## Immediate Work Order

1. Re-run QA and confirm the `fixed_pending_qa` bucket collapses as expected.
2. If `deploy-contract` still leaks to `json.err`, inspect the underlying trident client shutdown path rather than the standard CLI formatter path.
