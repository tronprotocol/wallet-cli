import { describe, expect, it } from "vitest";
import {
  ChainError,
  errorMessage,
  followUp,
  inputRef,
  UsageError,
} from "../../../../domain/errors/index.js";
import { cliMessage, errorEnvelope, exitCodeOf, flagFor, normalizeCliError } from "./errors.js";
import { assertPositiveAmount } from "../../../../domain/amounts/index.js";
import { resolveAgentId } from "../../../../domain/erc8004/index.js";
import {
  normalizeTokenId,
  slippageFloor,
  splitPair,
} from "../../../../domain/tron/exchange/index.js";
import { planEvmFee } from "../../../../domain/evm/evm-gas.js";
import { parseChainParameterAssignments } from "../../../../domain/tron/governance/chain-parameters.js";
import { selectFloor, slippageToBips } from "../../../../domain/sunpump/curve.js";
import { sunpumpSortParam } from "../../../../domain/sunpump/market.js";
import { parseMinTvl } from "../../../../domain/sunswap/min-tvl.js";
import {
  offsetWindowToPage,
  refuseBeyondMarketWindow,
} from "../../../../domain/sunswap/pagination.js";
import { normaliseProtocol } from "../../../../domain/sunswap/protocol.js";
import { poolSortField } from "../../../../domain/sunswap/sort.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";

describe("CLI error projection", () => {
  it("spells input references as flags, including globals with their own names", () => {
    expect(flagFor("permissionId")).toBe("--permission-id");
    expect(flagFor("waitTimeoutMs")).toBe("--wait-timeout");
    expect(flagFor("timeoutMs")).toBe("--timeout");
    expect(flagFor("wait")).toBe("--wait");
  });

  it("renders references in the envelope and the text message", () => {
    const error = new UsageError(
      "invalid_option",
      errorMessage`${inputRef("tickSpacing")} is wrong for ${"a\nb"}; see ${followUp("gasfree-trace", "t1")}`,
    );
    expect(errorEnvelope(error)).toEqual({
      code: "invalid_option",
      message: "--tick-spacing is wrong for a\nb; see gasfree trace t1",
    });
    expect(cliMessage(error.userMessage).textMessage).toBe(
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

  const TRON = { id: "tron:728126428" } as NetworkDescriptor;

  it.each<[string, () => unknown, string]>([
    [
      "page alignment",
      () => offsetWindowToPage({ offset: 5, limit: 4 }),
      "--offset must be a multiple of --limit (4); this service pages by whole pages",
    ],
    [
      "market window",
      () => refuseBeyondMarketWindow({ offset: 1000, limit: 20 }),
      "--offset + --limit may not exceed 1000; the data service exposes only the first 1000 rows of each ordering",
    ],
    ["protocol", () => normaliseProtocol("v9", ["V3", "V4"]), "--protocol must be one of V3, V4"],
    [
      "min TVL",
      () => parseMinTvl("abc"),
      '--min-tvl must be a non-negative decimal amount in USD, such as 100000 (got: "abc")',
    ],
    [
      "pool order",
      () => poolSortField("nope"),
      "--order-by must be one of tvl, volume-24h, fees-24h, apr",
    ],
    ["sort", () => sunpumpSortParam("created", "up"), "--sort must be one of asc, desc"],
    [
      "competing floors",
      () => selectFloor("0.05", "1"),
      "choose at most one of --slippage and --min-out",
    ],
    ["slippage range", () => slippageToBips("0.9"), "--slippage must be between 0.0001 and 0.5"],
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
      "agent id",
      () => resolveAgentId("tron:abc:1", TRON),
      "Agent ID prefixes require a numeric chain ID (for example tron:3448148188:170); use --network for aliases",
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
