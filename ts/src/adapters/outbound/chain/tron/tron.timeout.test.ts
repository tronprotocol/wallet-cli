import { describe, it, expect, afterEach, vi } from "vitest";
import { TronRpcClient } from "./tron.js";

const ADDR = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TronRpcClient timeout", () => {
  it("a hung node call rejects with ChainError(timeout) instead of hanging", async () => {
    const client = new TronRpcClient("http://localhost:1", 20);
    // never-resolving tronweb call → must be bounded by timeoutMs, not hang forever.
    client.tronweb.trx.getContract = (() => new Promise(() => {})) as never;
    await expect(client.getContract(ADDR)).rejects.toMatchObject({ code: "timeout" });
  });

  it("getAccount aborts its fetch at timeoutMs (best-effort, does not hang)", async () => {
    // fetch that only settles when its abort signal fires — proves the signal is wired to timeoutMs.
    // hangs unless an abort signal is wired — a missing signal must fail the test, not pass it.
    vi.stubGlobal("fetch", (_url: string, init?: RequestInit) =>
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
