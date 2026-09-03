import { describe, it, expect } from "vitest";
import { TronRpcClient } from "./tron.js";
import type { HttpTransport } from "../../http/index.js";

const ADDRESS = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
/** the client's configured spacing; asserted against rather than restated per test */
const INTERVAL_MS = 400;
/** timer jitter can shave a millisecond or two off a setTimeout */
const SLACK_MS = 10;

/** Records when each request starts and how many are in flight, whichever path it took. */
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
    await Promise.all(Array.from({ length: 3 }, () => client.getAccount(ADDRESS)));
    expect(t.starts).toHaveLength(3);
    expect(t.peak()).toBeLessThanOrEqual(2);
    expect(t.gaps().every((g) => g >= INTERVAL_MS - SLACK_MS)).toBe(true);
  });

  /** tronweb has its own axios client, so the pacer is installed on its providers. Stubbing the
   *  axios instance underneath leaves that wrapper in place, which is exactly what is under test —
   *  and this drives it through a real gateway method rather than the provider directly. */
  it("paces tronweb-backed methods too", async () => {
    const t = tracker();
    const client = new TronRpcClient("http://localhost:1", 30_000);
    client.tronweb.fullNode.instance.request = (async () => {
      await t.enter();
      return { data: {} };
    }) as never;
    await Promise.all(Array.from({ length: 3 }, () => client.getAccountResources(ADDRESS)));
    expect(t.starts).toHaveLength(3);
    expect(t.peak()).toBeLessThanOrEqual(2);
    expect(t.gaps().every((g) => g >= INTERVAL_MS - SLACK_MS)).toBe(true);
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
    await Promise.all([
      client.getAccount(ADDRESS),
      client.getAccountResources(ADDRESS),
      client.getAccount(ADDRESS),
      client.getAccountResources(ADDRESS),
    ]);
    expect(t.starts).toHaveLength(4);
    expect(t.peak()).toBeLessThanOrEqual(2);
    // one shared budget: starts are spaced across both transports, not per transport
    expect(t.gaps().every((g) => g >= INTERVAL_MS - SLACK_MS)).toBe(true);
  });

  /** The pacer's wait is self-imposed, so it must not be charged against --timeout: a fan-out that
   *  spends longer queued than the whole budget still has to complete. */
  it("does not let pacing spend the caller's timeout budget", async () => {
    const transport: HttpTransport = { requestText: async () => "{}" };
    // a budget far shorter than the 3 x 400ms of pacing this fan-out needs
    const client = new TronRpcClient("http://localhost:1", 500, transport);
    const started = Date.now();
    await expect(
      Promise.all(Array.from({ length: 4 }, () => client.getAccount(ADDRESS))),
    ).resolves.toHaveLength(4);
    expect(Date.now() - started).toBeGreaterThan(1_000);
  });

  /** A caller that has already been told it timed out must not have its request sent later: the
   *  node budget is spent on nobody, and on the broadcast path it would submit an abandoned tx. */
  it("does not send requests whose deadline expired while they were queued", async () => {
    let sent = 0;
    const transport: HttpTransport = {
      async requestText() {
        sent += 1;
        await new Promise((resolve) => setTimeout(resolve, 600)); // outlives the 500ms budget
        return "{}";
      },
    };
    const client = new TronRpcClient("http://localhost:1", 500, transport);
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => client.getAccount(ADDRESS)),
    );
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    // only the two that took a permit reached the wire; the queued pair were dropped
    expect(sent).toBe(2);
  });
});
