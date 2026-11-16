import type { ErrorCodeEntry } from "../../../plugin-api/domain.js";

export const ERC8004_ERROR_CODES = {
  agent_not_found: { exit: 1, retry: "never", meaning: "the agent token does not exist" },
} as const satisfies Readonly<Record<string, ErrorCodeEntry>>;
