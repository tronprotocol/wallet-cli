import { describe, expect, it, vi } from "vitest";
import { TronRpcClient } from "./tron.js";
import { withTronWeb } from "./__test-support__/tronweb.js";
import type { HttpRequest, HttpTransport } from "../../http/index.js";

const OWNER_HEX = "418225f3aa48a2d30643a64410abb1e914dfa0bd2f";
const OWNER = "TMqNJwD3qVmuRxzzP3Q4A24fuByVBKQ39E";
const SR_HEX = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";
const SR = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const hex = (text: string) => Buffer.from(text, "utf8").toString("hex");

// Answers raw node POSTs by path; SDK calls are replaced on the returned TronWeb.
function node(responses: Record<string, string>) {
  const transport: HttpTransport = {
    requestText: async (request: HttpRequest) => {
      const body = responses[request.path ?? ""];
      if (body === undefined) throw new Error(`unexpected request ${request.path}`);
      return body;
    },
  };
  return withTronWeb(() => new TronRpcClient("https://node.invalid", transport));
}

describe("TronRpcClient.getAccountState", () => {
  const account = (fields: Record<string, unknown>) =>
    node({ "/wallet/getaccount": JSON.stringify({ address: OWNER_HEX, ...fields }) }).client;

  it("totals stake by type; an untyped entry is BANDWIDTH and unknown types are not counted", async () => {
    const state = await account({
      frozenV2: [
        { amount: 5_000_000 },
        { type: "ENERGY", amount: 1_000_000 },
        { type: "TRON_POWER", amount: 3_000_000 },
        { type: "FUTURE_RESOURCE", amount: 7_000_000 },
      ],
    }).getAccountState(OWNER);

    expect(state.stake).toEqual({
      energySun: "1000000",
      bandwidthSun: "5000000",
      tronPowerSun: "3000000",
      totalSun: "9000000",
    });
  });

  it("keeps stake totals above Number.MAX_SAFE_INTEGER exact", async () => {
    const { client } = node({
      "/wallet/getaccount": `{"address":"${OWNER_HEX}","frozenV2":[{"type":"ENERGY","amount":9007199254740993}]}`,
    });

    await expect(client.getAccountState(OWNER)).resolves.toMatchObject({
      stake: { energySun: "9007199254740993", totalSun: "9007199254740993" },
    });
  });

  it("decodes votes, account text and times, and keeps the node JSON as raw", async () => {
    const state = await account({
      balance: 42,
      account_name: hex("Acme Treasury"),
      account_id: hex("acme-001"),
      create_time: 1700000000000,
      latest_withdraw_time: 1700000100000,
      votes: [
        { vote_address: SR_HEX, vote_count: 400 },
        { vote_address: OWNER_HEX, vote_count: 0 },
      ],
      unfrozenV2: [{ unfreeze_amount: 300, unfreeze_expire_time: 1784160000000 }],
    }).getAccountState(OWNER);

    expect(state).toMatchObject({
      address: OWNER,
      balanceSun: "42",
      name: "Acme Treasury",
      id: "acme-001",
      createdAt: 1700000000000,
      latestWithdrawAt: 1700000100000,
      votes: [{ witness: SR, count: "400" }],
      unfreezing: [{ amountSun: "300", withdrawableAt: 1784160000000 }],
    });
    expect(state.raw).toMatchObject({ address: OWNER_HEX, account_name: hex("Acme Treasury") });
  });

  it("keeps a name that reads as hex as the decoded text", async () => {
    const state = await account({ account_name: hex("4142") }).getAccountState(OWNER);

    expect(state.name).toBe("4142");
  });

  it("reports an empty account as not activated, with zero totals and no times", async () => {
    const { client } = node({ "/wallet/getaccount": "{}" });
    const state = await client.getAccountState(OWNER);

    expect(state).toMatchObject({ balanceSun: "0", unfreezing: [], votes: [] });
    expect(state.address).toBeUndefined();
    expect(state.createdAt).toBeUndefined();
    expect(state.latestWithdrawAt).toBeUndefined();
  });

  it("rejects an unfreezing entry without an expiry instead of reporting time 0", async () => {
    await expect(
      account({ unfrozenV2: [{ unfreeze_amount: 300 }] }).getAccountState(OWNER),
    ).rejects.toMatchObject({ code: "provider_error" });
  });

  it("rejects an account for a different address than the query", async () => {
    await expect(account({}).getAccountState(SR)).rejects.toMatchObject({
      code: "provider_error",
    });
  });

  it("rejects malformed account text", async () => {
    await expect(account({ account_name: "not hex" }).getAccountState(OWNER)).rejects.toMatchObject(
      { code: "provider_error" },
    );
  });
});

describe("TronRpcClient.getAccountResources", () => {
  it("adds the free bandwidth allowance and reads omitted counters as 0", async () => {
    const { client, tronweb } = node({});
    tronweb.trx.getAccountResources = vi.fn(async () => ({
      freeNetUsed: 500,
      freeNetLimit: 600,
      NetUsed: 100,
      NetLimit: 1000,
      EnergyLimit: 65000,
      tronPowerLimit: 1500,
      tronPowerUsed: 400,
    })) as never;

    await expect(client.getAccountResources(OWNER)).resolves.toEqual({
      energy: { used: 0, limit: 65000 },
      bandwidth: { used: 600, limit: 1600 },
      votingPower: { total: 1500, used: 400 },
    });
  });
});

describe("TronRpcClient blocks", () => {
  const block = `{"blockID":"00ab","block_header":{"raw_data":{"number":84120345,"timestamp":1722925264000}},"transactions":[{},{}]}`;

  it("getHeadBlock reads the head height and timestamp", async () => {
    const { client } = node({ "/wallet/getnowblock": block });

    await expect(client.getHeadBlock()).resolves.toEqual({
      number: 84120345,
      timestampMs: 1722925264000,
    });
  });

  it("getHeadBlock fails instead of reporting height 0 when the head header is missing", async () => {
    const { client } = node({ "/wallet/getnowblock": `{"blockID":"00ab"}` });

    await expect(client.getHeadBlock()).rejects.toMatchObject({ code: "invalid_node_response" });
  });

  it("getBlock returns the summary beside the raw block", async () => {
    const { client } = node({ "/wallet/getblockbynum": block });

    await expect(client.getBlock("84120345")).resolves.toEqual({
      number: 84120345,
      timestampMs: 1722925264000,
      transactionCount: 2,
      raw: JSON.parse(block),
    });
  });

  it("getBlock returns null for a height the node does not hold", async () => {
    const { client } = node({ "/wallet/getblockbynum": "{}" });

    await expect(client.getBlock("999999999")).resolves.toBeNull();
  });
});

describe("TronRpcClient price timelines", () => {
  it("parses the node timeline oldest first", async () => {
    const { client, tronweb } = node({});
    tronweb.trx.getEnergyPrices = vi.fn(async () => "0:100,1670515200000:210") as never;

    await expect(client.getEnergyPrices()).resolves.toEqual([
      { sinceMs: 0, sunPerUnit: 100 },
      { sinceMs: 1670515200000, sunPerUnit: 210 },
    ]);
  });

  it.each(["", "0:100,1670515200000:oops", "abc:def"])(
    "rejects an unusable timeline %j instead of reporting a price",
    async (timeline) => {
      const { client, tronweb } = node({});
      tronweb.trx.getBandwidthPrices = vi.fn(async () => timeline) as never;

      await expect(client.getBandwidthPrices()).rejects.toMatchObject({
        code: "invalid_node_response",
      });
    },
  );
});

describe("TronRpcClient.getNodeInfo", () => {
  it("parses the solid block height and versions", async () => {
    const { client, tronweb } = node({});
    tronweb.trx.getNodeInfo = vi.fn(async () => ({
      block: "Num:84120345,ID:abc",
      solidityBlock: "Num:84120326,ID:def",
      currentConnectCount: 30,
      activeConnectCount: 27,
      configNodeInfo: { codeVersion: "4.7.7", p2pVersion: "11111" },
    })) as never;

    await expect(client.getNodeInfo()).resolves.toEqual({
      solidBlockNumber: 84120326,
      peers: { connected: 30, active: 27 },
      codeVersion: "4.7.7",
      p2pVersion: "11111",
    });
  });

  it("omits peers unless both counts are reported", async () => {
    const { client, tronweb } = node({});
    tronweb.trx.getNodeInfo = vi.fn(async () => ({ currentConnectCount: 30 })) as never;

    await expect(client.getNodeInfo()).resolves.toEqual({});
  });
});

describe("TronRpcClient.deployedContractAddress", () => {
  it("returns the prepared deployment's address in base58", () => {
    const { client } = node({});

    expect(client.deployedContractAddress({ contract_address: SR_HEX } as never)).toBe(SR);
    expect(client.deployedContractAddress({ txID: "d" } as never)).toBeUndefined();
  });
});
