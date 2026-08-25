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
    const rows = FAMILY_RENDER.tron.txInfoRows(
      {
        txid: "t",
        status: "SUCCESS",
        feeSun: "1000000",
        energyUsed: 5,
      } as any,
      "TRX",
    );
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
    const rows = FAMILY_RENDER.evm.txInfoRows(
      {
        txid: "0xabc",
        transaction: {},
        status: "confirmed",
        gasUsed: 21_000,
        feeWei: "441000000000000",
      },
      "ETH",
    );
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
    const labels = FAMILY_RENDER.evm
      .txInfoRows(
        { txid: "0xabc", transaction: {}, from: "0xa", to: "0xb", status: "confirmed" },
        "ETH",
      )
      .map(([label]) => label);

    expect(labels).not.toContain("Energy");
    expect(labels).toContain("TxID");
  });
});

describe("renderFamily", () => {
  it("reads the family from the resolved network", () => {
    expect(
      renderFamily({ command: "tx.info", net: { family: "evm", nativeSymbol: "ETH" } as never }),
    ).toBe("evm");
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
    // Uppercase `EOA` — the standard name, and the text twin of json's `eoa` (§4.3).
    expect(rows).toContainEqual(["Type", "EOA"]);
    expect(
      FAMILY_RENDER.evm.accountInfoRows({ ...EVM_ACCOUNT, type: "contract" }, "ETH"),
    ).toContainEqual(["Type", "contract"]);
  });

  // §4.3 gives a contract its code size and an EOA none: an EOA is not a contract with zero
  // bytes, and a row reading "0 bytes" would say it is.
  it("sizes a contract's code and leaves the row off an EOA", () => {
    expect(
      FAMILY_RENDER.evm.accountInfoRows(
        { ...EVM_ACCOUNT, type: "contract", codeSize: 3124 },
        "ETH",
      ),
    ).toContainEqual(["Code size", "3,124 bytes"]);
    expect(FAMILY_RENDER.evm.accountInfoRows(EVM_ACCOUNT, "ETH").map((r) => r[0])).not.toContain(
      "Code size",
    );
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
      {
        energy: { currentSunPerUnit: 100 },
        bandwidth: { currentSunPerUnit: 1000 },
        memoFeeSun: "1000000",
      },
      "TRX",
    );

    expect(rows[0]![1]).toContain("100 SUN / unit");
    expect(rows).toContainEqual(["Memo fee", "1 TRX"]);
  });
});

/**
 * The rows this release was missing: what a transaction cost, how deep it is, and what a block or
 * a node actually reports. All four were in the JSON already — only the text layer read TRON's
 * fields and so printed nothing (or nothing useful) on EVM.
 */
describe("FAMILY_RENDER — receipt settlement rows", () => {
  it("states the EVM fee AND what it is the product of", () => {
    const rows = FAMILY_RENDER.evm.receiptSettlementRows(
      {
        kind: "send",
        feeWei: "441000000000000",
        gasUsed: 21000,
        effectiveGasPriceWei: "21000000000",
      } as never,
      "ETH",
    );

    expect(rows).toEqual([["Fee", "0.000441 ETH  (21,000 gas × 21 gwei)"]]);
  });

  // A receipt from a node that omitted effectiveGasPrice still has to state the total: the fee was
  // paid whether or not its breakdown came back.
  it("falls back to the bare total when the breakdown is missing", () => {
    const rows = FAMILY_RENDER.evm.receiptSettlementRows(
      { kind: "send", feeWei: "441000000000000" } as never,
      "ETH",
    );

    expect(rows).toEqual([["Fee", "0.000441 ETH"]]);
  });

  it("keeps TRON's energy + SUN fee pair unchanged", () => {
    const rows = FAMILY_RENDER.tron.receiptSettlementRows(
      { kind: "send", energyUsed: 345, feeSun: "1100000" } as never,
      "TRX",
    );

    expect(rows).toEqual([
      ["Energy", "345"],
      ["Fee", "1.1 TRX"],
    ]);
  });

  // §4.3 calls the nonce the entry point for diagnosing a stuck transaction — the case where no
  // receipt ever arrives — so it is a receipt row, not a confirmation one.
  it("gives EVM receipts a Nonce row and TRON none", () => {
    expect(FAMILY_RENDER.evm.receiptIdentityRows({ kind: "send", nonce: 42 } as never)).toEqual([
      ["Nonce", "42"],
    ]);
    expect(FAMILY_RENDER.tron.receiptIdentityRows({ kind: "send" } as never)).toEqual([]);
  });
});

describe("FAMILY_RENDER — chain node rows", () => {
  const EVM_NODE = {
    endpoint: "node.example",
    version: "Geth/v1.14.0",
    chainId: "11155111",
    headBlock: { number: 11204149, timestamp: 1722925264000 },
    solidBlock: { number: 11204100 },
    lagBlocks: 49,
    inSync: true,
    peers: null,
  };

  it("reports the node's chain id and sync state on EVM", () => {
    const rows = FAMILY_RENDER.evm.chainNodeRows(EVM_NODE as never);
    const labels = rows.map((r) => r[0]);

    expect(rows).toContainEqual(["Chain id", "11155111"]);
    expect(rows).toContainEqual(["Syncing", "no"]);
    expect(labels).toEqual([
      "Endpoint",
      "Version",
      "Chain id",
      "Head block",
      "Solid block",
      "Syncing",
      "Peers",
    ]);
  });

  // "the node would not say" is not the same claim as "it is behind".
  it("dashes the sync row when the node did not answer eth_syncing", () => {
    const rows = FAMILY_RENDER.evm.chainNodeRows({ ...EVM_NODE, inSync: null } as never);
    expect(rows).toContainEqual(["Syncing", "—"]);
  });

  it("leaves TRON's node rows exactly as they were", () => {
    const rows = FAMILY_RENDER.tron.chainNodeRows({
      endpoint: "nile.trongrid.io",
      version: "java-tron 4.7.7",
      headBlock: { number: 84120345, timestamp: 1722925264000 },
      solidBlock: { number: 84120326 },
      lagBlocks: 19,
      inSync: true,
      peers: { connected: 30, active: 27 },
    } as never);

    expect(rows.map((r) => r[0])).toEqual([
      "Endpoint",
      "Version",
      "Head block",
      "Solid block",
      "Peers",
    ]);
    expect(rows).toContainEqual(["Peers", "30 connected / 27 active"]);
  });
});
