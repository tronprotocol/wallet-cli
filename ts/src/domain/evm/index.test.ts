import { describe, expect, it } from "vitest";
import { decodeErc20Transfer, NATIVE_TRANSFER_GAS, nativeTransferCostWei } from "./index.js";

const TO = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
const word = (hex: string) => hex.padStart(64, "0");

describe("decodeErc20Transfer", () => {
  it("decodes the recipient in EIP-55 form and the base-unit amount", () => {
    const input = `0xa9059cbb${word(TO.slice(2).toLowerCase())}${word((10n ** 30n).toString(16))}`;
    expect(decodeErc20Transfer(input)).toEqual({ to: TO, rawAmount: (10n ** 30n).toString() });
  });

  it.each([
    ["empty calldata", "0x"],
    ["another selector", `0x095ea7b3${word("1")}${word("2")}`],
    ["a truncated argument", `0xa9059cbb${word("1")}`],
    ["trailing bytes", `0xa9059cbb${word("1")}${word("2")}00`],
  ])("leaves %s undecoded", (_label, input) => {
    expect(decodeErc20Transfer(input)).toBeUndefined();
  });
});

describe("nativeTransferCostWei", () => {
  it("prices the 21000 gas of a native transfer beyond the safe-integer range", () => {
    expect(NATIVE_TRANSFER_GAS).toBe(21_000);
    expect(nativeTransferCostWei("1000000000")).toBe("21000000000000");
    expect(nativeTransferCostWei("9007199254740993")).toBe("189151184349560853000");
  });
});
