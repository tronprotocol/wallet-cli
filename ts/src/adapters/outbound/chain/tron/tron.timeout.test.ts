import { describe, it, expect, afterEach, vi } from "vitest";
import { TronRpcClient } from "./tron.js";
import { withTronWeb } from "./__test-support__/tronweb.js";
import { withDispatchCheck } from "../../http/dispatch-context.js";
import { expiringCheck } from "../../http/__test-support__/dispatch.js";

const ADDR = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TronRpcClient command deadline", () => {
  it("ends a hung SDK call with timeout when the deadline expires", async () => {
    const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://localhost:1"));
    tronweb.trx.getContract = (() => new Promise(() => {})) as never;
    await expect(
      withDispatchCheck(expiringCheck(20), () => client.getContract(ADDR)),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("getContractMetadata fails not_found when no contract is deployed at the address", async () => {
    const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://localhost:1"));
    tronweb.trx.getContract = (() => Promise.resolve({})) as never;
    tronweb.trx.getContractInfo = (() => Promise.resolve({})) as never;
    await expect(client.getContractMetadata(ADDR)).rejects.toMatchObject({ code: "not_found" });
  });

  it("getContractMetadata times out when the deadline stops the optional info read", async () => {
    const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://localhost:1"));
    tronweb.trx.getContract = (() => Promise.resolve({ bytecode: "60" })) as never;
    tronweb.trx.getContractInfo = (() => new Promise(() => {})) as never;
    await expect(
      withDispatchCheck(expiringCheck(20), () => client.getContractMetadata(ADDR)),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("getContractMetadata omits info when the optional info read fails", async () => {
    const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://localhost:1"));
    tronweb.trx.getContract = (() => Promise.resolve({ bytecode: "60" })) as never;
    tronweb.trx.getContractInfo = (() => Promise.reject(new Error("unsupported"))) as never;
    await expect(client.getContractMetadata(ADDR)).resolves.toBeDefined();
  });

  it("aborts a sent getAccount request with the deadline and reports timeout", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const client = new TronRpcClient("http://localhost:1");
    await expect(
      withDispatchCheck(expiringCheck(20), () => client.getAccount(ADDR)),
    ).rejects.toMatchObject({ code: "timeout" });
  });
});
