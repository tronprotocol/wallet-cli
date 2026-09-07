import { expect, it } from "vitest";
import { TxFormatters } from "./tx.js";
const ctx = { net: { id: "eip155:56", family: "evm", nativeSymbol: "BNB" } } as never;

it("renders Agent approval as an operator and ID without an allowance", () => {
  const rendered = TxFormatters.txReceipt(
    {
      kind: "contract-send",
      stage: "submitted",
      txId: "0xabc",
      agentId: "9007199254740993",
      operator: "0x2222222222222222222222222222222222222222",
    },
    ctx,
  );
  expect(rendered).toContain("9007199254740993");
  expect(rendered).toContain("Operator");
  expect(rendered).not.toContain("Allowance");
});
it("shows URI and owner results only when supplied by the confirmed service result", () => {
  const rendered = TxFormatters.txReceipt(
    {
      kind: "contract-send",
      stage: "confirmed",
      txId: "0xabc",
      oldURI: "ipfs://old",
      newURI: "ipfs://actual",
      requestedURI: "ipfs://requested",
      oldOwner: "0x1111",
      newOwner: "0x2222",
    },
    ctx,
  );
  expect(rendered).toContain("ipfs://actual");
  expect(rendered).toContain("ipfs://requested");
  expect(rendered).toContain("0x1111");
  expect(rendered).toContain("0x2222");
});
