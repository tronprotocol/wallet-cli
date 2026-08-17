import { describe, expect, it } from "vitest";
import { classifyNodeRejection } from "./node-errors.js";

describe("node rejection classification", () => {
  it("names the three rejections we can be sure of", () => {
    expect(classifyNodeRejection("Not precise enough")?.code).toBe("precision_loss");
    expect(
      classifyNodeRejection(
        "Validate InternalTransfer error, token required must greater than expected",
      )?.code,
    ).toBe("slippage_exceeded");
    expect(classifyNodeRejection("ExchangeTransactionContract is rejected")?.code).toBe(
      "exchange_trading_disabled",
    );
  });

  it("sees through java-tron's envelope, which is what actually reaches the wire", () => {
    // captured verbatim from a Nile node on 2026-08-09
    expect(
      classifyNodeRejection("Contract validate error : ExchangeTransactionContract is rejected")
        ?.code,
    ).toBe("exchange_trading_disabled");
    expect(classifyNodeRejection("Contract validate error : Not precise enough")?.code).toBe(
      "precision_loss",
    );
  });

  it("tolerates the surrounding whitespace a node message arrives with", () => {
    expect(classifyNodeRejection("  Not precise enough  ")?.code).toBe("precision_loss");
  });

  it("falls through for anything else, rather than guessing", () => {
    for (const message of [
      "balance is not sufficient",
      "Contract validate error : account does not exist",
      "exchange balance is not enough",
      "",
      "precise",
    ]) {
      expect(classifyNodeRejection(message), message).toBeUndefined();
    }
  });

  it("does not match a longer message that merely contains a rule's text", () => {
    // anchored rules must not fire on a message that embeds their wording in a different claim
    expect(
      classifyNodeRejection("Not precise enough for the withdrawal, but proceeding"),
    ).toBeUndefined();
    expect(
      classifyNodeRejection("ExchangeTransactionContract is rejected by the local policy engine"),
    ).toBeUndefined();
  });
});
