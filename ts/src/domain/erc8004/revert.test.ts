import { expect, it } from "vitest";
import { Interface } from "ethers";
import { agentWriteError } from "./revert.js";

it.each([
  ["error Error(string)", "Error", ["Not authorized"], "not_authorized"],
  ["error ERC721NonexistentToken(uint256)", "ERC721NonexistentToken", ["123"], "agent_not_found"],
  [
    "error ERC721InsufficientApproval(address,uint256)",
    "ERC721InsufficientApproval",
    ["0x1111111111111111111111111111111111111111", "123"],
    "not_authorized",
  ],
  [
    "error ERC721InvalidApprover(address)",
    "ERC721InvalidApprover",
    ["0x1111111111111111111111111111111111111111"],
    "not_authorized",
  ],
])("decodes explicit Agent revert evidence: %s", (abi, name, args, code) => {
  const revertData = new Interface([abi]).encodeErrorResult(name, args);
  expect(agentWriteError({ details: { revertData } })).toMatchObject({ code });
});
it("does not turn unrelated RPC or undecodable failures into authorization failures", () => {
  for (const error of [new Error("timeout"), { details: { revertData: "0x12345678" } }, null])
    expect(agentWriteError(error)).toBe(error);
});
