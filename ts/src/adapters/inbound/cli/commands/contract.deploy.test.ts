import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  contractDeployEvmBinding,
  contractDeploySpec,
  contractDeployTronBinding,
  contractSendEvmBinding,
  contractSendSpec,
} from "./contract.js";
import type { TronContractService } from "../../../../application/use-cases/tron/contract-service.js";

function deployWith(input: { abi: string; params?: string }) {
  const deploy = vi.fn(async (_ctx: unknown, _net: unknown, _input: { parameters: unknown[] }) => ({
    kind: "tx-receipt" as const,
  }));
  const binding = contractDeployTronBinding({ deploy } as unknown as TronContractService);
  const run = () =>
    binding.run(
      {} as never,
      {} as never,
      // Supply CLI flags; the binding derives bytecode from --code.
      { code: "6080", feeLimit: "1000000", ...input } as never,
    );
  return { run, deploy };
}

const ctor = (over: Record<string, unknown> = {}) =>
  JSON.stringify([{ type: "constructor", inputs: [{ name: "x", type: "uint256" }], ...over }]);

describe("contract deploy — ABI constructor guard", () => {
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

  it("passes an empty-string stateMutability, which TronWeb accepts", async () => {
    const { run, deploy } = deployWith({ abi: ctor({ stateMutability: "" }) });
    await expect(run()).resolves.toBeDefined();
    expect(deploy).toHaveBeenCalledOnce();
  });

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

  it.each([
    ["an empty inputs list", JSON.stringify([{ type: "constructor", inputs: [] }])],
    ["no inputs key at all", JSON.stringify([{ type: "constructor" }])],
  ])("rejects a stateMutability-less constructor with %s", async (_label, abi) => {
    const { run } = deployWith({ abi });
    await expect(run()).rejects.toMatchObject({ code: "invalid_value" });
  });

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

    expect(deploy.mock.calls[0]![2]).toMatchObject({ parameters: ["100", "My Token"] });
  });

  it("defaults to no constructor args when the flag is omitted", async () => {
    const { run, deploy } = deployTyped({ abi: ABI });
    await expect(run()).resolves.toBeDefined();
    expect(deploy.mock.calls[0]![2]).toMatchObject({ parameters: [] });
  });

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

describe("contract deploy — creation bytecode is validated locally", () => {
  const ABI = ctor({ stateMutability: "nonpayable", inputs: [] });

  function evmDeployWith(input: Record<string, unknown>) {
    const deploy = vi.fn(async (_c: unknown, _n: unknown, _i: { bytecode: string }) => ({
      kind: "tx-receipt" as const,
    }));
    const binding = contractDeployEvmBinding({ deploy } as never);
    const run = () => binding.run({} as never, {} as never, input as never);
    return { run, deploy };
  }

  it.each([
    ["not hex at all", "xyz"],
    ["odd-length hex", "600"],
    ["hex with a stray non-hex digit", "60806040zz"],
    // Reject interior whitespace to avoid joining separate bytecode fragments.
    ["hex split by an interior space", "6080 604052"],
    ["hex split across lines", "6080\n604052"],
    ["nothing but whitespace", "  \n "],
  ])("refuses --code that is %s, without reaching the chain", async (_label, code) => {
    const { run, deploy } = evmDeployWith({ code });
    await expect(run()).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining("--code"),
    });
    expect(deploy).not.toHaveBeenCalled();
  });

  it("accepts an explicit 0x, the empty deployment stated on purpose", async () => {
    const { run, deploy } = evmDeployWith({ code: "0x" });
    await expect(run()).resolves.toBeDefined();
    expect(deploy).toHaveBeenCalledOnce();
    expect(deploy.mock.calls[0]![2].bytecode).toBe("0x");
  });

  it("refuses bad bytecode on TRON too — one rule, both families", async () => {
    const { run, deploy } = deployTyped({ abi: ABI, code: "xyz" });
    await expect(run()).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining("--code"),
    });
    expect(deploy).not.toHaveBeenCalled();
  });

  it.each([
    ["with the 0x prefix", "0x6080604052", "0x6080604052"],
    ["without it", "6080604052", "6080604052"],
  ])("accepts valid bytecode %s and passes it through unchanged", async (_l, code, expected) => {
    const { run, deploy } = evmDeployWith({ code });
    await expect(run()).resolves.toBeDefined();
    expect(deploy.mock.calls[0]![2]).toMatchObject({ bytecode: expected });
  });

  it("normalises an uppercase 0X prefix on --code instead of leaking it downstream", async () => {
    const { run, deploy } = evmDeployWith({ code: "0X6080604052" });
    await expect(run()).resolves.toBeDefined();
    expect(deploy.mock.calls[0]![2]).toMatchObject({ bytecode: "0x6080604052" });
  });

  it("reads --code-file and drops the trailing newline every editor writes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wcli-deploy-code-"));
    const file = join(dir, "Token.bin");
    writeFileSync(file, "0x6080604052\n");

    const { run, deploy } = evmDeployWith({ codeFile: file });
    await expect(run()).resolves.toBeDefined();
    expect(deploy.mock.calls[0]![2]).toMatchObject({ bytecode: "0x6080604052" });
  });

  it("accepts a --code-file holding only 0x, the same stated empty deployment --code allows", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wcli-deploy-code-"));
    const file = join(dir, "Empty.bin");
    writeFileSync(file, "0x\n");

    const { run, deploy } = evmDeployWith({ codeFile: file });
    await expect(run()).resolves.toBeDefined();
    expect(deploy.mock.calls[0]![2].bytecode).toBe("0x");
  });

  it.each([
    ["empty", ""],
    ["nothing but whitespace", "  \n "],
  ])("refuses a --code-file that is %s", async (_label, contents) => {
    const dir = mkdtempSync(join(tmpdir(), "wcli-deploy-code-"));
    const file = join(dir, "Empty.bin");
    writeFileSync(file, contents);

    const { run, deploy } = evmDeployWith({ codeFile: file });
    await expect(run()).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining(file),
    });
    expect(deploy).not.toHaveBeenCalled();
  });

  it("names the file when --code-file holds something that is not bytecode", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wcli-deploy-code-"));
    const file = join(dir, "Token.bin");
    writeFileSync(file, "not bytecode\n");

    const { run, deploy } = evmDeployWith({ codeFile: file });
    await expect(run()).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining(file),
    });
    expect(deploy).not.toHaveBeenCalled();
  });
});

describe("contract deploy — EVM flag surface", () => {
  it("offers no --call-value, which deploy would ignore", () => {
    expect(Object.keys(contractDeployEvmBinding({} as never).fields?.shape ?? {})).not.toContain(
      "callValue",
    );
  });

  it("still offers the four gas flags", () => {
    const keys = Object.keys(contractDeployEvmBinding({} as never).fields?.shape ?? {});
    expect(keys).toEqual(expect.arrayContaining(["gasLimit", "maxFee", "priorityFee", "nonce"]));
  });

  it("takes its call value from the shared --value, not a family flag", () => {
    expect(Object.keys(contractSendEvmBinding({} as never).fields?.shape ?? {})).not.toContain(
      "callValue",
    );
    expect(Object.keys(contractSendSpec.baseFields?.shape ?? {})).toContain("value");
    expect(Object.keys(contractDeploySpec.baseFields?.shape ?? {})).not.toContain("value");
  });
});
