import { describe, expectTypeOf, it } from "vitest";
import type { EvmUnsignedTx } from "../../../domain/types/index.js";
import type { TronGateway } from "./tron-gateway.js";

describe("TronGateway transaction types", () => {
  it("keep an EVM transaction out of the TRON gateway", () => {
    const evm: EvmUnsignedTx = { to: "0x0", value: "0" };
    const encode = (gateway: TronGateway) =>
      // @ts-expect-error TRON encoding takes only a TRON transaction.
      gateway.encodeTransactionHex(evm);
    expectTypeOf(encode).returns.toBeString();
  });
});
