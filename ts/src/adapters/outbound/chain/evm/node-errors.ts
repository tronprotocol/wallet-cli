/**
 * Mapping an EVM node's rejection text to a stable error code.
 *
 * The JSON-RPC spec fixes no codes for these, and clients word them differently, so the match is
 * on substrings of the message. An unmatched rejection keeps the node's own words rather than
 * being forced into a category that might be wrong.
 *
 * Classification is a property of the RPC METHOD, not of the call site. A node error means one of
 * two things: the node itself could not answer (`rpc_error`/`timeout`), or the node answered and
 * its answer is a VERDICT on the transaction you handed it. Only a method that executes something
 * can return a verdict, so only those methods are classified — see CLASSIFIED_METHODS.
 */
export interface EvmRejection {
  code: string;
  message: string;
}

/**
 * The only methods whose errors can be a verdict rather than a fault.
 *
 * `eth_estimateGas` simulates the transaction, `eth_call` executes a read-only call, and
 * `eth_sendRawTransaction` submits it — each runs the EVM against the caller's input, so
 * "insufficient funds" or "reverted" from one of them is a fact about the transaction.
 *
 * Every OTHER method (`eth_getBalance`, `eth_getTransactionCount`, `eth_getCode`,
 * `eth_blockNumber`, `eth_getBlockByNumber`, `eth_syncing`, `net_peerCount`, `eth_gasPrice`,
 * `eth_maxPriorityFeePerGas`, `eth_chainId`, `eth_getTransactionReceipt`,
 * `eth_getTransactionByHash`, `web3_clientVersion`) only reads state. It has no transaction to
 * judge, so an error from it is the node failing — `rpc_error`, always. Do NOT add a read method
 * here to "improve coverage": it would turn an endpoint that rate-limits or does not implement a
 * method into a claim about the user's transaction.
 */
const EXECUTING = ["eth_estimateGas", "eth_call", "eth_sendRawTransaction"] as const;
const SIMULATING = ["eth_estimateGas", "eth_call"] as const;

export const CLASSIFIED_METHODS: ReadonlySet<string> = new Set<string>(EXECUTING);

interface Rule {
  pattern: RegExp;
  code: string;
  message: string;
  /** the methods this rule may answer for — the same words mean different things per method. */
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
  // Ordered BEFORE gas_too_low, which also matches `out of gas`. During a simulation, running out
  // of gas is the EVM halting inside the call — the contract's answer; on a submission, the same
  // words mean the transaction never had enough gas to start.
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

/** `already known` / `known transaction`: the transaction is ALREADY in the mempool, so the
 *  submission succeeded earlier. Reporting a failure would deny something that already holds. */
export function isAlreadyKnown(message: string): boolean {
  return /already known|known transaction|already exists|transaction already in pool/i.test(
    message,
  );
}

/** the codes this table can produce — the error-code registry checks itself against it, so a new
 *  rule here cannot ship without an entry there. */
export const EVM_REJECTION_CODES: readonly string[] = [
  ...new Set(PATTERNS.map(({ code }) => code)),
];

/**
 * The node's verdict on a request to `method`, or `undefined` when there is none to read — either
 * the method does not execute anything (so its errors are faults, not verdicts) or the wording is
 * unrecognised, in which case the caller keeps the node's own words.
 */
export function classifyEvmRejection(method: string, message: string): EvmRejection | undefined {
  if (!CLASSIFIED_METHODS.has(method)) return undefined;
  for (const rule of PATTERNS) {
    if (rule.methods.includes(method) && rule.pattern.test(message)) {
      return { code: rule.code, message: rule.message };
    }
  }
  return undefined;
}
