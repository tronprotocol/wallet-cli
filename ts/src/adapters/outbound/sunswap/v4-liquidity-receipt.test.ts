import { describe, expect, it } from "vitest";
import { tronHexToBase58 } from "../../../domain/address/index.js";
import { NATIVE_TRX_ADDRESS } from "../../../domain/sunswap/tokens.js";
import type { TronTxInfo } from "../../../application/ports/chain/tron-gateway.js";
import { decodeV4LiquidityReceipt } from "./v4-liquidity-receipt.js";
import removal from "./fixtures/v4-remove.json";
import collection from "./fixtures/v4-collect.json";
import mint from "./fixtures/v4-mint.json";
const manager = "TMTQ1BYo15aGgZXHcsBWXyae8bVaAdgfLP";
const pool = "TVivLPeq7FMmTG8Z7HaiBgHTsMwCEcipKT";
const ownerHex = "418c7145112ac207cc95544a930c769d468d01cd4e";
const query = {
  poolId: "977d6ad6be3a3206f7ca881434bb8a08ecaf1abe4690eed6ee23e3e7e0ae9b6a",
  tokenId: "7",
  account: tronHexToBase58(ownerHex),
  token0: NATIVE_TRX_ADDRESS,
  token1: tronHexToBase58("41eca9bc828a3005b9a3b909f2cc5c2a54794de05f"),
};
const decode = (info: unknown, overrides = {}) =>
  decodeV4LiquidityReceipt(info as TronTxInfo, { ...query, ...overrides }, manager, pool);
describe("V4 liquidity receipt settlement", () => {
  it("matches real withdrawal principal, fees and transfers without subtracting gas", () => {
    expect(decode(removal)).toEqual({
      tokenId: "7",
      liquidityDelta: "-1000",
      principal0: "1660",
      principal1: "602",
      fee0: "4821",
      fee1: "3132",
      balanceDelta0: "6481",
      balanceDelta1: "3734",
    });
    expect(decode({ ...removal, fee: 999999999 })).toEqual(decode(removal));
  });
  it("decodes a real collection above Number.MAX_SAFE_INTEGER exactly", () => {
    expect(
      decode(collection, {
        poolId: "21656f91057e449fe849dfd7bd07739346829c50a6b3fefd5e326e8c5a84ba07",
        tokenId: "5",
        token0: tronHexToBase58("412a769a33b6ed01a074e4a45bffa0778a27949bec"),
        token1: tronHexToBase58("41df8b1f3c5ceb7b8db39b729fa930387c4762c60b"),
      }),
    ).toEqual({
      tokenId: "5",
      liquidityDelta: "0",
      principal0: "0",
      principal1: "0",
      fee0: BigInt("0x02ad74403180a775").toString(),
      fee1: "1010",
      balanceDelta0: BigInt("0x02ad74403180a775").toString(),
      balanceDelta1: "1010",
    });
  });
  it("finds the minted position without double counting native forwarding", () => {
    expect(decode(mint, { tokenId: undefined, nativeValueSent: "1000000" })).toMatchObject({
      tokenId: "179",
      liquidityDelta: "8328752",
      principal0: "-1000000",
      principal1: "0",
      balanceDelta0: "-1000000",
      balanceDelta1: "0",
    });
  });
  it("deducts native refunds from the sent ceiling", () => {
    const info = {
      ...mint,
      internal_transactions: [
        ...mint.internal_transactions,
        {
          caller_address: "417dfe36f4916e434c020405ebb6e7cde0b9673cc7",
          transferTo_address: ownerHex,
          callValueInfo: [{ callValue: 100000 }],
        },
      ],
    };
    expect(decode(info, { tokenId: undefined, nativeValueSent: "1100000" })?.balanceDelta0).toBe(
      "-1000000",
    );
  });
  it("uses transfers when hooks change settlement after the pool event", () => {
    const info = structuredClone(removal);
    const transfer = info.internal_transactions.find((call) =>
      call.callValueInfo.some((v) => "callValue" in v && v.callValue === 6481),
    )!;
    transfer.callValueInfo = [{ callValue: 6400 }];
    expect(decode(info)).toMatchObject({ principal0: "1660", fee0: "4821", balanceDelta0: "6400" });
  });
  it("ignores rejected calls and TRC10 amounts", () => {
    const extra = {
      caller_address: "417dfe36f4916e434c020405ebb6e7cde0b9673cc7",
      transferTo_address: ownerHex,
    };
    expect(
      decode({
        ...removal,
        internal_transactions: [
          ...removal.internal_transactions,
          { ...extra, rejected: true, callValueInfo: [{ callValue: 9000 }] },
          { ...extra, callValueInfo: [{ callValue: 9000, tokenId: "1000001" }] },
        ],
      }),
    ).toEqual(decode(removal));
  });
  it.each([{ tokenId: "8" }, { poolId: "0".repeat(64) }])(
    "rejects another position or pool: %o",
    (overrides) => {
      expect(decode(removal, overrides)).toBeUndefined();
    },
  );
  it("does not attribute another recipient's transfers", () => {
    expect(decode(removal, { account: manager })?.balanceDelta0).toBe("0");
  });
  it("rejects missing native traces and failed transactions", () => {
    expect(decode({ ...removal, internal_transactions: undefined })).toBeUndefined();
    expect(decode({ ...removal, receipt: { result: "REVERT" } })).toBeUndefined();
  });
  it("rejects ambiguous, malformed and spoofed position events", () => {
    const event = removal.log.find((entry) => entry.topics.length === 2)!;
    expect(decode({ ...removal, log: [...removal.log, event] })).toBeUndefined();
    for (const change of [{ data: "00" }, { address: "0".repeat(40) }]) {
      expect(
        decode({
          ...removal,
          log: removal.log.map((entry) => (entry === event ? { ...entry, ...change } : entry)),
        }),
      ).toBeUndefined();
    }
  });
});
