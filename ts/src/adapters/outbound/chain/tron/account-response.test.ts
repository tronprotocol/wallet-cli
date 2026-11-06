import { describe, expect, it } from "vitest";
import type { Types } from "tronweb";
import { tronHexToBase58 } from "../../../../domain/address/index.js";
import {
  activePermissionFromNode,
  parseTronAccountResponse,
  permissionGroupFromNode,
  tronAccountState,
  tronResourceUsage,
  type NodeAccount,
} from "./account-response.js";

describe("parseTronAccountResponse", () => {
  it("preserves account, staking and TRC10 quantities as exact decimal strings", () => {
    const account = parseTronAccountResponse(`{
      "balance": 9007199254740993,
      "create_time": 1700000000000,
      "frozenV2": [{ "type": "ENERGY", "amount": 9007199254740995 }],
      "unfrozenV2": [{ "unfreeze_amount": 9007199254740997, "unfreeze_expire_time": 1700000000000 }],
      "assetV2": [{ "key": "1002000", "value": 9007199254740999 }]
    }`);

    expect(account.balance).toBe("9007199254740993");
    expect(account.frozenV2?.[0]?.amount).toBe("9007199254740995");
    expect(account.unfrozenV2?.[0]?.unfreeze_amount).toBe("9007199254740997");
    expect(account.assetV2?.[0]?.value).toBe("9007199254740999");
    expect(account.create_time).toBe(1700000000000);
  });

  it("normalizes safe quantities to strings too, keeping the application DTO stable", () => {
    const account = parseTronAccountResponse('{"balance": 1000000, "frozenV2": [{"amount": 2}]}');
    expect(account.balance).toBe("1000000");
    expect(account.frozenV2?.[0]?.amount).toBe("2");
  });

  it("keeps an unsafe non-quantity integer exact instead of emitting a rounded number", () => {
    const account = parseTronAccountResponse('{"future_integer_field": 9007199254740993}');
    expect(account.future_integer_field).toBe("9007199254740993");
  });
});

const KEY_HEX = "41" + "11".repeat(20);
const KEY = tronHexToBase58(KEY_HEX);
const OTHER_HEX = "41" + "22".repeat(20);
const OTHER = tronHexToBase58(OTHER_HEX);
const OPERATIONS = "7fff1fc0033ef30f000000000000000000000000000000000000000000000000";

describe("tronAccountState", () => {
  it("maps the node account and defaults omitted protobuf zero values", () => {
    const state = tronAccountState(
      parseTronAccountResponse(`{
        "address": "${KEY_HEX}",
        "account_name": "${Buffer.from("main").toString("hex")}",
        "create_time": 1700000000000,
        "latest_withdraw_time": 0,
        "frozenV2": [{ "amount": 1 }, { "type": "ENERGY", "amount": 2 }, { "type": "TRON_POWER", "amount": 4 }, { "type": "OTHER", "amount": 8 }],
        "unfrozenV2": [{ "unfreeze_amount": 5, "unfreeze_expire_time": 1700000000001 }],
        "votes": [{ "vote_address": "${OTHER_HEX}", "vote_count": 3 }, { "vote_address": "${OTHER_HEX}", "vote_count": 0 }]
      }`),
      KEY,
    );
    expect(state).toMatchObject({
      address: KEY,
      balanceSun: "0",
      name: "main",
      createdAt: 1700000000000,
      stake: { bandwidthSun: "1", energySun: "2", tronPowerSun: "4", totalSun: "7" },
      unfreezing: [{ amountSun: "5", withdrawableAt: 1700000000001 }],
      votes: [{ witness: OTHER, count: "3" }],
    });
    expect(state).not.toHaveProperty("latestWithdrawAt");
    expect(state).not.toHaveProperty("id");
  });

  it.each([
    ["an address other than the query", { address: OTHER_HEX }, /different from the query/],
    ["a non-string address", { address: 7 }, /malformed account address/],
    ["an invalid address", { address: "41zz" }, /invalid account address/],
    ["account text that is not hex", { account_name: "main" }, /malformed account_name/],
    ["an invalid balance", { balance: -1 }, /invalid balance/],
    [
      "an unfreeze entry without expiry",
      { unfrozenV2: [{ unfreeze_amount: 1 }] },
      /without expiry/,
    ],
    ["a vote without an address", { votes: [{ vote_count: 1 }] }, /vote without an address/],
  ])("rejects %s", (_name, account, message) => {
    expect(() => tronAccountState(account as NodeAccount, KEY)).toThrow(message);
  });
});

describe("tronResourceUsage", () => {
  it("sums free and staked bandwidth and defaults omitted counters to zero", () => {
    expect(
      tronResourceUsage({
        EnergyUsed: 1,
        EnergyLimit: 10,
        NetUsed: 2,
        freeNetUsed: 3,
        NetLimit: 20,
        freeNetLimit: 600,
        tronPowerLimit: 5,
      } as Types.AccountResourceMessage),
    ).toEqual({
      energy: { used: 1, limit: 10 },
      bandwidth: { used: 5, limit: 620 },
      votingPower: { total: 5, used: 0 },
    });
  });

  it("rejects an imprecise counter", () => {
    expect(() => tronResourceUsage({ EnergyUsed: 1.5 } as Types.AccountResourceMessage)).toThrow(
      /EnergyUsed/,
    );
  });
});

describe("permissionGroupFromNode", () => {
  const group = (overrides: Record<string, unknown> = {}) => ({
    threshold: 2,
    keys: [
      { address: KEY_HEX, weight: 1 },
      { address: OTHER_HEX, weight: 1 },
    ],
    ...overrides,
  });

  it("maps keys to base58, falls back to the kind as name and the given id", () => {
    expect(permissionGroupFromNode(group(), "owner", 0)).toEqual({
      id: 0,
      name: "owner",
      threshold: 2,
      keys: [
        { address: KEY, weight: 1, local: null },
        { address: OTHER, weight: 1, local: null },
      ],
    });
  });

  it.each([
    ["a non-object", null, {}, /malformed owner permission data/],
    ["no keys", group({ keys: [] }), {}, /invalid owner key count/],
    [
      "more than five keys",
      group({ keys: Array(6).fill({ address: KEY_HEX, weight: 1 }) }),
      {},
      /key count/,
    ],
    ["the wrong exact key count", group(), { exactKeys: 1 }, /key count/],
    ["a zero threshold", group({ threshold: 0 }), {}, /zero owner threshold/],
    [
      "a duplicate key",
      group({
        keys: [
          { address: KEY_HEX, weight: 1 },
          { address: KEY_HEX, weight: 1 },
        ],
      }),
      {},
      /invalid owner.keys\[1\]/,
    ],
    [
      "a zero weight",
      group({ keys: [{ address: KEY_HEX, weight: 0 }] }),
      {},
      /invalid owner.keys\[0\]/,
    ],
    ["a threshold above total weight", group({ threshold: 3 }), {}, /above total key weight/],
    ["an unexpected id", group({ id: 1 }), { expectedId: 0 }, /invalid owner permission id/],
    [
      "a control character in the name",
      group({ permission_name: "a\u0007" }),
      {},
      /owner.permission_name/,
    ],
    [
      "a name over 32 bytes",
      group({ permission_name: "x".repeat(33) }),
      {},
      /owner.permission_name/,
    ],
  ])("rejects %s", (_name, value, constraints, message) => {
    expect(() => permissionGroupFromNode(value, "owner", 0, constraints)).toThrow(message);
  });
});

describe("activePermissionFromNode", () => {
  const active = (overrides: Record<string, unknown> = {}) => ({
    threshold: 1,
    keys: [{ address: KEY_HEX, weight: 1 }],
    operations: OPERATIONS,
    ...overrides,
  });

  it("defaults the id from the index and decodes operations", () => {
    const permission = activePermissionFromNode(active(), 0);
    expect(permission).toMatchObject({ id: 2, name: "active[0]", operationsHex: OPERATIONS });
    expect(permission.operations.length).toBeGreaterThan(0);
  });

  it.each([
    ["a non-active id", active({ id: 1 }), /invalid active\[0\] permission id/],
    ["missing operations", active({ operations: undefined }), /without operations/],
    ["malformed operations", active({ operations: "zz" }), /malformed active\[0\] operations/],
  ])("rejects %s", (_name, value, message) => {
    expect(() => activePermissionFromNode(value, 0)).toThrow(message);
  });
});
