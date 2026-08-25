/**
 * The error-code index.
 *
 * §11 of the requirements calls its table "the only error-code index … no code outside it may
 * appear". That promise is worth keeping — an agent branches on `error.code`, and a code it has
 * never seen documented is a code it cannot handle — but a hand-maintained table drifts the moment
 * someone adds an error. So the index lives here, next to the errors themselves, and
 * `codes.test.ts` fails the build when a code is produced without an entry (or an entry outlives
 * the code it described). The `--json-schema` catalog publishes it, so discovery is one call.
 *
 * Each entry is one line: what happened, from the caller's side. Not what to do about it — that
 * belongs in the message, which can name the file, flag or address involved.
 */
export const ERROR_CODES = {
  // ── invocation: the command line itself (exit 2) ──────────────────────────
  usage_error: "the command line could not be parsed",
  unknown_command: "no such command path, including under --help / --json-schema",
  invalid_option: "an option is not accepted here, or contradicts another one",
  missing_option: "a required option was not given",
  invalid_value: "an option's value is not of the shape that option takes",
  unknown_parameter: "no chain parameter by that name",
  limit_exceeded: "a bounded input (file size, list length, page size) was over its limit",

  // ── selection: account, network, family ───────────────────────────────────
  family_mismatch:
    "the account, recipient, raw transaction or command does not belong to the selected network's chain",
  missing_network: "the command needs a network and none was selected or configured",
  unsupported_network: "no network by that id or alias",
  unsupported_network_capability: "the selected network does not offer what this command needs",
  missing_wallet_address: "no account is available to act as",
  account_not_found: "no local account by that id, label or address",
  seed_not_found: "the reference does not name a seed (HD) wallet",
  account_exists: "an account with that address is already in the keystore",
  invalid_account: "the account reference is not well-formed",
  not_exportable: "the account holds no exportable secret (watch-only or Ledger)",
  no_software_wallet: "the operation needs a locally stored key and none exists",
  watch_only_no_signer: "the selected account can be watched but cannot sign",

  // ── secrets, keystore, local files ────────────────────────────────────────
  auth_required: "the master password is needed and was not available",
  auth_failed: "the master password was wrong",
  weak_password: "the proposed master password does not meet the strength rule",
  wrong_keystore_password: "the keystore file's own password was wrong",
  invalid_keystore: "the file is not a valid V3 keystore",
  invalid_mnemonic: "the phrase is not a valid BIP39 mnemonic",
  invalid_path: "the value is not a usable BIP44 derivation path",
  invalid_private_key: "the private key is not 32 bytes of hex",
  keystore_not_found: "no keystore file at that path",
  secret_source_error: "a secret channel (stdin / TTY) could not be read",
  tty_required: "the operation only accepts input from a terminal, and there is none",
  entropy_failure: "the system random source failed",
  insecure_permissions: "a wallet file's permissions are wider than 0600",
  migration_required: "a registry file is older than this build and must be migrated first",
  audit_append_failed: "the local export/audit log could not be appended to",
  file_not_found: "an input file does not exist",
  output_exists: "the output path is already taken and would be overwritten",
  io_error: "a local read or write failed",
  encoding_error: "data on disk or on the wire is not in the form its format requires",

  // ── configuration ─────────────────────────────────────────────────────────
  invalid_config: "the config file is malformed, or a network in it is missing a required field",
  insecure_config: "the config file's permissions or contents are unsafe to load",

  // ── address book & token book ─────────────────────────────────────────────
  contact_not_found: "no contact by that name, and the value is not an address either",
  invalid_address: "the value is not a valid address for the relevant chain",
  already_exists: "a contact with that name or address is already stored",
  token_not_in_book: "no token by that reference in the local address book",
  token_already_listed: "that token is already in the local address book",
  token_is_official: "the entry is a built-in and cannot be edited or removed",
  token_metadata_unavailable: "the token's on-chain metadata could not be read",
  unsupported_token: "the token standard is not one this command handles",
  ambiguous_token_symbol: "the symbol matches more than one token; address it by contract",
  ambiguous_asset_name: "the TRC10 name matches more than one asset; address it by id",

  // ── transaction construction & signing ────────────────────────────────────
  invalid_transaction: "the transaction is malformed, or already carries a signature",
  invalid_payload: "the payload does not decode as what the flag says it is",
  invalid_amount: "the amount is not positive, or is finer than the asset's precision",
  precision_loss: "the amount cannot be represented exactly at the required precision",
  tx_integrity: "the transaction re-encoded differently than it arrived — it was altered in flight",
  chain_id_mismatch: "the transaction was built for a different chain than the one selected",
  signing_rejected: "the signature was declined on the device",
  dry_run_violation: "a --dry-run path attempted to broadcast; the attempt was barred",
  invalid_permission: "no such permission group on the account, or it cannot be used here",
  not_authorized: "the account is not permitted to perform this operation",
  already_signed: "this account has already signed the transaction",
  already_approved: "the approval was already recorded",
  not_approved: "the transaction has not gathered the approvals it needs",
  tx_expired: "the transaction's expiration has passed",

  // ── broadcast & confirmation ──────────────────────────────────────────────
  transaction_rejected: "the node refused the transaction, in its own words",
  nonce_too_low: "nonce already used; the account has moved on",
  nonce_too_high: "nonce is ahead of the account; an earlier transaction is missing",
  replacement_underpriced: "replacing a pending transaction needs a higher fee than the original",
  gas_too_low: "the gas limit is below what this transaction needs",
  gas_limit_exceeded: "the gas limit exceeds the block gas limit",
  fee_too_low: "the fee is below what the network is currently accepting",
  insufficient_balance: "the balance cannot cover the amount plus the maximum fee",
  insufficient_token_balance: "the token balance cannot cover the amount",
  execution_reverted: "the contract reverted the call",
  execution_error: "the transaction ran on-chain and failed",
  not_found: "the transaction, block or record does not exist at this node",

  // ── node & external services ──────────────────────────────────────────────
  rpc_error: "the node answered with an error",
  invalid_node_response: "the node's answer was not in the shape the API defines",
  provider_error: "an external service failed",
  provider_rate_limited: "an external service is rate-limiting this client",
  timeout: "the node, service or device did not answer in time",
  aborted: "the operation was stopped before it finished",
  cancelled: "the operation was cancelled before it reached the device",
  history_not_supported: "the selected network exposes no transaction history endpoint",
  chain_parameter_unavailable: "the node does not report that chain parameter",
  gasfree_auth_failed: "the GasFree service rejected the request's credentials",
  gasfree_credentials_missing: "no GasFree credentials are configured",
  gasfree_integrity: "the GasFree service's answer failed its integrity check",
  gasfree_rejected: "the GasFree service refused the transfer",
  tronlink_credentials_missing: "no TronLink multi-sig service credentials are configured",

  // ── hardware wallet ───────────────────────────────────────────────────────
  device_not_found: "no Ledger device answered",
  device_locked: "the Ledger device is connected but locked",
  ledger_setting_required: "a setting in the Ledger app must be enabled for this operation",
  ledger_unsupported: "the Ledger app does not implement this operation or cannot decode it",
  ledger_address_not_found: "the address was not found within the scanned derivation range",
  wrong_device_seed: "the device holds a different seed than the account was registered with",

  // ── TRON: resources, staking, voting, rewards ─────────────────────────────
  account_not_active: "the account is not activated on-chain",
  account_already_active: "the account is already activated on-chain",
  insufficient_stake: "the staked amount cannot cover this operation",
  insufficient_voting_power: "the account has less voting power than the votes cast",
  no_frozen_supply: "there is nothing frozen to act on",
  not_yet_unfreezable: "the stake is still within its lock-up period",
  nothing_to_withdraw: "there is nothing available to withdraw",
  withdraw_too_frequent: "the withdrawal interval has not elapsed yet",
  no_reward: "there is no reward to claim",
  not_a_witness: "the address is not a witness",
  already_witness: "the address is already a witness",

  // ── TRON: assets, proposals, exchanges, contracts ─────────────────────────
  asset_not_found: "no TRC10 asset by that id or name",
  invalid_asset_name: "the TRC10 name is not of an acceptable form",
  already_issued_asset: "the account has already issued a TRC10 asset",
  not_an_issuer: "the account did not issue this asset",
  not_in_ico_window: "the asset's participation window is not open",
  id_taken: "that id is already in use",
  proposal_not_found: "no proposal by that id",
  proposal_expired: "the proposal's voting window has closed",
  not_proposal_owner: "the account did not create this proposal",
  already_canceled: "the proposal was already withdrawn",
  exchange_not_found: "no Bancor exchange pair by that id",
  exchange_closed: "the exchange pair is not accepting this operation",
  exchange_trading_disabled: "this network is not accepting Bancor trades",
  not_exchange_creator: "the account did not create this exchange pair",
  token_not_in_exchange: "that token is not one of the pair's two sides",
  same_token: "both sides of the pair would be the same token",
  insufficient_reserve: "the pair's reserve cannot support the requested amount",
  self_participation: "the account cannot take both sides of this operation",
  slippage_exceeded: "the trade would have returned less than the floor set for it",
  contract_not_found: "no contract at that address",
  not_contract_deployer: "the account did not deploy this contract",

  // ── last resort ───────────────────────────────────────────────────────────
  internal_error: "an unexpected internal failure; the message is redacted on purpose",
} as const satisfies Record<string, string>;

export type ErrorCode = keyof typeof ERROR_CODES;
