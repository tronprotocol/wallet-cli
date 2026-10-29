import { describe, it, expect, afterEach, vi } from "vitest";
import { TronRpcClient } from "./tron.js";
import { withTronWeb } from "./__test-support__/tronweb.js";

const ADDR = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TronRpcClient timeout", () => {
  it("a hung node call rejects with ChainError(timeout) instead of hanging", async () => {
    const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://localhost:1", 20));
    tronweb.trx.getContract = (() => new Promise(() => {})) as never;
    await expect(client.getContract(ADDR)).rejects.toMatchObject({ code: "timeout" });
  });

  it("getContractMetadata fails not_found when no contract is deployed at the address", async () => {
    const { client, tronweb } = withTronWeb(() => new TronRpcClient("http://localhost:1", 20));
    tronweb.trx.getContract = (() => Promise.resolve({})) as never;
    tronweb.trx.getContractInfo = (() => Promise.resolve({})) as never;
    await expect(client.getContractMetadata(ADDR)).rejects.toMatchObject({ code: "not_found" });
  });

  it("getAccount aborts its fetch at timeoutMs (best-effort, does not hang)", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const client = new TronRpcClient("http://localhost:1", 20);
    await expect(client.getAccount(ADDR)).rejects.toBeTruthy();
  });
});
