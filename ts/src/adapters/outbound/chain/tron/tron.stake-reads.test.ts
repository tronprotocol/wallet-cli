import { describe, expect, it, vi } from "vitest";
import { TronRpcClient } from "./tron.js";
import { withTronWeb } from "./__test-support__/tronweb.js";

const OWNER = "TMqNJwD3qVmuRxzzP3Q4A24fuByVBKQ39E";
const RECEIVER = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

describe("TronRpcClient stake reads", () => {
  it.each([
    [
      "getDelegatedResourceV2",
      "wallet/getdelegatedresourcev2",
      (c: TronRpcClient) => c.getDelegatedResourceV2(OWNER, RECEIVER),
    ],
    [
      "getDelegatedIndexV2",
      "wallet/getdelegatedresourceaccountindexv2",
      (c: TronRpcClient) => c.getDelegatedIndexV2(OWNER),
    ],
    [
      "getCanDelegatedMaxSize",
      "wallet/getcandelegatedmaxsize",
      (c: TronRpcClient) => c.getCanDelegatedMaxSize(OWNER, "ENERGY"),
    ],
    [
      "getCanWithdrawUnfreezeAmount",
      "wallet/getcanwithdrawunfreezeamount",
      (c: TronRpcClient) => c.getCanWithdrawUnfreezeAmount(OWNER),
    ],
    [
      "getAvailableUnfreezeCount",
      "wallet/getavailableunfreezecount",
      (c: TronRpcClient) => c.getAvailableUnfreezeCount(OWNER),
    ],
  ])("%s reads the latest state from the full node", async (_name, path, read) => {
    const { client, tronweb } = withTronWeb(() => new TronRpcClient("https://node.invalid"));
    const full = vi.spyOn(tronweb.fullNode, "request").mockResolvedValue({});
    const solidity = vi.spyOn(tronweb.solidityNode, "request").mockResolvedValue({});

    await read(client);

    expect(full).toHaveBeenCalledWith(path, expect.anything(), "post");
    expect(solidity).not.toHaveBeenCalled();
  });
});
