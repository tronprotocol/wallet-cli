import { z } from "zod";
import { readFile } from "node:fs/promises";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import { UsageError } from "../../../../domain/errors/index.js";
import type { TronContractService } from "../../../../application/use-cases/tron/contract-service.js";
import type { EvmContractService } from "../../../../application/use-cases/evm/contract-service.js";
import type { TronContractParameter } from "../../../../application/ports/chain/tron-gateway.js";
import { Schemas, addressFieldsFor, allRefines } from "../schemas/index.js";
import { gweiToWei } from "../../../../domain/fees/evm-gas.js";
import { governanceTxModeFields, governanceTxRefine } from "./shared.js";
import { TextFormatters } from "../render/index.js";

function jsonArray(raw: string | undefined, flag = "--params"): unknown[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(value)) return value;
  } catch {
    // Fall through to the stable usage error.
  }
  throw new UsageError("invalid_value", `${flag} must be a JSON array`);
}

// call/send parameters are ABI-encoded from {type, value} entries. Validate the shape at the
// command boundary so a malformed entry fails as invalid_value here, not as an opaque encoder/RPC
// error deep in TronWeb. (deploy params are raw positional values — they use jsonArray, not this.)
const typedParam = z
  .object({ type: z.string().min(1), value: z.unknown() })
  .refine((e) => e.value !== undefined, { message: "value is required" });

function typedParams(raw: string | undefined): TronContractParameter[] {
  const arr = jsonArray(raw);
  if (!z.array(typedParam).safeParse(arr).success) {
    throw new UsageError(
      "invalid_value",
      '--params entries must be {"type","value"} objects with a non-empty ABI type',
    );
  }
  return arr as TronContractParameter[];
}

// ── deploy input guards ────────────────────────────────────────────────────────
// Both guards below only restate a rejection TronWeb already makes — the accepted input set is
// unchanged. They exist because TronWeb states these two in terms of its own internals, and one
// of them not as a rejection at all but as a crash.

/** the ABI's entry list, in either shape TronWeb reads (`abi` itself, or `abi.entrys`). */
function abiEntries(abi: unknown): unknown[] | undefined {
  if (Array.isArray(abi)) return abi;
  const wrapped = (abi as { entrys?: unknown } | null)?.entrys;
  return Array.isArray(wrapped) ? wrapped : undefined;
}

/**
 * TronWeb decides whether a constructor may take call value with an unguarded read —
 * `'payable' === func.stateMutability.toLowerCase()` (TransactionBuilder.js) — so a constructor
 * entry whose `stateMutability` is not a string dies inside the encoder as "Cannot read properties
 * of undefined (reading 'toLowerCase')", naming neither the ABI nor the missing key, and arriving
 * as rpc_error/exit 1 despite no request having been sent.
 *
 * Rejected here iff that read would throw — i.e. the value is not a string. An empty string is
 * left alone on purpose: TronWeb accepts it (`''.toLowerCase()` is fine, the constructor is simply
 * not payable), and rejecting it would make this CLI stricter than the encoder it fronts.
 * A non-array, non-`entrys` ABI is likewise left alone — TronWeb's own "Invalid options.abi
 * provided" already says that plainly.
 */
function assertConstructorEncodable(abi: unknown): void {
  for (const entry of abiEntries(abi) ?? []) {
    const e = entry as { type?: unknown; stateMutability?: unknown } | null;
    if (e?.type !== "constructor") continue; // TronWeb's && short-circuits the same way
    if (typeof e.stateMutability !== "string") {
      throw new UsageError(
        "invalid_value",
        '--abi constructor entry needs a string "stateMutability" ("nonpayable" or "payable"); ' +
          "solc emits it — add it by hand if the ABI was trimmed or came from solc < 0.5",
      );
    }
  }
}

/**
 * Constructor args are RAW positional values here (`[100, "T..."]`) — types come from the ABI —
 * whereas `contract call` / `send` take `{type,value}` entries. TronWeb rejects the wrong one too,
 * but as ethers' `invalid BigNumberish value (argument="value", ...)`: an internal argument name
 * that collides with the user's own `value` key and reads like a bad number rather than a wrong
 * format. The two-format split is this CLI's own design, so name it in our own words.
 *
 * Only the unambiguous case is claimed — every entry an object with exactly `type` (a non-empty
 * string) and `value`. A mixed or partial array is left to TronWeb rather than guessed at, and a
 * genuine struct arg with those two field names can still be passed in positional array form.
 */
/**
 * `--constructor-params` entries, as `{type, value}` — the same form `contract call` and
 * `contract send` take.
 *
 * Deploy used to take bare positional values here while its siblings took typed entries: one
 * flag name, two incompatible formats. That is what §7.3 unified, so the guard that used to
 * reject the typed form now rejects the bare one.
 */
function typedConstructorParams(raw: string | undefined): TronContractParameter[] {
  const values = jsonArray(raw, "--constructor-params");
  if (!z.array(typedParam).safeParse(values).success) {
    throw new UsageError(
      "invalid_value",
      '--constructor-params entries must be {"type","value"} objects with a non-empty ABI type',
    );
  }
  return values as TronContractParameter[];
}
const callFields = z.object({
  contract: Schemas.address().describe("contract address"),
  method: z.string().min(1).describe("function signature, e.g. balanceOf(address)"),
  params: z
    .string()
    .optional()
    .describe("JSON array of ABI parameters as {type,value}; omit to pass no parameters"),
});

export const contractCallSpec: ChainSpec = {
  path: ["contract", "call"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "contract.call",
  summary: "Read-only call (triggerConstantContract)",
  baseFields: callFields,
  examples: [
    {
      cmd: `wallet-cli contract call --contract TR7... --method "balanceOf(address)" --params '[{"type":"address","value":"T..."}]'`,
    },
  ],
  formatText: TextFormatters.contractCall,
};

export const contractCallTronBinding = (svc: TronContractService): FamilyBinding => ({
  refine: addressFieldsFor("tron", "contract"),
  run: async (_ctx, net, input) =>
    svc.call(net, input.contract, input.method, typedParams(input.params)),
});

export const contractCallEvmBinding = (svc: EvmContractService): FamilyBinding => ({
  refine: addressFieldsFor("evm", "contract"),
  run: async (_ctx, net, input) =>
    svc.call(net, input.contract, input.method, typedParams(input.params)),
});

const sendFields = z.object({
  contract: Schemas.address().describe("contract address"),
  method: z.string().min(1).describe("function signature, e.g. transfer(address,uint256)"),
  params: z
    .string()
    .optional()
    .describe("JSON array of ABI parameters as {type,value}; omit to pass no parameters"),
  ...governanceTxModeFields,
});

/** TRON prices a contract call in SUN and burns energy up to a fee limit; both flag names say so. */
const tronContractWriteFields = z.object({
  callValueSun: Schemas.uintString()
    .default("0")
    .describe("native TRX attached to the call, in SUN"),
  feeLimit: Schemas.positiveIntString()
    .default("100000000")
    .describe("maximum energy fee to burn, in SUN"),
});

/** EVM prices it in gas. `--call-value` is in whole coins, matching `tx send --amount`; the
 *  per-gas fields are gwei, the unit every wallet and explorer uses. */
const evmGasFields = z.object({
  gasLimit: Schemas.positiveIntString()
    .optional()
    .describe("gas units to authorise; defaults to the node's estimate, unpadded"),
  maxFee: z.string().optional().describe("maximum total fee per gas, in gwei (EIP-1559 only)"),
  priorityFee: z.string().optional().describe("tip per gas, in gwei (EIP-1559 only)"),
  nonce: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .describe("transaction nonce; defaults to the account's pending nonce"),
});

/** `contract send` additionally takes a call value; `contract deploy` does not — a deployment's
 *  value is always zero here, and offering a flag the command ignores is worse than omitting it. */
const evmContractWriteFields = evmGasFields.extend({
  callValue: z
    .string()
    .optional()
    .describe("native coin to attach to the call, in whole coins (e.g. 0.1)"),
});

const evmContractWrite = {
  fields: evmContractWriteFields,
  refine: addressFieldsFor("evm", "contract"),
};

/** gwei on the flag, wei below it. */
const withEvmFees = (input: Record<string, unknown>) => ({
  ...input,
  ...(input.maxFee === undefined ? {} : { maxFee: gweiToWei(String(input.maxFee)) }),
  ...(input.priorityFee === undefined ? {} : { priorityFee: gweiToWei(String(input.priorityFee)) }),
});

export const contractSendSpec: ChainSpec = {
  path: ["contract", "send"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "contract.call",
  summary: "State-changing call (triggerSmartContract)",
  baseFields: sendFields,
  baseRefine: governanceTxRefine,
  examples: [
    {
      cmd: `wallet-cli contract send --contract TR7... --method "transfer(address,uint256)" --params '[...]'`,
    },
  ],
  formatText: TextFormatters.txReceipt,
};

export const contractSendEvmBinding = (svc: EvmContractService): FamilyBinding => ({
  ...evmContractWrite,
  run: async (ctx, net, input) =>
    svc.send(ctx, net, { ...withEvmFees(input), params: typedParams(input.params) }),
});

/** the creation bytecode, from `--code` or `--code-file`. */
async function creationBytecode(input: { code?: string; codeFile?: string }): Promise<string> {
  if (!input.codeFile) return input.code!;
  try {
    return await readFile(input.codeFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new UsageError("file_not_found", `code file not found: ${input.codeFile}`);
    }
    throw new UsageError("invalid_value", `cannot read code file: ${input.codeFile}`);
  }
}

export const contractDeployEvmBinding = (svc: EvmContractService): FamilyBinding => ({
  fields: evmGasFields,
  run: async (ctx, net, input) =>
    svc.deploy(ctx, net, {
      ...withEvmFees(input),
      bytecode: await creationBytecode(input),
      // ethers encodes straight from the inline types; no ABI is involved.
      params: typedConstructorParams(input.constructorParams),
    }),
});

export const contractSendTronBinding = (svc: TronContractService): FamilyBinding => ({
  fields: tronContractWriteFields,
  refine: addressFieldsFor("tron", "contract"),
  run: async (ctx, net, input) =>
    svc.send(ctx, net, {
      ...input,
      parameters: typedParams(input.params),
    }),
});

const deployFields = z.object({
  code: z
    .string()
    .min(1)
    .optional()
    .describe("contract creation bytecode, hex-encoded; provide exactly one of --code or --code-file"),
  codeFile: z
    .string()
    .min(1)
    .optional()
    .describe("path to a file holding the creation bytecode; bytecode often exceeds the shell's argument limit"),
  constructorParams: z
    .string()
    .optional()
    .describe(
      'constructor arguments as a JSON array of {type,value} entries, e.g. [{"type":"uint8","value":"18"}]; omit to pass none',
    ),
  ...governanceTxModeFields,
});

/** the spec's two base rules: the shared governance modes, plus exactly one bytecode source.
 *  Written out rather than composed generically because the two refines read different field
 *  sets, and a generic combinator would have to erase one of their types to fit them together. */
function deployRefine(
  value: { code?: string; codeFile?: string; expiration?: number; buildOnly?: boolean },
  ctx: z.RefinementCtx,
): void {
  governanceTxRefine(value as never, ctx);
  codeSourceRefine(value, ctx);
}

/** exactly one bytecode source, matching the rule `contract create2` already applies. */
function codeSourceRefine(value: { code?: string; codeFile?: string }, ctx: z.RefinementCtx): void {
  if ([value.code !== undefined, value.codeFile !== undefined].filter(Boolean).length !== 1) {
    ctx.addIssue({
      code: "custom",
      path: ["code"],
      message: "provide exactly one of --code or --code-file",
    });
  }
}

/**
 * TRON's deploy inputs.
 *
 * `--abi` stays REQUIRED here rather than becoming optional: TronWeb's createSmartContract
 * derives the constructor's types from the ABI and takes only bare values, so without it there
 * is nothing to encode against. Synthesising an ABI from the caller's inline types would hand
 * TronWeb something no one can check — a mistyped parameter would encode cleanly and deploy a
 * contract built from the wrong arguments. ethers needs no ABI, which is why this is `(tron)`.
 */
const tronDeployFields = z.object({
  abi: z.string().min(1).describe("contract ABI as a JSON array string"),
  feeLimit: Schemas.positiveIntString()
    .default("100000000")
    .describe("maximum energy fee to burn, in SUN"),
});

export const contractDeploySpec: ChainSpec = {
  path: ["contract", "deploy"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "contract.deploy",
  summary: "Deploy a smart contract",
  // The Ledger TRON app firmware rejects CreateSmartContract (APDU 0x6a80), even with
  // blind-signing enabled; software accounts sign and deploy it fine.
  requires: [
    "a software (non-Ledger) account — the Ledger TRON app cannot sign this transaction type",
  ],
  baseFields: deployFields,
  baseRefine: deployRefine,
  examples: [
    {
      cmd: "wallet-cli contract deploy --abi '[...]' --bytecode 60... --fee-limit 1000000000 --params '[100, \"T...\"]'",
    },
  ],
  formatText: TextFormatters.txReceipt,
};

export const contractDeployTronBinding = (svc: TronContractService): FamilyBinding => ({
  fields: tronDeployFields,
  run: async (ctx, net, input) => {
    let abi: unknown;
    try {
      abi = JSON.parse(input.abi);
    } catch {
      throw new UsageError("invalid_value", "--abi must be valid JSON");
    }
    assertConstructorEncodable(abi);
    return svc.deploy(ctx, net, {
      ...input,
      abi,
      bytecode: await creationBytecode(input),
      // TronWeb takes bare values beside the ABI, so the typed entries are unwrapped here. The
      // TYPES still come from the ABI — the inline ones only decide what the caller meant.
      parameters: typedConstructorParams(input.constructorParams).map((entry) => entry.value),
    });
  },
});

const infoFields = z.object({
  contract: Schemas.addressFor("tron").describe("TRON contract address"),
});

export const contractInfoSpec: ChainSpec = {
  path: ["contract", "info"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "contract.call",
  summary: "Show contract ABI + metadata",
  baseFields: infoFields,
  examples: [{ cmd: "wallet-cli contract info --contract TR7..." }],
  formatText: TextFormatters.contractInfo,
};

export const contractInfoTronBinding = (svc: TronContractService): FamilyBinding => ({
  run: async (_ctx, net, input) => svc.info(net, input.contract),
});

const contractGovernanceBase = {
  network: "optional" as const,
  wallet: "optional" as const,
  auth: "required" as const,
  broadcasts: true,
  capability: "contract.governance",
  baseRefine: governanceTxRefine,
  formatText: TextFormatters.governanceReceipt,
};

const governedContract = Schemas.addressFor("tron").describe(
  "contract address; the selected account must be its deployer",
);

export const contractClearAbiSpec: ChainSpec = {
  path: ["contract", "clear-abi"],
  ...contractGovernanceBase,
  positionals: [{ field: "address" }],
  summary: "Irreversibly clear a contract's on-chain ABI",
  description:
    "Clear the ABI metadata stored on-chain. This is irreversible, but does not change the\n" +
    "contract bytecode or state. Only the contract deployer may perform the operation.",
  requires: ["the contract deployer account"],
  baseFields: z.object({ address: governedContract, ...governanceTxModeFields }),
  examples: [{ cmd: "wallet-cli contract clear-abi TQ5... --wait" }],
};

export const contractClearAbiTronBinding = (svc: TronContractService): FamilyBinding => ({
  run: async (ctx, net, input) => svc.clearAbi(ctx, net, input),
});

export const contractSetOriginEnergyLimitSpec: ChainSpec = {
  path: ["contract", "set-origin-energy-limit"],
  ...contractGovernanceBase,
  positionals: [{ field: "address" }, { field: "energy" }],
  summary: "Set the deployer's per-call energy contribution cap",
  description:
    "Set origin_energy_limit, the maximum energy the deployer covers per call. The actual\n" +
    "contribution is also limited by the deployer's available staked energy.",
  requires: ["the contract deployer account"],
  baseFields: z.object({
    address: governedContract,
    energy: Schemas.positiveIntString()
      .refine(
        (value) => !/^\d+$/.test(value) || BigInt(value) <= (1n << 63n) - 1n,
        "must not exceed signed int64 max",
      )
      .describe("deployer energy contribution limit; integer > 0"),
    ...governanceTxModeFields,
  }),
  examples: [{ cmd: "wallet-cli contract set-origin-energy-limit TQ5... 50000000 --wait" }],
};

export const contractSetOriginEnergyLimitTronBinding = (
  svc: TronContractService,
): FamilyBinding => ({
  run: async (ctx, net, input) => svc.setOriginEnergyLimit(ctx, net, input),
});

export const contractSetUserResourcePercentSpec: ChainSpec = {
  path: ["contract", "set-user-resource-percent"],
  ...contractGovernanceBase,
  positionals: [{ field: "address" }, { field: "percent" }],
  summary: "Set the caller-paid energy percentage",
  description:
    "Set consume_user_resource_percent. 100 means the caller pays all energy; 0 means the\n" +
    "deployer pays, subject to origin_energy_limit and available staked energy.",
  requires: ["the contract deployer account"],
  baseFields: z.object({
    address: governedContract,
    percent: z.coerce
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("percentage of energy paid by the caller (0-100)"),
    ...governanceTxModeFields,
  }),
  examples: [{ cmd: "wallet-cli contract set-user-resource-percent TQ5... 100 --wait" }],
};

export const contractSetUserResourcePercentTronBinding = (
  svc: TronContractService,
): FamilyBinding => ({
  run: async (ctx, net, input) => svc.setUserResourcePercent(ctx, net, input),
});

function create2Refine(value: { code?: string; codeFile?: string }, ctx: z.RefinementCtx): void {
  if ([value.code !== undefined, value.codeFile !== undefined].filter(Boolean).length !== 1) {
    ctx.addIssue({ code: "custom", message: "provide exactly one of --code or --code-file" });
  }
}

export const contractCreate2Spec: ChainSpec = {
  path: ["contract", "create2"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "contract.create2",
  summary: "Compute a TVM CREATE2 contract address locally",
  description:
    "Compute the TRON CREATE2 address locally without contacting a node. code must be creation\n" +
    "bytecode with constructor arguments appended; salt is a signed decimal 64-bit integer.",
  baseFields: z.object({
    deployer: Schemas.addressFor("tron").describe("account or factory contract performing CREATE2"),
    code: z
      .string()
      .optional()
      .describe("creation bytecode as hex; whitespace and an optional 0x prefix are stripped"),
    codeFile: z.string().min(1).optional().describe("path containing creation bytecode hex"),
    salt: z
      .string()
      .regex(/^-?\d+$/)
      .describe("signed decimal 64-bit salt"),
  }),
  baseRefine: create2Refine,
  examples: [
    {
      cmd: "wallet-cli contract create2 --deployer TQk... --code-file ./Token.creation.hex --salt 1",
    },
    { cmd: "wallet-cli contract create2 --deployer TQk... --code 60806040 --salt 255" },
  ],
  formatText: TextFormatters.contractCreate2,
};

export const contractCreate2TronBinding = (svc: TronContractService): FamilyBinding => ({
  run: async (_ctx, _net, input) => {
    let code = input.code;
    if (input.codeFile) {
      try {
        code = await readFile(input.codeFile, "utf8");
      } catch (error) {
        const codeValue = (error as NodeJS.ErrnoException).code;
        if (codeValue === "ENOENT")
          throw new UsageError("file_not_found", `code file not found: ${input.codeFile}`);
        throw new UsageError("invalid_value", `cannot read code file: ${input.codeFile}`);
      }
    }
    return svc.create2(input.deployer, code!, input.salt);
  },
});
