import { describe, expect, it } from "vitest";
import { decodeReceivedAmount } from "./received-amount.js";
import { tronHexAddress } from "../../../../domain/address/index.js";
import { NATIVE_TRX_ADDRESS } from "../../../../domain/sunswap/tokens.js";

const OWNER = "TDbWLnRxt8f7e81BBccGEKoSoDGR4pmnuJ";
const TOKEN = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const OTHER = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const hex = (s: string) => tronHexAddress(s).slice(-40);
const word = (s: string) => hex(s).padStart(64, "0");
const transfer = (from: string, to: string, amount: bigint, token = TOKEN) => ({
  address: hex(token),
  topics: [
    "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    word(from),
    word(to),
  ],
  data: amount.toString(16).padStart(64, "0"),
});
const receipt = { receipt: { result: "SUCCESS" } };

describe("transaction-scoped trade output", () => {
  it("nets only output-token transfers to the recipient, including a transfer tax", () => {
    expect(
      decodeReceivedAmount(
        {
          ...receipt,
          log: [
            transfer(OTHER, OWNER, 1000n),
            transfer(OWNER, OTHER, 10n),
            transfer(OTHER, OWNER, 9000n, OTHER),
            transfer(OWNER, OWNER, 42n),
          ],
        },
        TOKEN,
        OWNER,
      ),
    ).toBe("990");
  });
  it("reads native proceeds from internal calls without subtracting network fees", () => {
    const call = (from: string, to: string, value: string, rejected = false) => ({
      caller_address: hex(from),
      transferTo_address: hex(to),
      rejected,
      callValueInfo: [{ callValue: value }],
    });
    expect(
      decodeReceivedAmount(
        {
          ...receipt,
          fee: 20000000,
          internal_transactions: [
            call(OTHER, OWNER, "1000000"),
            call(OWNER, OTHER, "10000"),
            call(OTHER, OWNER, "9999999", true),
            {
              ...call(OTHER, OWNER, "555"),
              callValueInfo: [{ callValue: "555", tokenId: "100001" }],
            },
          ],
        },
        NATIVE_TRX_ADDRESS,
        OWNER,
      ),
    ).toBe("990000");
  });
  it("leaves absent, failed, malformed and imprecise evidence unknown", () => {
    for (const info of [
      {},
      receipt,
      { ...receipt, log: [] },
      { receipt: { result: "REVERT" }, log: [transfer(OTHER, OWNER, 1000n)] },
      { ...receipt, log: [{ ...transfer(OTHER, OWNER, 1000n), data: "abc" }] },
    ])
      expect(decodeReceivedAmount(info, TOKEN, OWNER)).toBeUndefined();
    expect(
      decodeReceivedAmount(
        {
          ...receipt,
          internal_transactions: [
            {
              caller_address: hex(OTHER),
              transferTo_address: hex(OWNER),
              callValueInfo: [{ callValue: Number.MAX_SAFE_INTEGER + 1 }],
            },
          ],
        },
        NATIVE_TRX_ADDRESS,
        OWNER,
      ),
    ).toBeUndefined();
  });
});
