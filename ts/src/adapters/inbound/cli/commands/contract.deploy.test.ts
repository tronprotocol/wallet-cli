import { describe, expect, it, vi } from "vitest";
import {
  contractDeployEvmBinding,
  contractDeploySpec,
  contractDeployTronBinding,
  contractSendEvmBinding,
  contractSendSpec,
} from "./contract.js";
import type { TronContractService } from "../../../../application/use-cases/tron/contract-service.js";

/**
 * `contract deploy` input guards.
 *
 * The contract under test is ALIGNMENT: every input TronWeb's createSmartContract encoder accepts
 * must still reach it, and every input it refuses must still be refused. The guards only change how
 * two of those refusals are worded — one of which TronWeb does not word at all, but crashes on.
 *
 * Each expectation below was first measured against the real encoder
 * (tronweb/lib/commonjs/lib/TransactionBuilder/TransactionBuilder.js:541,
 *  `'payable' === func.stateMutability.toLowerCase()`), and the measured behaviour is named in the
 * test so a TronWeb upgrade that moves the boundary shows up as a failure here.
 */

function deployWith(input: { abi: string; params?: string }) {
  const deploy = vi.fn(async (_ctx: unknown, _net: unknown, _input: { parameters: unknown[] }) => ({
    kind: "tx-receipt" as const,
  }));
  const binding = contractDeployTronBinding({ deploy } as unknown as TronContractService);
  const run = () =>
    binding.run(
      {} as never,
      {} as never,
      { bytecode: "6080", feeLimit: "1000000", ...input } as never,
    );
  return { run, deploy };
}

const ctor = (over: Record<string, unknown> = {}) =>
  JSON.stringify([{ type: "constructor", inputs: [{ name: "x", type: "uint256" }], ...over }]);

describe("contract deploy — ABI constructor guard", () => {
  // Measured: TronWeb only reads stateMutability on constructor entries (its && short-circuits),
  // so an ABI without one encodes fine no matter what else it carries.
  it("passes an ABI with no constructor straight through", async () => {
    const { run, deploy } = deployWith({ abi: JSON.stringify([{ type: "function", name: "f" }]) });
    await expect(run()).resolves.toBeDefined();
    expect(deploy).toHaveBeenCalledOnce();
  });

  it("passes a constructor carrying stateMutability", async () => {
    const { run, deploy } = deployWith({ abi: ctor({ stateMutability: "nonpayable" }) });
    await expect(run()).resolves.toBeDefined();
    expect(deploy).toHaveBeenCalledOnce();
  });

  it("passes a payable constructor", async () => {
    const { run, deploy } = deployWith({ abi: ctor({ stateMutability: "payable" }) });
    await expect(run()).resolves.toBeDefined();
    expect(deploy).toHaveBeenCalledOnce();
  });

  // Measured: TronWeb SUCCEEDS on "" — ''.toLowerCase() is legal, the constructor is just not
  // payable. Rejecting it would make this CLI stricter than the encoder it fronts.
  it("passes an empty-string stateMutability, which TronWeb accepts", async () => {
    const { run, deploy } = deployWith({ abi: ctor({ stateMutability: "" }) });
    await expect(run()).resolves.toBeDefined();
    expect(deploy).toHaveBeenCalledOnce();
  });

  // Measured: each of these crashes the encoder — "Cannot read properties of undefined/null
  // (reading 'toLowerCase')" or "func.stateMutability.toLowerCase is not a function" — surfacing as
  // rpc_error/exit 1 with no request ever sent.
  it.each([
    ["absent", {}],
    ["null", { stateMutability: null }],
    ["a number", { stateMutability: 1 }],
    ["a boolean", { stateMutability: false }],
    ["an object", { stateMutability: {} }],
  ])("rejects a constructor whose stateMutability is %s", async (_label, over) => {
    const { run, deploy } = deployWith({ abi: ctor(over) });
    await expect(run()).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining("stateMutability"),
    });
    expect(deploy).not.toHaveBeenCalled();
  });

  // The crash does not depend on the constructor taking arguments — TronWeb reads the key before
  // it ever looks at `inputs`.
  it.each([
    ["an empty inputs list", JSON.stringify([{ type: "constructor", inputs: [] }])],
    ["no inputs key at all", JSON.stringify([{ type: "constructor" }])],
  ])("rejects a stateMutability-less constructor with %s", async (_label, abi) => {
    const { run } = deployWith({ abi });
    await expect(run()).rejects.toMatchObject({ code: "invalid_value" });
  });

  // Measured: TronWeb reads `abi.entrys` when present, so the guard has to see through that
  // wrapper or it would wave through an ABI that still crashes.
  it("looks inside the { entrys } wrapper TronWeb also accepts", async () => {
    const { run } = deployWith({ abi: JSON.stringify({ entrys: [{ type: "constructor" }] }) });
    await expect(run()).rejects.toMatchObject({ code: "invalid_value" });
  });

  it("passes an { entrys } wrapper whose constructor is well-formed", async () => {
    const abi = JSON.stringify({
      entrys: [{ type: "constructor", stateMutability: "nonpayable" }],
    });
    const { run, deploy } = deployWith({ abi });
    await expect(run()).resolves.toBeDefined();
    expect(deploy).toHaveBeenCalledOnce();
  });

  // Measured: TronWeb answers this one clearly by itself ("Invalid options.abi provided"), so
  // adding our own rejection would only move the goalposts.
  it("leaves an ABI that is neither array nor { entrys } to TronWeb", async () => {
    const { run, deploy } = deployWith({ abi: JSON.stringify({ foo: 1 }) });
    await expect(run()).resolves.toBeDefined();
    expect(deploy).toHaveBeenCalledOnce();
  });

  it("still rejects an ABI that is not JSON at all", async () => {
    const { run } = deployWith({ abi: "{not json" });
    await expect(run()).rejects.toMatchObject({ code: "invalid_value", message: /valid JSON/ });
  });
});

/**
 * §7.3 renamed the deploy inputs and changed the parameter form.
 *
 * `--params` meant `{type,value}` on `contract call`/`send` but bare positional values on
 * `deploy` — one flag name, two incompatible formats across sibling commands, which is why a
 * guard existed to explain the difference. `--constructor-params` unifies the form, so that
 * guard now points the other way: the typed form is the accepted one.
 *
 * `--abi` stays REQUIRED on TRON and is tagged (tron). TronWeb's createSmartContract derives
 * constructor types from the ABI and takes only bare values; ethers needs no ABI at all.
 * Synthesising an ABI from the caller's inline types would hand TronWeb something nothing can
 * check — a mistyped parameter would encode cleanly and deploy a wrong contract.
 */
function deployTyped(input: Record<string, unknown>) {
  const deploy = vi.fn(async (_c: unknown, _n: unknown, _i: { parameters: unknown[] }) => ({
    kind: "tx-receipt" as const,
  }));
  const binding = contractDeployTronBinding({ deploy } as unknown as TronContractService);
  const run = () =>
    binding.run({} as never, {} as never, { code: "6080", feeLimit: "1000000", ...input } as never);
  return { run, deploy };
}

describe("contract deploy — --constructor-params takes the typed form", () => {
  const ABI = ctor({ stateMutability: "nonpayable", inputs: [{ name: "x", type: "uint256" }] });

  it("accepts {type,value} entries and passes their values to the encoder", async () => {
    const { run, deploy } = deployTyped({
      abi: ABI,
      constructorParams: '[{"type":"uint256","value":"100"},{"type":"string","value":"My Token"}]',
    });
    await expect(run()).resolves.toBeDefined();

    // TronWeb takes bare values alongside the ABI, so the values are unwrapped here.
    expect(deploy.mock.calls[0]![2]).toMatchObject({ parameters: ["100", "My Token"] });
  });

  it("defaults to no constructor args when the flag is omitted", async () => {
    const { run, deploy } = deployTyped({ abi: ABI });
    await expect(run()).resolves.toBeDefined();
    expect(deploy.mock.calls[0]![2]).toMatchObject({ parameters: [] });
  });

  // The inverted guard: bare values were the old deploy form and are now the wrong one.
  it("rejects the bare positional form that --params used to take", async () => {
    const { run, deploy } = deployTyped({ abi: ABI, constructorParams: '[100, "My Token"]' });

    await expect(run()).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining("type"),
    });
    expect(deploy).not.toHaveBeenCalled();
  });

  it("still refuses an ABI whose constructor TronWeb would crash on", async () => {
    const { run } = deployTyped({ abi: ctor({ stateMutability: 42 }), constructorParams: "[]" });
    await expect(run()).rejects.toMatchObject({ code: "invalid_value" });
  });
});

describe("contract deploy — code input channel", () => {
  const ABI = ctor({ stateMutability: "nonpayable", inputs: [] });

  it("takes the bytecode inline with --code", async () => {
    const { run, deploy } = deployTyped({ abi: ABI, code: "6080" });
    await expect(run()).resolves.toBeDefined();
    expect(deploy.mock.calls[0]![2]).toMatchObject({ bytecode: "6080" });
  });

  // These are schema rules, so they are asserted against the schema: calling the binding
  // directly bypasses zod entirely and would pass no matter what the refine said.
  const parse = (input: Record<string, unknown>) =>
    contractDeploySpec.baseFields
      .superRefine(contractDeploySpec.baseRefine!)
      .safeParse({ dryRun: false, signOnly: false, buildOnly: false, permissionId: 0, ...input });

  it("refuses both --code and --code-file at once", () => {
    expect(parse({ code: "6080", codeFile: "./Token.bin" }).success).toBe(false);
  });

  it("refuses neither", () => {
    expect(parse({}).success).toBe(false);
  });

  it("accepts exactly one of them", () => {
    expect(parse({ code: "6080" }).success).toBe(true);
    expect(parse({ codeFile: "./Token.bin" }).success).toBe(true);
  });
});

describe("contract deploy — EVM flag surface", () => {
  // A flag that is offered but ignored is worse than an absent one: the caller believes the
  // value was applied. `deploy` hardcodes value 0, and §7.3's usage line does not list
  // --call-value, so it must not appear here — unlike `contract send`, which does use it.
  it("offers no --call-value, which deploy would ignore", () => {
    expect(Object.keys(contractDeployEvmBinding({} as never).fields?.shape ?? {})).not.toContain(
      "callValue",
    );
  });

  it("still offers the four gas flags", () => {
    const keys = Object.keys(contractDeployEvmBinding({} as never).fields?.shape ?? {});
    expect(keys).toEqual(expect.arrayContaining(["gasLimit", "maxFee", "priorityFee", "nonce"]));
  });

  /**
   * The call value moved to the SHARED spec as `--value` (§7.2, 2026-08-24 ruling): the concept
   * is the same on every chain, so it is one flag with one unit rather than a per-family name.
   * `contract deploy` still offers none — its value is always zero.
   */
  it("takes its call value from the shared --value, not a family flag", () => {
    expect(Object.keys(contractSendEvmBinding({} as never).fields?.shape ?? {})).not.toContain(
      "callValue",
    );
    expect(Object.keys(contractSendSpec.baseFields?.shape ?? {})).toContain("value");
    expect(Object.keys(contractDeploySpec.baseFields?.shape ?? {})).not.toContain("value");
  });
});
