import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { Config, NetworkDescriptor, TronTransactionArtifact } from "../../../domain/types/index.js";
import { signTronLinkRequest } from "./auth.js";
import { TronLinkClient } from "./client.js";

const ADDRESS = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const UUID = "00000000-0000-4000-8000-000000000001";
const NOW = 1_900_000_000_000;
const CONFIG = {
  tronlinkSecretId: "sid",
  tronlinkSecretKey: "super-secret",
  tronlinkChannel: "wallet-cli",
} as Config;
const NETWORK = {
  id: "tron:mainnet",
  family: "tron",
  chainId: "mainnet",
  tronlinkHttpEndpoint: "https://api.walletadapter.org",
} as NetworkDescriptor;

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

class FakeSocket extends EventEmitter {
  readyState = 0;
  sent: string[] = [];
  send(data: string) { this.sent.push(data); }
  close(code = 1000) {
    this.readyState = 3;
    this.emit("close", code);
  }
  terminate() {
    this.readyState = 3;
    this.emit("close", 1006);
  }
  open() {
    this.readyState = 1;
    this.emit("open");
  }
}

describe("TronLink REST/WebSocket collaboration adapter", () => {
  it("matches Java GET signing while leaving filters outside the signed set", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      response({ code: 0, data: { range_total: 0, data: [] } }));
    const client = new TronLinkClient(CONFIG, 1_000, fetchMock as typeof fetch, () => NOW, () => UUID);
    await client.list(NETWORK, ADDRESS, { state: 0, isSigned: false, start: 20, limit: 10 });

    const calledUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(calledUrl.pathname).toBe("/multi/list");
    expect(calledUrl.searchParams.get("state")).toBe("0");
    expect(calledUrl.searchParams.get("is_sign")).toBe("false");
    expect(calledUrl.searchParams.get("sign")).toBe(
      signTronLinkRequest("GET", "/multi/list", {
        sign_version: "v1",
        channel: "wallet-cli",
        secret_id: "sid",
        ts: String(NOW),
        uuid: UUID,
        address: ADDRESS,
      }, "super-secret").signature,
    );
  });

  it("uploads unsigned raw_data with the Java createTransaction query shape", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      response({ code: 0, data: {} }));
    const client = new TronLinkClient(CONFIG, 1_000, fetchMock as typeof fetch, () => NOW, () => UUID);
    await client.create(NETWORK, ADDRESS, {
      permissionName: "finance",
      txId: "ab".repeat(32),
      rawDataJson: '{"contract":[]}',
      contractType: "TransferContract",
    });

    const [rawUrl, init] = fetchMock.mock.calls[0]!;
    const calledUrl = new URL(String(rawUrl));
    expect(calledUrl.searchParams.get("permission_name")).toBe("finance");
    expect(calledUrl.searchParams.get("tx_id")).toBe("ab".repeat(32));
    expect(JSON.parse(String(init?.body))).toEqual({
      raw_data: '{"contract":[]}',
      extra: { type: "TransferContract" },
    });
  });

  it("submits the complete accumulated transaction for a signing step", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      response({ code: 0, data: {} }));
    const client = new TronLinkClient(CONFIG, 1_000, fetchMock as typeof fetch, () => NOW, () => UUID);
    const transaction = {
      visible: true,
      txID: "ab".repeat(32),
      raw_data: { contract: [] },
      raw_data_hex: "00",
    } as TronTransactionArtifact;
    await client.submit(NETWORK, ADDRESS, transaction);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({ address: ADDRESS, transaction });
  });

  it("uses the official /multi/socket path and sends the v1 address subscription", async () => {
    const socket = new FakeSocket();
    let connectedUrl: URL | undefined;
    const factory = (url: URL) => {
      connectedUrl = url;
      queueMicrotask(() => socket.open());
      return socket as never;
    };
    const controller = new AbortController();
    const messages: unknown[] = [];
    const client = new TronLinkClient(
      CONFIG,
      1_000,
      globalThis.fetch,
      () => NOW,
      () => UUID,
      factory,
    );
    const watching = client.watch(NETWORK, ADDRESS, controller.signal, (message) => messages.push(message));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(connectedUrl?.pathname).toBe("/multi/socket");
    expect(connectedUrl?.searchParams.get("address")).toBe(ADDRESS);
    expect(socket.sent).toEqual([JSON.stringify({ address: ADDRESS, version: "v1" })]);

    socket.emit("message", Buffer.from('[{"state":0,"is_sign":0}]'));
    controller.abort();
    await watching;
    expect(messages).toEqual([[{ state: 0, is_sign: 0 }]]);
  });

  it("requires complete credentials and rejects insecure endpoints before a request", async () => {
    const fetchMock = vi.fn();
    await expect(new TronLinkClient({} as Config, 1_000, fetchMock as typeof fetch)
      .list(NETWORK, ADDRESS, { state: 255, start: 0, limit: 20 }))
      .rejects.toMatchObject({ code: "tronlink_credentials_missing" });

    const insecure = { ...NETWORK, tronlinkHttpEndpoint: "http://api.walletadapter.org" };
    await expect(new TronLinkClient(CONFIG, 1_000, fetchMock as typeof fetch)
      .list(insecure, ADDRESS, { state: 255, start: 0, limit: 20 }))
      .rejects.toMatchObject({ code: "invalid_config" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
