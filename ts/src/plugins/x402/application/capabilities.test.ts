import { expect, it } from "vitest";
import type { NetworkDescriptor } from "../../../plugin-api/domain.js";
import { X402_SERVE_DEFAULT_TOKEN, x402Capabilities } from "./capabilities.js";

const bsc: NetworkDescriptor = {
  id: "eip155:56",
  family: "evm",
  chainId: "56",
  nativeSymbol: "BNB",
  capabilities: [],
};

it("marks serve as needing inputs where the default token is not registered", () => {
  const asked: string[] = [];
  const serve = (registered: boolean) =>
    x402Capabilities((_network, symbol) => {
      asked.push(symbol);
      return registered;
    })["x402.serve"]!(bsc);
  expect(serve(true)).toBe("supported");
  expect(serve(false)).toBe("needs-inputs");
  expect(asked).toEqual([X402_SERVE_DEFAULT_TOKEN, X402_SERVE_DEFAULT_TOKEN]);
  expect(X402_SERVE_DEFAULT_TOKEN).toBe("USDT");
});
