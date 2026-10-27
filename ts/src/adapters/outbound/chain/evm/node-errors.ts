export interface EvmRejection {
  code: string;
  message: string;
}

// Classify only executing methods; state-read failures do not establish transaction rejection.
const EXECUTING = ["eth_estimateGas", "eth_call", "eth_sendRawTransaction"] as const;
const SIMULATING = ["eth_estimateGas", "eth_call"] as const;

export const CLASSIFIED_METHODS: ReadonlySet<string> = new Set<string>(EXECUTING);

interface Rule {
  pattern: RegExp;
  code: string;
  message: string;
  methods: readonly string[];
}

const PATTERNS: Rule[] = [
  {
    pattern: /nonce too low|nonce is too low/i,
    code: "nonce_too_low",
    message: "nonce already used; the account has moved on",
    methods: EXECUTING,
  },
  {
    pattern: /nonce too high/i,
    code: "nonce_too_high",
    message: "nonce is ahead of the account; an earlier transaction is missing",
    methods: EXECUTING,
  },
  {
    pattern: /insufficient funds/i,
    code: "insufficient_balance",
    message: "the account cannot cover the transaction value plus its maximum fee",
    methods: EXECUTING,
  },
  {
    pattern: /replacement transaction underpriced|replacement fee too low/i,
    code: "replacement_underpriced",
    message: "replacing a pending transaction needs a higher fee than the one it replaces",
    methods: EXECUTING,
  },
  // Match simulation out-of-gas before the submission gas_too_low rule.
  {
    pattern: /execution reverted|invalid opcode|out of gas/i,
    code: "execution_reverted",
    message: "the contract reverted the call",
    methods: SIMULATING,
  },
  {
    pattern: /intrinsic gas too low|gas limit (is )?too low|out of gas/i,
    code: "gas_too_low",
    message: "the gas limit is below what this transaction needs",
    methods: EXECUTING,
  },
  {
    pattern:
      /transaction underpriced|fee cap less than block base fee|max fee per gas less than block base fee/i,
    code: "fee_too_low",
    message: "the fee is below what the network is currently accepting",
    methods: EXECUTING,
  },
  {
    pattern: /exceeds block gas limit/i,
    code: "gas_limit_exceeded",
    message: "the gas limit exceeds the block gas limit",
    methods: EXECUTING,
  },
];

// An already-known transaction is accepted, not a failed submission.
export function isAlreadyKnown(message: string): boolean {
  return /already known|known transaction|already exists|transaction already in pool/i.test(
    message,
  );
}

export const EVM_REJECTION_CODES: readonly string[] = [
  ...new Set(PATTERNS.map(({ code }) => code)),
];

export function classifyEvmRejection(method: string, message: string): EvmRejection | undefined {
  if (!CLASSIFIED_METHODS.has(method)) return undefined;
  for (const rule of PATTERNS) {
    if (rule.methods.includes(method) && rule.pattern.test(message)) {
      return { code: rule.code, message: rule.message };
    }
  }
  return undefined;
}
