/**
 * EVM SignStrategy — the concrete signing behaviour SoftwareSigner delegates to for the `evm`
 * family, mirroring `tron/signing-strategy.ts`.
 *
 * The split is deliberate and is the whole reason ethers is a direct dependency:
 *   - **@noble/curves does every operation that touches the private key.** It is the same audited
 *     primitive the TRON path and all key derivation already use, so the key never enters a
 *     larger library.
 *   - **ethers computes digests and encodings only** — EIP-191 prefixing, typed-transaction
 *     serialisation, EIP-712 struct hashing. None of that sees the key, and all of it is the
 *     kind of specification-heavy encoding that is easy to get subtly wrong by hand.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { Transaction, TypedDataEncoder, hashMessage, type TransactionLike } from "ethers";
import type { TypedDataPayload, TypedDataSignature } from "../../../../domain/types/index.js";
import type { SignStrategy } from "../../../../domain/types/index.js";
import { ChainError } from "../../../../domain/errors/index.js";

const strip0x = (hex: string): string => (hex.startsWith("0x") ? hex.slice(2) : hex);

/**
 * Sign a 32-byte digest and return Ethereum's 65-byte `r || s || v` form.
 *
 * noble emits `[recovery, r, s]` and, by default, a canonical low-s signature — which is what
 * Ethereum requires (EIP-2); a high-s signature is a second valid signature for the same message
 * and nodes reject it. `v` is `27 + recovery`.
 */
function signDigest(pkHex: string, digestHex: string): string {
  const recovered = secp256k1.sign(hexToBytes(strip0x(digestHex)), hexToBytes(strip0x(pkHex)), {
    prehash: false,
    format: "recovered",
  });
  const v = (27 + recovered[0]!).toString(16).padStart(2, "0");
  return `0x${bytesToHex(recovered.slice(1))}${v}`;
}

export const evmSignStrategy: SignStrategy = {
  /**
   * Returns `{ raw, hash }`: the serialisation `eth_sendRawTransaction` takes, plus the
   * transaction's own hash.
   *
   * The hash is carried rather than left to the node because it is DERIVABLE from the bytes we
   * just signed — keccak256 of the serialisation — and `authoritativeTxId` exists to prefer a
   * locally derived id over a node's claim about which transaction it accepted. A bare string
   * would carry no id at all, so `--wait` would poll whatever hash the node named. The key is
   * `hash` because `localTxId` already reads `txID ?? hash`, so TRON and EVM need no branch.
   *
   * ethers owns the typed-envelope encoding (legacy / EIP-2930 / EIP-1559) and, for a legacy
   * transaction, folds the chain id into `v` for EIP-155 replay protection.
   */
  async sign(pkHex, tx) {
    let transaction: Transaction;
    try {
      transaction = Transaction.from(tx as TransactionLike);
    } catch (e) {
      throw new ChainError(
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
    // A JSON-RPC eth_signTypedData payload carries EIP712Domain in `types`, but ethers derives
    // the domain separator from `domain` itself and rejects the redundant entry. Dropping it is
    // what lets the wallet accept the payload shape dApps actually send.
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
