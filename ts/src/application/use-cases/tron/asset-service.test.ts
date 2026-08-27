import { describe, expect, it, vi } from "vitest";
import { TronAssetService } from "./asset-service.js";
import type { NetworkDescriptor } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronAsset, TronGateway } from "../../ports/chain/tron-gateway.js";
import type { TxPipeline } from "../../services/pipeline/index.js";

const NET: NetworkDescriptor = {
  id: "tron:nile",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "nile",
  capabilities: [],
};
const OWNER = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const OWNER_HEX = "4174472e7d35395a6b5add427eecb7f4b62ad2b071"; // == OWNER
const OTHER_HEX = "419756bae210f6e9591f311613cff8f19d6cef3971";
const NOW = 1_800_000_000_000; // 2027-01-15T08:00:00Z

const scope: TransactionScope = {
  activeAccount: "wlt_test.0",
  resolveAddress: () => OWNER,
  timeoutMs: 60_000,
  wait: false,
  waitTimeoutMs: 60_000,
  emit: () => {},
  warn: () => {},
};

function asset(over: Partial<TronAsset> = {}): TronAsset {
  return {
    id: "1000123",
    owner_address: OWNER_HEX,
    name: "MyToken",
    abbr: "MTK",
    description: "Demo TRC10",
    url: "https://mytoken.io",
    total_supply: "1000000000000000",
    trx_num: 1,
    num: 100,
    precision: 6,
    start_time: NOW - 10_000,
    end_time: NOW + 10_000,
    ...over,
  };
}

function service(gateway: Partial<TronGateway>, pipeline?: Partial<TxPipeline>) {
  return new TronAssetService(
    { get: () => gateway as TronGateway } as unknown as ChainGatewayProvider,
    {
      assertCanSign: () => {},
      run: async () => ({ stage: "submitted", txId: "txid" }),
      ...pipeline,
    } as unknown as TxPipeline,
    () => NOW,
  );
}

const ISSUE = {
  name: "MyToken",
  supply: "1000000000",
  price: "1:100",
  start: "2028-01-01",
  end: "2028-02-01",
  url: "https://mytoken.io",
  precision: 6,
};

describe("asset issue", () => {
  it("refuses a Ledger account before touching the device", () => {
    // The Ledger TRON app cannot parse AssetIssueContract at all (docs/adr/0003).
    const assertCanSign = vi.fn();
    const svc = service({}, { assertCanSign });
    void svc.issue(scope, NET, { ...ISSUE }).catch(() => {});
    expect(assertCanSign).toHaveBeenCalledWith("wlt_test.0", "tron", { requireSoftware: true });
  });

  it("refuses an account that has already issued, before the fee is burned", async () => {
    const build = vi.fn();
    const svc = service({ getAssetByIssuer: async () => asset(), buildAssetIssue: build });
    await expect(svc.issue(scope, NET, { ...ISSUE })).rejects.toMatchObject({
      code: "already_issued_asset",
    });
    expect(build).not.toHaveBeenCalled();
  });

  it("scales supply and tranches by precision and reduces the price", async () => {
    let issuance: Record<string, unknown> | undefined;
    const svc = service(
      {
        getAssetByIssuer: async () => undefined,
        buildAssetIssue: (async (_owner: string, i: Record<string, unknown>) => {
          issuance = i;
          return {} as never;
        }) as never,
      },
      {
        run: async (p: { build: (o: string) => Promise<unknown> }) => {
          await p.build(OWNER);
          return { stage: "submitted", txId: "txid" } as never;
        },
      },
    );

    await svc.issue(scope, NET, { ...ISSUE, freeze: ["100000000:30", "50000000:90"] });
    expect(issuance).toMatchObject({
      totalSupply: 1_000_000_000 * 1e6,
      trxNum: 1,
      num: 100,
      frozenSupply: [
        { frozen_amount: 100_000_000 * 1e6, frozen_days: 30 },
        { frozen_amount: 50_000_000 * 1e6, frozen_days: 90 },
      ],
    });
  });

  it("reads --start/--end as UTC and requires a future, ordered window", async () => {
    const svc = service({ getAssetByIssuer: async () => undefined });
    await expect(svc.issue(scope, NET, { ...ISSUE, start: "2020-01-01" })).rejects.toThrow(
      /--start must be in the future/,
    );
    await expect(
      svc.issue(scope, NET, { ...ISSUE, start: "2028-02-01", end: "2028-01-01" }),
    ).rejects.toThrow(/--end must be later/);
    await expect(svc.issue(scope, NET, { ...ISSUE, start: "2028-13-01" })).rejects.toThrow(
      /not a real date/,
    );
  });

  it("rejects names the chain cannot hold", async () => {
    const svc = service({ getAssetByIssuer: async () => undefined });
    for (const name of ["My Token", "代币", "", "x".repeat(33)]) {
      await expect(svc.issue(scope, NET, { ...ISSUE, name })).rejects.toMatchObject({
        code: "invalid_asset_name",
      });
    }
  });

  it("requires a non-empty url and bounds the text fields", async () => {
    const svc = service({ getAssetByIssuer: async () => undefined });
    await expect(svc.issue(scope, NET, { ...ISSUE, url: "" })).rejects.toThrow(
      /--url must not be empty/,
    );
    await expect(svc.issue(scope, NET, { ...ISSUE, description: "d".repeat(201) })).rejects.toThrow(
      /--description must be at most 200 bytes/,
    );
  });
});

describe("asset update", () => {
  it("rewrites unspecified fields with their current chain values", async () => {
    let update: Record<string, unknown> | undefined;
    const svc = service(
      {
        getAssetByIssuer: async () =>
          asset({ free_asset_net_limit: 7, public_free_asset_net_limit: 9 }),
        buildAssetUpdate: (async (_o: string, u: Record<string, unknown>) => {
          update = u;
          return {} as never;
        }) as never,
      },
      {
        run: async (p: { build: (o: string) => Promise<unknown> }) => {
          await p.build(OWNER);
          return { stage: "submitted", txId: "txid" } as never;
        },
      },
    );

    await svc.update(scope, NET, { url: "https://mytoken.io/v2" });
    // the chain overwrites all four; omitting a flag must not blank the field
    expect(update).toEqual({
      url: "https://mytoken.io/v2",
      description: "Demo TRC10",
      freeAssetNetLimit: 7,
      publicFreeAssetNetLimit: 9,
    });
  });

  it("requires at least one field and an account that has issued", async () => {
    await expect(
      service({ getAssetByIssuer: async () => asset() }).update(scope, NET, {}),
    ).rejects.toThrow(/at least one of/);
    await expect(
      service({ getAssetByIssuer: async () => undefined }).update(scope, NET, {
        url: "https://x.io",
      }),
    ).rejects.toMatchObject({ code: "not_an_issuer" });
  });
});

describe("asset participate", () => {
  const input = { assetRef: "1000123", pay: "100" };

  it("computes what the ICO rate actually returns", async () => {
    const svc = service({ getAssetById: async () => asset({ owner_address: OTHER_HEX }) });
    await expect(svc.participate(scope, NET, input)).resolves.toMatchObject({
      paidSun: "100000000",
      receivedAmount: "10000000000", // 100 TRX × 100 tokens, in minimal units
    });
  });

  it("refuses the issuer's own ICO", async () => {
    const svc = service({ getAssetById: async () => asset({ owner_address: OWNER_HEX }) });
    await expect(svc.participate(scope, NET, input)).rejects.toMatchObject({
      code: "self_participation",
    });
  });

  it("refuses outside the funding window", async () => {
    for (const window of [{ start_time: NOW + 1 }, { end_time: NOW }]) {
      const svc = service({
        getAssetById: async () => asset({ owner_address: OTHER_HEX, ...window }),
      });
      await expect(svc.participate(scope, NET, input)).rejects.toMatchObject({
        code: "not_in_ico_window",
      });
    }
  });

  it("accepts a fractional TRX payment — TRX has 6 decimals", async () => {
    const svc = service({ getAssetById: async () => asset({ owner_address: OTHER_HEX }) });
    await expect(
      svc.participate(scope, NET, { assetRef: "1000123", pay: "10.5" }),
    ).resolves.toMatchObject({ paidSun: "10500000", receivedAmount: "1050000000" });
  });

  it("refuses a payment too small to buy one unit", async () => {
    // at 1 sun per 0.5 minimal units, the smallest possible payment buys nothing
    const svc = service({
      getAssetById: async () => asset({ owner_address: OTHER_HEX, trx_num: 2, num: 1 }),
    });
    await expect(
      svc.participate(scope, NET, { assetRef: "1000123", pay: "0.000001" }),
    ).rejects.toThrow(/too small to buy even one unit/);
  });

  it("reports an ambiguous name rather than guessing", async () => {
    const svc = service({
      getAssetsByName: async () => [asset({ id: "1000123" }), asset({ id: "1000488" })],
    });
    await expect(
      svc.participate(scope, NET, { assetRef: "MyToken", pay: "100" }),
    ).rejects.toMatchObject({
      code: "ambiguous_asset_name",
      details: { assetIds: ["1000123", "1000488"] },
    });
  });
});

describe("ambiguous asset names", () => {
  // A name collision is a choice, not a dead end: the error has to carry enough for the caller to
  // pick — ids for a machine, and the columns a human compares on (§3.7).
  it("carries the queried name, the ids, and one comparable row per match", async () => {
    const svc = service({
      getAssetsByName: async () => [
        asset({
          id: "1000123",
          owner_address: OTHER_HEX,
          total_supply: "1000000000",
          precision: 6,
        }),
        asset({ id: "1000488", owner_address: OWNER_HEX, total_supply: "50000000", precision: 2 }),
      ],
    });
    await expect(svc.info(NET, { assetRef: "MyToken" })).rejects.toMatchObject({
      code: "ambiguous_asset_name",
      details: {
        name: "MyToken",
        assetIds: ["1000123", "1000488"],
        matches: [
          { assetId: "1000123", totalSupply: "1000000000", precision: 6 },
          { assetId: "1000488", totalSupply: "50000000", precision: 2 },
        ],
      },
    });
  });

  it("resolves a name matching exactly one asset instead of erroring", async () => {
    const svc = service({ getAssetsByName: async () => [asset({ id: "1000123" })] });
    await expect(svc.info(NET, { assetRef: "MyToken" })).resolves.toMatchObject({
      assetId: "1000123",
    });
  });
});

describe("asset unfreeze", () => {
  const tranches = [
    { frozen_amount: "100000000000000", frozen_days: 30 },
    { frozen_amount: "50000000000000", frozen_days: 90 },
  ];

  it("releases every matured tranche and reports what stays frozen", async () => {
    const start = NOW - 60 * 86_400_000; // 60 days ago: first tranche matured, second not
    const svc = service({
      getAssetByIssuer: async () => asset({ start_time: start, frozen_supply: tranches }),
    });
    await expect(svc.unfreeze(scope, NET, {})).resolves.toMatchObject({
      releasedAmount: "100000000000000",
      stillFrozenAmount: "50000000000000",
    });
  });

  it("refuses when nothing has matured, naming the earliest unlock", async () => {
    const svc = service({
      getAssetByIssuer: async () => asset({ start_time: NOW, frozen_supply: tranches }),
    });
    await expect(svc.unfreeze(scope, NET, {})).rejects.toMatchObject({
      code: "not_yet_unfreezable",
    });
  });

  it("distinguishes no frozen supply from not being an issuer", async () => {
    await expect(
      service({ getAssetByIssuer: async () => asset({ frozen_supply: [] }) }).unfreeze(
        scope,
        NET,
        {},
      ),
    ).rejects.toMatchObject({ code: "no_frozen_supply" });
    await expect(
      service({ getAssetByIssuer: async () => undefined }).unfreeze(scope, NET, {}),
    ).rejects.toMatchObject({ code: "not_an_issuer" });
  });

  it("prefers the confirmed receipt amount over our own projection", async () => {
    const start = NOW - 60 * 86_400_000;
    const svc = service(
      { getAssetByIssuer: async () => asset({ start_time: start, frozen_supply: tranches }) },
      { run: async () => ({ stage: "confirmed", txId: "t", unfreezeAmount: 99 }) as never },
    );
    await expect(svc.unfreeze(scope, NET, {})).resolves.toMatchObject({ releasedAmount: "99" });
  });
});

describe("asset info / list", () => {
  it("returns one asset with its ICO terms and tranche unlock times", async () => {
    const start = 1_800_000_000_000;
    const svc = service({
      getAssetById: async () =>
        asset({ start_time: start, frozen_supply: [{ frozen_amount: "5", frozen_days: 30 }] }),
    });
    await expect(svc.info(NET, { assetRef: "1000123" })).resolves.toMatchObject({
      assetId: "1000123",
      price: "1:100",
      precision: 6,
      frozenSupply: [{ amount: "5", days: 30, expireTime: start + 30 * 86_400_000 }],
    });
  });

  it("requires exactly one of <asset> and --issuer", async () => {
    const svc = service({});
    await expect(svc.info(NET, {})).rejects.toThrow(/exactly one/);
    await expect(svc.info(NET, { assetRef: "1", issuer: OWNER })).rejects.toThrow(/exactly one/);
  });

  it("errors on an unknown reference rather than returning an empty result", async () => {
    const svc = service({ getAssetById: async () => undefined });
    await expect(svc.info(NET, { assetRef: "999" })).rejects.toMatchObject({
      code: "asset_not_found",
    });
  });

  it("pages server-side and reports only offset and limit", async () => {
    const listAssets = vi.fn(async () => [asset()]);
    const svc = service({ listAssets });
    await expect(svc.list(NET, { limit: 10, offset: 20 })).resolves.toMatchObject({
      assets: [{ assetId: "1000123", name: "MyToken", precision: 6 }],
      pagination: { offset: 20, limit: 10 },
    });
    expect(listAssets).toHaveBeenCalledWith(10, 20);
  });
});

/**
 * `asset issue` burns the issuance fee, an account may only ever issue once, and the ICO window is
 * fixed for the life of the token. So a mistyped time must not become a different, valid one.
 *
 * The parser accepted any two digits per component and let `Date.UTC` roll them over, checking only
 * the resulting DATE afterwards — which catches `24:00:00` (it lands on the next day) but not
 * `12:60:00`, which stays inside the same day and is silently read as 13:00:00.
 */
describe("asset issue rejects an impossible time instead of rolling it over", () => {
  const issueWith = (start: string) =>
    service({
      getAssetByIssuer: async () => undefined,
      buildAssetIssue: async () => ({}) as never,
    }).issue(scope, NET, { ...ISSUE, start, end: "2031-01-01", dryRun: true } as never);

  it.each([
    ["60 minutes", "2030-01-01 12:60:00"],
    ["60 seconds", "2030-01-01 12:00:60"],
    ["25 hours", "2030-01-01 25:00:00"],
    ["24 hours — already rejected, and must stay rejected", "2030-01-01 24:00:00"],
  ])("rejects %s", async (_label, start) => {
    await expect(issueWith(start)).rejects.toMatchObject({ code: "invalid_value" });
  });

  it.each([
    ["midnight", "2030-01-01 00:00:00"],
    ["the last second of a day", "2030-01-01 23:59:59"],
    ["a date with no time at all", "2030-01-01"],
  ])("still accepts %s", async (_label, start) => {
    await expect(issueWith(start)).resolves.toMatchObject({ kind: "asset-issue" });
  });
});
