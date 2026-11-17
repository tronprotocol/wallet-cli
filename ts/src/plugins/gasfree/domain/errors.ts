import type { ErrorCodeEntry } from "../../../plugin-api/domain.js";

export const GASFREE_ERROR_CODES = {
  unsupported_token: {
    exit: 2,
    retry: "never",
    meaning: "the token standard is not one this command handles",
  },
  gasfree_auth_failed: {
    exit: 1,
    retry: "never",
    meaning: "the GasFree service rejected the request's credentials",
  },
  gasfree_integrity: {
    exit: 1,
    retry: "never",
    meaning: "the GasFree service's answer failed its integrity check",
  },
  gasfree_credentials_missing: {
    exit: 2,
    retry: "never",
    meaning: "no GasFree credentials are configured",
  },
  gasfree_rejected: {
    exit: 1,
    retry: "never",
    meaning: "the GasFree service refused the transfer",
  },
} as const satisfies Record<string, ErrorCodeEntry>;
