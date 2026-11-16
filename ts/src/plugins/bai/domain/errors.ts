import type { ErrorCodeEntry } from "../../../plugin-api/domain.js";

export const BAI_ERROR_CODES = {
  bai_rejected: {
    exit: 1,
    retry: "changed",
    meaning: "the B.AI service rejected an operation with a recognized business reason",
  },
  bai_auth_failed: {
    exit: 1,
    retry: "never",
    meaning: "the B.AI service rejected the configured API key",
  },
  bai_credentials_missing: { exit: 2, retry: "never", meaning: "no B.AI API key is configured" },
} as const satisfies Readonly<Record<string, ErrorCodeEntry>>;
