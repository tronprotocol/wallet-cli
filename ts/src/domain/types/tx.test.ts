import { describe, expectTypeOf, it } from "vitest";
import type {
  EvmFeeReport,
  EvmSignedTx,
  EvmUnsignedTx,
  FeeReport,
  SignedTx,
  SignedTxOf,
  TronFeeReport,
  TronTransactionArtifact,
  UnsignedTx,
} from "./tx.js";

describe("transaction types", () => {
  it("are one closed type per family", () => {
    expectTypeOf<UnsignedTx>().toEqualTypeOf<TronTransactionArtifact | EvmUnsignedTx>();
    expectTypeOf<SignedTx>().toEqualTypeOf<TronTransactionArtifact | EvmSignedTx>();
    expectTypeOf<FeeReport>().toEqualTypeOf<TronFeeReport | EvmFeeReport>();
  });

  it("map an unsigned transaction to the signed form of its own family", () => {
    expectTypeOf<SignedTxOf<TronTransactionArtifact>>().toEqualTypeOf<TronTransactionArtifact>();
    expectTypeOf<SignedTxOf<EvmUnsignedTx>>().toEqualTypeOf<EvmSignedTx>();
  });
});
