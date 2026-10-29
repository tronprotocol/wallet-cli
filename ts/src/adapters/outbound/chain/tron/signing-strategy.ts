import { utils as tronUtils } from "tronweb";
import type {
  SignStrategy,
  TronTransactionArtifact,
  TypedDataPayload,
  TypedDataSignature,
} from "../../../../domain/types/index.js";
import { ChainError } from "../../../../domain/errors/index.js";
import { assertTronTxIntegrity } from "./tx-integrity.js";

// signTransaction takes bare hex; signMessage takes a 0x-prefixed key.
export const tronSignStrategy: SignStrategy = {
  async sign(pkHex, tx) {
    assertTronTxIntegrity(tx);
    return tronUtils.crypto.signTransaction(
      pkHex.slice(2),
      tx as any,
    ) as unknown as TronTransactionArtifact;
  },
  async signMessage(pkHex, message) {
    try {
      return tronUtils.message.signMessage(message, pkHex);
    } catch (e) {
      throw new ChainError("signing_rejected", `TRON message sign failed: ${(e as Error).message}`);
    }
  },
  async signTypedData(pkHex, payload: TypedDataPayload): Promise<TypedDataSignature> {
    const { domain, types, message } = payload;
    try {
      const encoder = tronUtils.typedData.TypedDataEncoder;
      return {
        signature: tronUtils.typedData.signTypedData(domain as any, types as any, message, pkHex),
        digest: encoder.hash(domain as any, types as any, message),
        primaryType: payload.primaryType ?? encoder.from(types as any).primaryType,
      };
    } catch (e) {
      throw new ChainError(
        "signing_rejected",
        `TRON typed-data sign failed: ${(e as Error).message}`,
      );
    }
  },
};
