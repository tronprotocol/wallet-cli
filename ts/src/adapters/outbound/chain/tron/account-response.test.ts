import { describe, expect, it } from "vitest";
import { parseTronAccountResponse } from "./tron.js";

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
