import { describe, it, expect, afterEach, vi } from "vitest";
import { TronGridHistoryReader } from "./history-reader.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";

const network = { httpEndpoint: "http://localhost:1" } as NetworkDescriptor;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TronGridHistoryReader timeout", () => {
  it("aborts a hung fetch at timeoutMs instead of hanging", async () => {
    // hangs unless an abort signal is wired — a missing signal must fail the test, not pass it.
    vi.stubGlobal("fetch", (_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
    );
    const reader = new TronGridHistoryReader(20);
    await expect(reader.get(network, "TXaddr", { limit: 20 })).rejects.toBeTruthy();
  });
});
