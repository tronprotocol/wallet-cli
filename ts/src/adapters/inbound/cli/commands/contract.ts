import { z } from "zod";
import { readFile } from "node:fs/promises";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import { UsageError } from "../../../../domain/errors/index.js";
import type { TronContractService } from "../../../../application/use-cases/tron/contract-service.js";
import type { DeployConstructorArgs } from "../../../../application/ports/chain/gateway-provider.js";
import type { EvmContractService } from "../../../../application/use-cases/evm/contract-service.js";
import type { TronContractParameter } from "../../../../application/ports/chain/tron-gateway.js";
import { Schemas, addressFieldsFor } from "../schemas/index.js";
import { gweiToWei } from "../../../../domain/fees/evm-gas.js";
import { toBaseUnits } from "../../../../domain/amounts/index.js";
import { FAMILIES } from "../../../../domain/family/index.js";
import {
  governanceTxModeFields,
  governanceTxRefine,
  tronTxModeFields,
  txModeFields,
} from "./shared.js";
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

// Contract parameters are ABI-encoded from {type, value} entries. Validate the shape at the
// command boundary so a malformed entry fails as invalid_value here, not as an opaque family
// encoder/RPC error later.
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
  summary: "Read-only contract call",
  // §7.1: no ABI is fetched — the caller supplies the types. Without this the reader has no way
  // to know why a signature is required, or why the result comes back undecoded.
  description:
    "Read-only contract call. The function signature and parameter types are supplied\n" +
    "explicitly; no ABI lookup is performed.",
  baseFields: callFields,
  examples: [
    {
      cmd: `wallet-cli contract call --contract TR7... --method "balanceOf(address)" --params '[{"type":"address","value":"T..."}]' --network nile`,
    },
    {
      cmd: `wallet-cli contract call --contract 0xA0b8... --method "balanceOf(address)" --params '[{"type":"address","value":"0x742d..."}]' --network sepolia`,
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
  // Family-neutral and in WHOLE COINS, like `tx send --amount` (§7.2). The concept — native coin
  // attached to a call — is the same on every chain, so it gets one flag and one unit; the unit
  // in `--call-value-sun`'s name is what made it unusable off TRON.
  // Zero is a legitimate call value (it is the default), so this is not the transfer amount's
  // "must be greater than zero" schema.
  value: z
    .string()
    .regex(/^\d+(\.\d+)?$/, "must be a non-negative decimal string")
    .optional()
    .describe("native coin sent with the call, in whole coins"),
  ...txModeFields,
  buildOnly: z
    .boolean()
    .default(false)
    .describe(
      "build an unsigned transaction without signing or broadcasting; mutually exclusive with --dry-run/--sign-only",
    ),
});

/** TRON prices a contract call in SUN and burns energy up to a fee limit; both flag names say so. */
const tronContractWriteFields = z.object({
  callValueSun: Schemas.uintString()
    .optional()
    .describe("deprecated alias for --value, in SUN; removed next release"),
  feeLimit: Schemas.positiveIntString()
    .default("100000000")
    .describe("maximum energy fee to burn, in SUN"),
  ...tronTxModeFields,
});

/** EVM prices it in gas. `--call-value` is in whole coins, matching `tx send --amount`; the
 *  per-gas fields are gwei, the unit every wallet and explorer uses. */
const evmGasFields = z.object({
  gasLimit: Schemas.positiveIntString()
    .optional()
    .describe("gas units to authorise; defaults to the node's estimate, unpadded"),
  maxFee: z
    .string()
    .optional()
    .describe("maximum total fee per gas, in gwei — 25 or 25gwei (EIP-1559 only)"),
  priorityFee: z
    .string()
    .optional()
    .describe("tip per gas, in gwei — 25 or 25gwei (EIP-1559 only)"),
  nonce: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .describe("transaction nonce; defaults to the account's pending nonce"),
});

/** `contract send`'s call value is the shared `--value` (§7.2); `contract deploy` has none — a
 *  deployment's value is always zero here, and offering a flag the command ignores is worse than
 *  omitting it. */
const evmContractWrite = {
  fields: evmGasFields,
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
  summary: "State-changing contract call",
  description:
    "Call a contract method that changes state, signing and broadcasting the transaction.\n" +
    "Flags marked (tron) or (evm) apply only on networks of that family; using one on the other family is rejected.",
  baseFields: sendFields,
  baseRefine: governanceTxRefine,
  examples: [
    {
      cmd: `wallet-cli contract send --contract TR7... --method "transfer(address,uint256)" --params '[...]' --network nile`,
    },
    {
      cmd: `wallet-cli contract send --contract 0xA0b8... --method "transfer(address,uint256)" --params '[...]' --network sepolia`,
    },
  ],
  formatText: TextFormatters.txReceipt,
};

export const contractSendEvmBinding = (svc: EvmContractService): FamilyBinding => ({
  ...evmContractWrite,
  run: async (ctx, net, input) =>
    svc.send(ctx, net, {
      ...withEvmFees(input),
      callValue: input.value,
      params: typedParams(input.params),
    }),
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

interface DeploySource {
  bytecode: string;
  /** present only when the source was an artifact; it is the compiler's own ABI. */
  abi?: unknown;
}

/**
 * A compiler artifact — the bytecode and the ABI, from the file the compiler already wrote.
 *
 * Every toolchain in both families emits the same two fields: Foundry (`out/X.sol/X.json`),
 * Hardhat and its TRON plugin sunhat (`artifacts/…/X.json`), and TronBox
 * (`build/contracts/X.json`). Only the bytecode's shape differs — Foundry nests it under
 * `{object}`, the others store the string directly — so both are accepted.
 *
 * This matters most on TRON, where `--abi` is required: without it the caller has to open the
 * artifact and paste a multi-kilobyte ABI onto the command line, which is transcription, not
 * input. It also removes the one way a correct deployment can still go wrong — types typed by
 * hand — because the ABI comes from the compiler that produced the bytecode.
 */
async function readArtifact(path: string): Promise<DeploySource> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new UsageError("file_not_found", `artifact not found: ${path}`);
    }
    throw new UsageError("invalid_value", `cannot read artifact: ${path}`);
  }
  let artifact: Record<string, any>;
  try {
    artifact = JSON.parse(text);
  } catch {
    throw new UsageError("invalid_value", `artifact is not valid JSON: ${path}`);
  }
  const bytecode =
    artifact?.bytecode?.object ?? artifact?.bytecode ?? artifact?.evm?.bytecode?.object;
  if (typeof bytecode !== "string") {
    throw new UsageError(
      "invalid_value",
      `artifact has no creation bytecode: ${path} (looked at .bytecode.object, .bytecode and .evm.bytecode.object)`,
    );
  }
  // solc emits "0x" for an interface or an abstract contract: a real artifact for something that
  // cannot be deployed. Saying so beats letting an empty deployment reach the chain.
  if (bytecode.replace(/^0x/, "") === "") {
    throw new UsageError(
      "invalid_value",
      `artifact holds no deployable bytecode: ${path} — an interface or abstract contract cannot be deployed`,
    );
  }
  return { bytecode, ...(artifact.abi === undefined ? {} : { abi: artifact.abi }) };
}

/** the bytecode, and the ABI when the caller pointed at an artifact. */
async function deploySource(input: {
  code?: string;
  codeFile?: string;
  artifact?: string;
}): Promise<DeploySource> {
  if (input.artifact) return readArtifact(input.artifact);
  return { bytecode: await creationBytecode(input) };
}

interface DeployArgInput {
  artifact?: string;
  constructorSignature?: string;
  constructorArgs?: string;
  constructorParams?: string;
}

/** bare constructor values, from `--constructor-args` or unwrapped from `--constructor-params`. */
function constructorValues(input: DeployArgInput): unknown[] {
  if (input.constructorArgs !== undefined)
    return jsonArray(input.constructorArgs, "--constructor-args");
  return typedConstructorParams(input.constructorParams).map((entry) => entry.value);
}

/**
 * Where the constructor's TYPES come from, in order of authority: the compiler's ABI, then a
 * signature the caller stated, then — only because it is the shape this command shipped with —
 * the types inlined beside each value.
 */
function deployConstructorArgs(input: DeployArgInput, abi: unknown): DeployConstructorArgs {
  const values = constructorValues(input);
  if (abi !== undefined) return { source: "abi", abi, values };
  if (input.constructorSignature !== undefined) {
    return {
      source: "signature",
      signature: input.constructorSignature,
      values,
      flag: "--constructor-signature",
    };
  }
  if (input.constructorParams === undefined) return { source: "none" };
  const types = typedConstructorParams(input.constructorParams).map((entry) => entry.type);
  return {
    source: "signature",
    signature: `constructor(${types.join(",")})`,
    values,
    flag: "--constructor-params",
  };
}

export const contractDeployEvmBinding = (svc: EvmContractService): FamilyBinding => ({
  fields: evmGasFields,
  run: async (ctx, net, input) => {
    const source = await deploySource(input);
    return svc.deploy(ctx, net, {
      ...withEvmFees(input),
      bytecode: source.bytecode,
      constructorArgs: deployConstructorArgs(input, source.abi),
    });
  },
});

export const contractSendTronBinding = (svc: TronContractService): FamilyBinding => ({
  fields: tronContractWriteFields,
  refine: addressFieldsFor("tron", "contract"),
  run: async (ctx, net, input) =>
    svc.send(ctx, net, {
      ...input,
      callValueSun: tronCallValueSun(input),
      parameters: typedParams(input.params),
    }),
});

/**
 * The call value in SUN, from either flag.
 *
 * `--value` is the family-neutral form and takes whole TRX; `--call-value-sun` is the old
 * TRON-only spelling, kept working for one release. Both at once is refused rather than
 * silently preferring one — they can disagree, and picking a winner would move an amount of
 * money the caller did not ask for.
 */
function tronCallValueSun(input: { value?: string; callValueSun?: string }): string {
  if (input.value !== undefined && input.callValueSun !== undefined) {
    throw new UsageError(
      "invalid_option",
      "--value and --call-value-sun set the same thing; pass only --value (--call-value-sun is deprecated)",
    );
  }
  if (input.value !== undefined) {
    return toBaseUnits(input.value, FAMILIES.tron.nativeDecimals, "call value");
  }
  return input.callValueSun ?? "0";
}

const deployFields = z.object({
  artifact: z
    .string()
    .min(1)
    .optional()
    .describe(
      "path to a compiler artifact (Foundry, Hardhat/sunhat, TronBox) holding both the bytecode and the ABI; the preferred source, because the constructor's types then come from the compiler",
    ),
  code: z
    .string()
    .min(1)
    .optional()
    .describe(
      "contract creation bytecode, hex-encoded; provide exactly one of --artifact, --code or --code-file",
    ),
  codeFile: z
    .string()
    .min(1)
    .optional()
    .describe(
      "path to a file holding the creation bytecode; bytecode often exceeds the shell's argument limit",
    ),
  constructorSignature: z
    .string()
    .min(1)
    .optional()
    .describe(
      'the constructor\'s types when there is no ABI, e.g. "constructor(uint256,string)"; not needed with --artifact, and not accepted on TRON, which needs the full ABI',
    ),
  constructorArgs: z
    .string()
    .optional()
    .describe(
      'constructor arguments as a JSON array of bare values, e.g. ["18","MyToken"]; the types come from --artifact, --constructor-signature, or --abi on TRON',
    ),
  constructorParams: z
    .string()
    .optional()
    .describe(
      'constructor arguments as a JSON array of {type,value} entries, e.g. [{"type":"uint8","value":"18"}]; prefer --constructor-args with --artifact',
    ),
  ...txModeFields,
  buildOnly: z
    .boolean()
    .default(false)
    .describe(
      "build an unsigned transaction without signing or broadcasting; mutually exclusive with --dry-run/--sign-only",
    ),
});

/** the spec's two base rules: the shared governance modes, plus exactly one bytecode source.
 *  Written out rather than composed generically because the two refines read different field
 *  sets, and a generic combinator would have to erase one of their types to fit them together. */
function deployRefine(
  value: {
    artifact?: string;
    code?: string;
    codeFile?: string;
    constructorSignature?: string;
    constructorArgs?: string;
    constructorParams?: string;
    expiration?: number;
    buildOnly?: boolean;
  },
  ctx: z.RefinementCtx,
): void {
  governanceTxRefine(value as never, ctx);
  codeSourceRefine(value, ctx);
  constructorArgsRefine(value, ctx);
}

/**
 * The constructor's arguments must have exactly one form, and their types exactly one source.
 *
 * Both rules exist because the alternative is silence: two argument lists means one is ignored,
 * and an ABI beside hand-written types means one of the two is not being used to encode. A
 * deployment cannot be undone, so neither is left to a precedence rule the caller cannot see.
 */
function constructorArgsRefine(
  value: {
    artifact?: string;
    abi?: string;
    constructorSignature?: string;
    constructorArgs?: string;
    constructorParams?: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (value.constructorArgs !== undefined && value.constructorParams !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["constructorArgs"],
      message: "--constructor-args and --constructor-params are mutually exclusive",
    });
  }
  if (value.constructorParams !== undefined && value.artifact !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["constructorParams"],
      message:
        "with --artifact the types come from its ABI; pass the values with --constructor-args",
    });
  }
  if (value.constructorSignature !== undefined && value.artifact !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["constructorSignature"],
      message: "--constructor-signature is not needed with --artifact; its ABI declares the types",
    });
  }
  // `--abi` counts here: it is TRON-only, and on TRON it is the type source — naming only the
  // family-neutral flags would send a TRON caller to --constructor-signature, which TRON refuses.
  if (
    value.constructorArgs !== undefined &&
    value.artifact === undefined &&
    value.constructorSignature === undefined &&
    value.abi === undefined
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["constructorArgs"],
      message:
        "--constructor-args needs the constructor's types: pass --artifact, or state them with --constructor-signature (--abi also declares them on TRON)",
    });
  }
}

/** exactly one bytecode source, matching the rule `contract create2` already applies. */
function codeSourceRefine(
  value: { code?: string; codeFile?: string; artifact?: string },
  ctx: z.RefinementCtx,
): void {
  if (
    [value.code !== undefined, value.codeFile !== undefined, value.artifact !== undefined].filter(
      Boolean,
    ).length !== 1
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["code"],
      message: "provide exactly one of --artifact, --code or --code-file",
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
  abi: z
    .string()
    .min(1)
    .optional()
    .describe("contract ABI as a JSON array string; required unless --artifact supplies one"),
  feeLimit: Schemas.positiveIntString()
    .default("100000000")
    .describe("maximum energy fee to burn, in SUN"),
  ...tronTxModeFields,
});

/** TronWeb needs the whole ABI, not just the constructor's types, so a signature cannot stand in
 *  for it — the one place where the two families genuinely need different inputs. */
function tronDeployRefine(
  value: { abi?: string; artifact?: string; constructorSignature?: string },
  ctx: z.RefinementCtx,
): void {
  if (value.abi === undefined && value.artifact === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["abi"],
      message:
        "TRON needs the contract's ABI to encode a deployment: pass --artifact, or --abi with the JSON",
    });
  }
  if (value.abi !== undefined && value.artifact !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["abi"],
      message: "--abi and --artifact both supply the ABI; pass one",
    });
  }
  if (value.constructorSignature !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["constructorSignature"],
      message:
        "--constructor-signature has no effect on TRON: the node needs the full ABI, so pass --artifact or --abi",
    });
  }
}

export const contractDeploySpec: ChainSpec = {
  path: ["contract", "deploy"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "contract.deploy",
  summary: "Deploy contract bytecode",
  description:
    "Deploy contract creation bytecode and report the new contract's address.\n" +
    "Flags marked (tron) or (evm) apply only on networks of that family; using one on the other family is rejected.",
  baseFields: deployFields,
  baseRefine: deployRefine,
  examples: [
    {
      cmd: 'wallet-cli contract deploy --artifact ./build/contracts/Token.json --constructor-args \'["18","MyToken"]\' --network nile',
    },
    {
      cmd: 'wallet-cli contract deploy --artifact ./out/Token.sol/Token.json --constructor-args \'["18","MyToken"]\' --network sepolia',
    },
    {
      cmd: "wallet-cli contract deploy --code-file ./Token.bin --constructor-signature 'constructor(uint8,string)' --constructor-args '[\"18\",\"MyToken\"]' --network sepolia",
    },
  ],
  formatText: TextFormatters.txReceipt,
};

export const contractDeployTronBinding = (svc: TronContractService): FamilyBinding => ({
  fields: tronDeployFields,
  refine: tronDeployRefine,
  run: async (ctx, net, input) => {
    const source = await deploySource(input);
    let abi = source.abi;
    if (abi === undefined) {
      try {
        abi = JSON.parse(input.abi);
      } catch {
        throw new UsageError("invalid_value", "--abi must be valid JSON");
      }
    }
    assertConstructorEncodable(abi);
    return svc.deploy(ctx, net, {
      ...input,
      abi,
      bytecode: source.bytecode,
      // TronWeb takes bare values beside the ABI, so only the values travel. The TYPES come from
      // the ABI in every case — which is why --artifact is the better way in.
      parameters: constructorValues(input),
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
  summary: "Clear a contract's on-chain ABI",
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
  summary: "Set the deployer's energy cap",
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
  summary: "Set the caller-paid resource share",
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
  summary: "Precompute a CREATE2 address",
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
