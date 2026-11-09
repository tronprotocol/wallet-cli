import { describe, it, expect, afterEach, vi } from "vitest";
import { TronGridHistoryReader } from "./history-reader.js";
import { expiringCheck } from "../../http/__test-support__/dispatch.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";

const network = { httpEndpoint: "http://localhost:1" } as NetworkDescriptor;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TronGridHistoryReader timeout", () => {
  it("aborts a hung fetch when the deadline expires", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const reader = new TronGridHistoryReader();
    await expect(
      reader.get(network, "TXaddr", { limit: 20 }, expiringCheck(20)),
    ).rejects.toMatchObject({ code: "timeout" });
  });
});
