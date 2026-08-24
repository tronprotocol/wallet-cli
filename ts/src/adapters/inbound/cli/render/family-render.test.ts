import { describe, it, expect } from "vitest";
import { FAMILY_RENDER, renderFamily } from "./index.js";

describe("FAMILY_RENDER parity", () => {
  it("nativeAmount units", () => {
    expect(FAMILY_RENDER.tron.nativeAmount("1000000", "TRX")).toBe("1 TRX");
  });
  it("feeFallback: tron formats sun→TRX", () => {
    expect(FAMILY_RENDER.tron.feeFallback("1000000", "TRX")).toBe("1 TRX");
  });
  it("addressLabel", () => {
    expect(FAMILY_RENDER.tron.addressLabel).toBe("TRON address");
  });
  it("tron txInfoRows include Energy + Fee in TRX", () => {
    const rows = FAMILY_RENDER.tron.txInfoRows({
      txid: "t",
      status: "SUCCESS",
      feeSun: "1000000",
      energyUsed: 5,
    } as any, "TRX");
    expect(rows).toContainEqual(["Fee", "1 TRX"]);
    expect(rows.map((r) => r[0])).toContain("Energy");
  });
});

describe("FAMILY_RENDER evm", () => {
  it("renders a wei amount in ETH", () => {
    expect(FAMILY_RENDER.evm.nativeAmount("1000000000000000000", "ETH")).toBe("1 ETH");
  });

  it("renders a wei fee fallback in ETH", () => {
    expect(FAMILY_RENDER.evm.feeFallback("21000000000000", "ETH")).toBe("0.000021 ETH");
  });

  it("labels its address column for EVM", () => {
    expect(FAMILY_RENDER.evm.addressLabel).toBe("EVM address");
  });

  // The cross-cutting rule is that EVM reuses TRON's field set and only changes values and
  // units — with the fee as the stated exception, because the unit is IN the field name.
  it("renders gas used and the fee in ETH", () => {
    const rows = FAMILY_RENDER.evm.txInfoRows({
      txid: "0xabc",
      transaction: {},
      status: "confirmed",
      gasUsed: 21_000,
      feeWei: "441000000000000",
    }, "ETH");
    const byLabel = Object.fromEntries(rows);

    expect(byLabel.Gas).toBe("21,000");
    expect(byLabel.Fee).toBe("0.000441 ETH");
  });

  it("leaves the fee row empty rather than printing a zero fee that was never reported", () => {
    const rows = FAMILY_RENDER.evm.txInfoRows({ txid: "0xabc", transaction: {} }, "ETH");
    expect(Object.fromEntries(rows).Fee).toBe("");
  });

  // TxInfoView is a cross-family superset; each family picks only the fields it populates, so
  // the EVM rows must not carry TRON's resource accounting.
  it("omits TRON-only rows from its tx info", () => {
    const labels = FAMILY_RENDER.evm.txInfoRows({ txid: "0xabc", transaction: {}, from: "0xa", to: "0xb", status: "confirmed" }, "ETH")
      .map(([label]) => label);

    expect(labels).not.toContain("Energy");
    expect(labels).toContain("TxID");
  });
});

describe("renderFamily", () => {
  it("reads the family from the resolved network", () => {
    expect(renderFamily({ command: "tx.info", net: { family: "evm", nativeSymbol: "ETH" } as never })).toBe("evm");
  });

  // The old default was "tron". With one family that was unreachable; with two it silently
  // renders wei amounts as TRX — a wrong-currency receipt, which is the worst way to be wrong.
  // Chain commands always resolve a network before rendering, so this really is unreachable;
  // the point is that if it ever happens it must be loud.
  it("refuses to guess when no network was resolved", () => {
    expect(() => renderFamily({ command: "tx.info" })).toThrow();
    expect(() => renderFamily(undefined)).toThrow();
  });
});

// The regression this exists to prevent: FAMILY_RENDER is keyed by FAMILY, so evm:1 and evm:56
// share one hook. With the symbol baked into the hook, 0.5 BNB on BSC rendered as "0.5 ETH".
describe("the native symbol comes from the network, not the family", () => {
  it.each([
    ["evm", "ETH", "0.5 ETH"],
    ["evm", "BNB", "0.5 BNB"],
    ["tron", "TRX", "0.5 TRX"],
  ])("renders %s/%s as %s", (family, symbol, expected) => {
    const raw = family === "tron" ? "500000" : "500000000000000000";
    expect(FAMILY_RENDER[family as "tron" | "evm"].nativeAmount(raw, symbol)).toBe(expected);
  });

  it("labels a fee in the network's own coin", () => {
    expect(FAMILY_RENDER.evm.feeFallback("21000000000000", "BNB")).toBe("0.000021 BNB");
  });

  it("labels the tx-info fee row in the network's own coin", () => {
    const rows = FAMILY_RENDER.evm.txInfoRows(
      { txid: "0xabc", transaction: {}, feeWei: "21000000000000" },
      "BNB",
    );
    expect(Object.fromEntries(rows).Fee).toBe("0.000021 BNB");
  });
});

/**
 * `account info` and `chain prices` — the two commands whose text output was TRON-only.
 *
 * Both were rendered by a single TRON formatter for every family. On EVM that printed
 * "Balance 0 TRX" for an account holding 0.412 ETH, and three empty TRON price labels with none
 * of the EVM fee data. The JSON was correct in both cases, so this is purely the text side.
 */
describe("FAMILY_RENDER accountInfoRows", () => {
  const EVM_ACCOUNT = {
    address: "0xe4aAd11792F7E74f1B5cbce65f9a1E207c952961",
    balance: "412090611420465897",
    nonce: "16",
    decimals: 18,
    symbol: "ETH",
    isContract: false,
  };

  it("states an EVM balance in the network's own coin", () => {
    const rows = FAMILY_RENDER.evm.accountInfoRows(EVM_ACCOUNT, "ETH");

    expect(rows).toContainEqual(["Balance", "0.41209 ETH"]);
    // The exact failure this replaces: a real balance reported as an empty TRON account.
    expect(rows.map((r) => r[1])).not.toContain("0 TRX");
  });

  it("shows the nonce and whether the address holds code", () => {
    const rows = FAMILY_RENDER.evm.accountInfoRows(EVM_ACCOUNT, "ETH");

    expect(rows).toContainEqual(["Nonce", "16"]);
    expect(rows).toContainEqual(["Type", "externally owned"]);
    expect(FAMILY_RENDER.evm.accountInfoRows({ ...EVM_ACCOUNT, isContract: true }, "ETH")).toContainEqual([
      "Type",
      "contract",
    ]);
  });

  it("never shows EVM a permission or resource row", () => {
    const labels = FAMILY_RENDER.evm.accountInfoRows(EVM_ACCOUNT, "ETH").map((r) => r[0]);

    expect(labels).not.toContain("Permissions");
    expect(labels).not.toContain("Energy");
    expect(labels).not.toContain("Bandwidth");
    expect(labels).not.toContain("Staked");
  });

  it("keeps the TRON rows intact", () => {
    const rows = FAMILY_RENDER.tron.accountInfoRows(
      {
        address: "TXP3YPS3mgoHRioz42gMhL6x5VvusPTMk6",
        account: {
          balance: "9000000000",
          owner_permission: { threshold: 1, keys: [{}] },
          active_permission: [{}],
        },
        resources: { energy: { used: 12, limit: 65 }, bandwidth: { used: 6, limit: 15 } },
      },
      "TRX",
    );

    expect(rows).toContainEqual(["Balance", "9,000 TRX"]);
    expect(rows).toContainEqual(["Permissions", "owner 1-of-1, 1 active group"]);
    expect(rows.map((r) => r[0])).toContain("Energy");
  });
});

describe("FAMILY_RENDER chainPricesRows", () => {
  const EVM_PRICES = {
    feeModel: "eip1559",
    baseFeeWei: "959341983",
    priorityFeeWei: "1000000",
    gasPriceWei: "960341983",
  };

  // gwei, not wei: it is the unit --max-fee and --priority-fee accept, and quoting the output in
  // a different unit than the input would leave the reader converting nine zeros by hand.
  it("prices EVM gas in gwei", () => {
    const rows = FAMILY_RENDER.evm.chainPricesRows(EVM_PRICES, "ETH");

    expect(rows).toContainEqual(["Fee model", "eip1559"]);
    expect(rows).toContainEqual(["Base fee", "0.959341 gwei"]);
    expect(rows).toContainEqual(["Gas price", "0.960341 gwei"]);
  });

  // A legacy chain reports no base fee. The row is absent rather than blank — an empty value is
  // what the TRON formatter produced on EVM, and it says nothing.
  it("omits the base fee on a legacy chain instead of printing a blank row", () => {
    const rows = FAMILY_RENDER.evm.chainPricesRows(
      { feeModel: "legacy", gasPriceWei: "5000000000" },
      "ETH",
    );

    expect(rows.map((r) => r[0])).not.toContain("Base fee");
    expect(rows).toContainEqual(["Gas price", "5 gwei"]);
  });

  it("never shows EVM a SUN-denominated row", () => {
    const rendered = FAMILY_RENDER.evm.chainPricesRows(EVM_PRICES, "ETH").flat().join(" ");

    expect(rendered).not.toMatch(/SUN|TRX|Energy|Bandwidth|Memo/);
  });

  it("keeps the TRON rows intact", () => {
    const rows = FAMILY_RENDER.tron.chainPricesRows(
      { energy: { currentSunPerUnit: 100 }, bandwidth: { currentSunPerUnit: 1000 }, memoFeeSun: "1000000" },
      "TRX",
    );

    expect(rows[0]![1]).toContain("100 SUN / unit");
    expect(rows).toContainEqual(["Memo fee", "1 TRX"]);
  });
});
