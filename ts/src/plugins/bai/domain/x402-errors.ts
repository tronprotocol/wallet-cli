import type { ErrorCodeEntry } from "../../../plugin-api/domain.js";

export const X402_ERROR_CODES = {
  invalid_x402_response: {
    exit: 1,
    retry: "same",
    meaning: "an x402 response could not be decoded",
  },
  payer_mismatch: {
    exit: 1,
    retry: "never",
    meaning: "the payload names a payer other than the signing account",
  },
  fee_cap_exceeded: {
    exit: 1,
    retry: "never",
    meaning: "the payload's fee exceeds the ceiling the caller set",
  },
  gasfree_insufficient_balance: {
    exit: 1,
    retry: "changed",
    meaning: "the GasFree token balance cannot cover payment and maximum fee",
  },
  gasfree_asset_unsupported: {
    exit: 1,
    retry: "changed",
    meaning:
      "the selected token contract is unavailable in the GasFree account; check the asset and relay",
  },
  gasfree_not_activated: {
    exit: 1,
    retry: "changed",
    meaning: "the GasFree account is not activated",
  },
  permit2_allowance_required: {
    exit: 1,
    retry: "changed",
    meaning: "the token allowance for Permit2 is insufficient",
  },
  approval_reset_required: {
    exit: 1,
    retry: "changed",
    meaning: "the token requires zero allowance before a new approval",
  },
  invalid_settlement: {
    exit: 1,
    retry: "never",
    meaning: "the paid response carried an invalid settlement receipt",
  },
  no_matching_requirement: {
    exit: 1,
    retry: "never",
    meaning: "no offered x402 payment route matched the requested filters",
  },
  amount_exceeds_limit: {
    exit: 1,
    retry: "never",
    meaning: "the requested x402 payment exceeds its configured limit",
  },
  port_in_use: { exit: 1, retry: "never", meaning: "the requested server port is already in use" },
  provider_not_found: { exit: 1, retry: "never", meaning: "the requested provider does not exist" },
  catalog_schema_unsupported: {
    exit: 1,
    retry: "never",
    meaning: "the provider catalog schema version is unsupported",
  },
} as const satisfies Readonly<Record<string, ErrorCodeEntry>>;

// Raised by the GasFree relay; the same entry as the GasFree plugin's.
export const X402_GASFREE_ERROR_CODES = {
  gasfree_credentials_missing: {
    exit: 2,
    retry: "never",
    meaning: "no GasFree credentials are configured",
  },
} as const satisfies Readonly<Record<string, ErrorCodeEntry>>;
