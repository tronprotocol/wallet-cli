import { describe, expect, it, vi } from "vitest";
import { contractDeployTronBinding } from "./contract.js";
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

describe("contract deploy — --params form guard", () => {
  const ABI = ctor({ stateMutability: "nonpayable" });

  it("passes raw positional values, the documented deploy form", async () => {
    const { run, deploy } = deployWith({
      abi: ABI,
      params: '[100, "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7"]',
    });
    await expect(run()).resolves.toBeDefined();
    expect(deploy.mock.calls[0]![2]).toMatchObject({
      parameters: [100, "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7"],
    });
  });

  it("defaults to no constructor args when --params is omitted", async () => {
    const { run, deploy } = deployWith({ abi: ABI });
    await expect(run()).resolves.toBeDefined();
    expect(deploy.mock.calls[0]![2]).toMatchObject({ parameters: [] });
  });

  // Measured: TronWeb rejects this too, as ethers' `invalid BigNumberish value (argument="value")`
  // — an internal argument name that collides with the user's own key. Same refusal, named.
  it("rejects the {type,value} form that contract call/send take", async () => {
    const params = '[{"type":"uint256","value":"100"}]';
    const { run, deploy } = deployWith({ abi: ABI, params });
    await expect(run()).rejects.toMatchObject({
      code: "invalid_value",
      message: expect.stringContaining("raw positional values"),
    });
    expect(deploy).not.toHaveBeenCalled();
  });

  it("rejects a multi-entry {type,value} array", async () => {
    const params = '[{"type":"uint256","value":"1"},{"type":"address","value":"T..."}]';
    const { run } = deployWith({ abi: ABI, params });
    await expect(run()).rejects.toMatchObject({ code: "invalid_value" });
  });

  // Only the unambiguous all-typed array is claimed. Anything else could be a legitimate struct or
  // a half-edited command line, and TronWeb's arity/type errors read fine on their own
  // ("constructor needs 1 but 2 provided").
  it.each([
    ["a mixed array", '[100, {"type":"uint256","value":"1"}]'],
    ["objects carrying a third key", '[{"type":"uint256","value":"1","name":"cap"}]'],
    ["objects whose type is not a string", '[{"type":1,"value":"1"}]'],
    ["objects whose type is empty", '[{"type":"","value":"1"}]'],
    ["an empty array", "[]"],
  ])("leaves %s to TronWeb", async (_label, params) => {
    const { run, deploy } = deployWith({ abi: ABI, params });
    await expect(run()).resolves.toBeDefined();
    expect(deploy).toHaveBeenCalledOnce();
  });

  it("still rejects --params that is not a JSON array", async () => {
    const { run } = deployWith({ abi: ABI, params: '{"type":"uint256"}' });
    await expect(run()).rejects.toMatchObject({ code: "invalid_value", message: /JSON array/ });
  });
});
