import { describe, expect, it } from "vitest";
import {
  ChainError,
  errorMessage,
  followUpStep,
  inputRef,
  UsageError,
} from "../../../../domain/errors/index.js";
import {
  cliMessage,
  errorEnvelope,
  exitCodeOf,
  flagFor,
  normalizeCliError,
  FollowUpTable,
} from "./errors.js";
import { GASFREE_FOLLOW_UPS } from "../../../../plugins/gasfree/adapters/inbound/follow-ups.js";
import { assertPositiveAmount } from "../../../../domain/amounts/index.js";
import {
  normalizeTokenId,
  slippageFloor,
  splitPair,
} from "../../../../domain/tron/exchange/index.js";
import { planEvmFee } from "../../../../domain/evm/evm-gas.js";
import { parseChainParameterAssignments } from "../../../../domain/tron/governance/chain-parameters.js";

describe("CLI error projection", () => {
  it("spells input references as flags, including globals with their own names", () => {
    expect(flagFor("permissionId")).toBe("--permission-id");
    expect(flagFor("timeoutMs")).toBe("--timeout");
    expect(flagFor("wait")).toBe("--wait");
  });

  it("renders references in the envelope and the text message", () => {
    const followUps = new FollowUpTable();
    followUps.register(GASFREE_FOLLOW_UPS);
    const error = new UsageError(
      "invalid_option",
      errorMessage`${inputRef("tickSpacing")} is wrong for ${"a\nb"}; see ${followUpStep("gasfree-trace", "t1")}`,
    );
    expect(errorEnvelope(error, followUps)).toEqual({
      code: "invalid_option",
      message: "--tick-spacing is wrong for a\nb; see gasfree trace t1",
    });
    expect(cliMessage(error.userMessage, followUps).textMessage).toBe(
      "--tick-spacing is wrong for a\\nb; see gasfree trace t1",
    );
  });

  it("keeps details and plain messages unchanged", () => {
    expect(errorEnvelope(new UsageError("invalid_value", "x", { a: 1 }))).toEqual({
      code: "invalid_value",
      message: "x",
      details: { a: 1 },
    });
  });

  it("takes the exit code from the code's entry, not from the class it was thrown as", () => {
    expect(exitCodeOf(new UsageError("not_found", "x"))).toBe(1);
    expect(exitCodeOf(new ChainError("family_mismatch", "x"))).toBe(2);
  });

  it("falls back to the class for a code the table marks as either, or an unknown code", () => {
    expect(exitCodeOf(new UsageError("invalid_value", "x"))).toBe(2);
    expect(exitCodeOf(new ChainError("invalid_value", "x"))).toBe(1);
    expect(exitCodeOf(new ChainError("no_such_code", "x"))).toBe(1);
  });

  it("recognizes parser usage text as usage_error (exit 2)", () => {
    const c = normalizeCliError(new Error("Missing required argument: network"));
    expect(c.code).toBe("usage_error");
    expect(exitCodeOf(c)).toBe(2);
  });

  it("delegates everything else to the domain classification", () => {
    const e = new Error("aborted");
    e.name = "AbortError";
    expect(normalizeCliError(e).code).toBe("timeout");
    expect(normalizeCliError(new Error("boom")).code).toBe("internal_error");
  });
});

describe("CLI wording of inner-layer messages", () => {
  function cliText(action: () => unknown): string {
    try {
      action();
    } catch (error) {
      return errorEnvelope(error as UsageError).message;
    }
    throw new Error("expected a CLI error");
  }

  it.each<[string, () => unknown, string]>([
    [
      "exchange slippage",
      () => slippageFloor(1n, 0),
      "--slippage must be greater than 0 and less than 100",
    ],
    [
      "token id",
      () => normalizeTokenId("abc"),
      '"abc" is not a token id — use TRX or a numeric TRC10 id (look one up with `asset info <name>`)',
    ],
    ["pair", () => splitPair("x", inputRef("rawAmounts")), "--raw-amounts must be <a>:<b>"],
    [
      "parameter assignment",
      () => parseChainParameterAssignments(["x"], []),
      "invalid --set 'x'; expected <name|id>=<value>",
    ],
    [
      "legacy fee overrides",
      () => planEvmFee({ gasPriceWei: "1", gasLimit: "21000", overrides: { maxFeeWei: "2" } }),
      "--max-fee and --priority-fee need an EIP-1559 chain; this network prices in gasPrice",
    ],
    [
      "amount",
      () => assertPositiveAmount(0n, inputRef("amount")),
      "--amount must be greater than zero",
    ],
  ])("renders the %s message as before", (_name, action, text) => {
    expect(cliText(action)).toBe(text);
  });

  it("renders fee-plan warnings as the same text", () => {
    const plan = planEvmFee({
      baseFeeWei: "1000000000",
      gasPriceWei: "1100000000",
      suggestedPriorityWei: "1000000",
      gasLimit: "21000",
      overrides: { maxFeeWei: "500000" },
    });
    expect(plan.warnings?.map((warning) => cliMessage(warning).message)).toEqual([
      "--max-fee 500000 wei is below the node's suggested tip of 1000000 wei, so the tip was reduced to match it; a node rejects a tip above the fee cap",
      "--max-fee 500000 wei is below the current base fee of 1000000000 wei; this transaction cannot be included until the base fee falls",
    ]);
  });
});
