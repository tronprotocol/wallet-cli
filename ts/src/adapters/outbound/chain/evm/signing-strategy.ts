// Only noble receives the private key; ethers handles hashes and encodings.
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { Transaction, TypedDataEncoder, hashMessage, type TransactionLike } from "ethers";
import type { TypedDataPayload, TypedDataSignature } from "../../../../domain/types/index.js";
import type { SignStrategy } from "../../../../domain/types/index.js";
import { ChainError, UsageError } from "../../../../domain/errors/index.js";

const strip0x = (hex: string): string => (hex.startsWith("0x") ? hex.slice(2) : hex);

// Convert noble's low-s recovery || r || s to Ethereum r || s || v, with v = 27 + recovery.
function signDigest(pkHex: string, digestHex: string): string {
  const recovered = secp256k1.sign(hexToBytes(strip0x(digestHex)), hexToBytes(strip0x(pkHex)), {
    prehash: false,
    format: "recovered",
  });
  const v = (27 + recovered[0]!).toString(16).padStart(2, "0");
  return `0x${bytesToHex(recovered.slice(1))}${v}`;
}

export const evmSignStrategy: SignStrategy = {
  // Return the hash of the signed bytes so callers need not trust the node's transaction ID.
  async sign(pkHex, tx) {
    let transaction: Transaction;
    try {
      transaction = Transaction.from(tx as TransactionLike);
    } catch (e) {
      throw new UsageError(
        "invalid_payload",
        `EVM transaction could not be encoded: ${(e as Error).message}`,
      );
    }
    try {
      transaction.signature = signDigest(pkHex, transaction.unsignedHash);
      return { raw: transaction.serialized, hash: transaction.hash! };
    } catch (e) {
      throw new ChainError("signing_rejected", `EVM sign failed: ${(e as Error).message}`);
    }
  },

  async signMessage(pkHex, message) {
    try {
      return signDigest(pkHex, hashMessage(message));
    } catch (e) {
      throw new ChainError("signing_rejected", `EVM message sign failed: ${(e as Error).message}`);
    }
  },

  async signTypedData(pkHex, payload: TypedDataPayload): Promise<TypedDataSignature> {
    const { domain, types, message } = payload;
    // ethers derives EIP712Domain from domain and rejects a duplicate types entry.
    const structTypes = Object.fromEntries(
      Object.entries(types as Record<string, unknown>).filter(([name]) => name !== "EIP712Domain"),
    ) as Record<string, Array<{ name: string; type: string }>>;
    try {
      const digest = TypedDataEncoder.hash(domain as never, structTypes, message);
      return {
        signature: signDigest(pkHex, digest),
        digest,
        primaryType: payload.primaryType ?? TypedDataEncoder.from(structTypes).primaryType,
      };
    } catch (e) {
      throw new ChainError(
        "signing_rejected",
        `EVM typed-data sign failed: ${(e as Error).message}`,
      );
    }
  },
};
