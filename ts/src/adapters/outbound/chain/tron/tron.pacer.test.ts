import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TronRpcClient } from "./tron.js";
import type { HttpTransport } from "../../http/index.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const ADDRESS = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const INTERVAL_MS = 400;

// Handle rejections while advancing the fake clock to avoid unhandled promises.
const settle = async <T>(work: Promise<T>): Promise<T> => {
  work.catch(() => {});
  await vi.runAllTimersAsync();
  return work;
};

const tracker = () => {
  const starts: number[] = [];
  let active = 0;
  let peak = 0;
  const enter = async () => {
    starts.push(Date.now());
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
  };
  const gaps = () => {
    const sorted = [...starts].sort((a, b) => a - b);
    return sorted.slice(1).map((t, i) => t - sorted[i]!);
  };
  return { starts, enter, gaps, peak: () => peak };
};

describe("TronRpcClient request pacing", () => {
  it("paces requests made through its HTTP transport", async () => {
    const t = tracker();
    const transport: HttpTransport = {
      async requestText() {
        await t.enter();
        return "{}";
      },
    };
    const client = new TronRpcClient("http://localhost:1", 30_000, transport);
    await settle(Promise.all(Array.from({ length: 3 }, () => client.getAccount(ADDRESS))));
    expect(t.starts).toHaveLength(3);
    expect(t.peak()).toBeLessThanOrEqual(2);
    expect(t.gaps()).toEqual([INTERVAL_MS, INTERVAL_MS]);
  });

  // Stub below the provider wrapper so pacing remains under test.
  it("paces tronweb-backed methods too", async () => {
    const t = tracker();
    const client = new TronRpcClient("http://localhost:1", 30_000);
    client.tronweb.fullNode.instance.request = (async () => {
      await t.enter();
      return { data: {} };
    }) as never;
    await settle(Promise.all(Array.from({ length: 3 }, () => client.getAccountResources(ADDRESS))));
    expect(t.starts).toHaveLength(3);
    expect(t.peak()).toBeLessThanOrEqual(2);
    expect(t.gaps()).toEqual([INTERVAL_MS, INTERVAL_MS]);
  });

  it("shares one pacer between both transports", async () => {
    const t = tracker();
    const transport: HttpTransport = {
      async requestText() {
        await t.enter();
        return "{}";
      },
    };
    const client = new TronRpcClient("http://localhost:1", 30_000, transport);
    client.tronweb.fullNode.instance.request = (async () => {
      await t.enter();
      return { data: {} };
    }) as never;
    await settle(
      Promise.all([
        client.getAccount(ADDRESS),
        client.getAccountResources(ADDRESS),
        client.getAccount(ADDRESS),
        client.getAccountResources(ADDRESS),
      ]),
    );
    expect(t.starts).toHaveLength(4);
    expect(t.peak()).toBeLessThanOrEqual(2);
    expect(t.gaps()).toEqual([INTERVAL_MS, INTERVAL_MS, INTERVAL_MS]);
  });

  it("does not let pacing spend the caller's timeout budget", async () => {
    const transport: HttpTransport = { requestText: async () => "{}" };
    const client = new TronRpcClient("http://localhost:1", 500, transport);
    const started = Date.now();
    await expect(
      settle(Promise.all(Array.from({ length: 4 }, () => client.getAccount(ADDRESS)))),
    ).resolves.toHaveLength(4);
    expect(Date.now() - started).toBe(3 * INTERVAL_MS);
  });

  it("does not send requests whose deadline expired while they were queued", async () => {
    let sent = 0;
    const transport: HttpTransport = {
      async requestText() {
        sent += 1;
        await new Promise((resolve) => setTimeout(resolve, 600));
        return "{}";
      },
    };
    const client = new TronRpcClient("http://localhost:1", 500, transport);
    const results = await settle(
      Promise.allSettled(Array.from({ length: 4 }, () => client.getAccount(ADDRESS))),
    );
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    // The two queued requests expire before obtaining permits.
    expect(sent).toBe(2);
  });

  it("keeps pacing after tronweb swaps its providers", async () => {
    const t = tracker();
    const client = new TronRpcClient("http://localhost:1", 30_000);
    client.tronweb.setHeader({ "TRON-PRO-API-KEY": "key" });
    client.tronweb.fullNode.instance.request = (async () => {
      await t.enter();
      return { data: {} };
    }) as never;
    await settle(Promise.all(Array.from({ length: 3 }, () => client.getAccountResources(ADDRESS))));
    expect(t.starts).toHaveLength(3);
    expect(t.peak()).toBeLessThanOrEqual(2);
    expect(t.gaps()).toEqual([INTERVAL_MS, INTERVAL_MS]);
  });
});
