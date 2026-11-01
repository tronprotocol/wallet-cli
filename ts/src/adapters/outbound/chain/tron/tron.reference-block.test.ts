import { afterEach, describe, expect, it, vi } from "vitest";
import { TronRpcClient } from "./tron.js";
import type { TronTransactionArtifact } from "../../../../domain/types/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const HEAD_TIME = 1_800_000_000_000;

// A block id whose bytes 8..16 (hex 16..32) encode the height, so each height has its own hash.
const blockId = (height: number) =>
  `${height.toString(16).padStart(16, "0")}${height.toString(16).padStart(16, "a")}${"0".repeat(32)}`;
const refHash = (height: number) => blockId(height).slice(16, 32);
const refBytes = (height: number) => (height & 0xffff).toString(16).padStart(4, "0");

const block = (height: number) => ({
  blockID: blockId(height),
  block_header: { raw_data: { number: height, timestamp: HEAD_TIME } },
});

function nodeAt(head: number) {
  const requested: Array<number | "head"> = [];
  const fetch = vi.fn(async (url: string, init: { body: string }) => {
    const height = url.endsWith("/wallet/getnowblock")
      ? "head"
      : (JSON.parse(init.body) as { num: number }).num;
    requested.push(height);
    return Response.json(block(height === "head" ? head : height));
  });
  vi.stubGlobal("fetch", fetch);
  return { client: new TronRpcClient("https://node.invalid"), requested };
}

const transaction = (ref: { bytes: string; hash: string }, timestamp = HEAD_TIME - 60_000) =>
  ({
    txID: "ab",
    raw_data: { ref_block_bytes: ref.bytes, ref_block_hash: ref.hash, timestamp },
    raw_data_hex: "0a",
  }) as unknown as TronTransactionArtifact;

describe("TronRpcClient.referenceBlockStatus", () => {
  it("holds a reference block below the head", async () => {
    const { client, requested } = nodeAt(1_000_000);
    const ref = { bytes: refBytes(999_980), hash: refHash(999_980) };
    await expect(client.referenceBlockStatus(transaction(ref))).resolves.toBe("held");
    expect(requested).toEqual(["head", 999_980]);
  });

  it("holds the head block itself without a second read", async () => {
    const { client, requested } = nodeAt(1_000_000);
    const ref = { bytes: refBytes(1_000_000), hash: refHash(1_000_000) };
    await expect(client.referenceBlockStatus(transaction(ref))).resolves.toBe("held");
    expect(requested).toEqual(["head"]);
  });

  it("finds the reference block across a 16-bit wrap of ref_block_bytes", async () => {
    // 0x10002 wraps to bytes 0002; the referenced 0x0fff0 has bytes fff0.
    const { client, requested } = nodeAt(0x10002);
    const ref = { bytes: refBytes(0x0fff0), hash: refHash(0x0fff0) };
    await expect(client.referenceBlockStatus(transaction(ref))).resolves.toBe("held");
    expect(requested).toEqual(["head", 0x0fff0]);
  });

  it("reports a block at that height with another hash as a different chain", async () => {
    const { client } = nodeAt(1_000_000);
    const ref = { bytes: refBytes(999_980), hash: "1234567890abcdef" };
    await expect(client.referenceBlockStatus(transaction(ref))).resolves.toBe("different");
  });

  it("reports a reference block newer than the node's head as not reached", async () => {
    const { client } = nodeAt(1_000_000);
    const ref = { bytes: refBytes(1_000_005), hash: refHash(1_000_005) };
    await expect(client.referenceBlockStatus(transaction(ref, HEAD_TIME + 15_000))).resolves.toBe(
      "not-reached",
    );
  });

  it("reports an unknown reference block older than the head as a different chain", async () => {
    const { client } = nodeAt(1_000_000);
    const ref = { bytes: refBytes(1_000_005), hash: refHash(1_000_005) };
    await expect(client.referenceBlockStatus(transaction(ref))).resolves.toBe("different");
  });

  it.each([
    [{ bytes: "12", hash: refHash(1) }],
    [{ bytes: "zzzz", hash: refHash(1) }],
    [{ bytes: "0001", hash: "abcd" }],
  ])("refuses malformed reference fields %j without reading the node", async (ref) => {
    const { client, requested } = nodeAt(1_000_000);
    await expect(client.referenceBlockStatus(transaction(ref))).rejects.toMatchObject({
      code: "invalid_transaction",
    });
    expect(requested).toEqual([]);
  });
});
