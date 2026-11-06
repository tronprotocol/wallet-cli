import {
  CommandDeadline,
  requestDispatchCheck,
} from "../../../../application/services/command-deadline.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TronGridHistoryReader } from "./history-reader.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";

const NO_CHECK = requestDispatchCheck(new CommandDeadline(0));

const network = { httpEndpoint: "https://grid.invalid" } as NetworkDescriptor;
const OWNER = "TMqNJwD3qVmuRxzzP3Q4A24fuByVBKQ39E";

afterEach(() => vi.unstubAllGlobals());

const transfer = (ret?: Array<{ contractRet?: string }>) => ({
  txID: "tx",
  block_timestamp: 1700000000000,
  raw_data: {
    contract: [
      { type: "TransferContract", parameter: { value: { owner_address: OWNER, amount: 1 } } },
    ],
  },
  ...(ret === undefined ? {} : { ret }),
});

describe("TronGridHistoryReader status", () => {
  it("reports unknown, not ok, when the record carries no execution result", async () => {
    const data = [
      transfer([{ contractRet: "SUCCESS" }]),
      transfer([{ contractRet: "REVERT" }]),
      transfer(),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ data }) })),
    );

    const result = await new TronGridHistoryReader().get(network, OWNER, { limit: 3 }, NO_CHECK);

    expect(result.records.map((record) => record.status)).toEqual(["ok", "failed", "unknown"]);
  });
});
