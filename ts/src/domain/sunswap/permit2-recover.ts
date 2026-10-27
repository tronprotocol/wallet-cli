import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { publicKeyHash20, tronAddressFromBytes } from "../address/index.js";
import { ChainError } from "../errors/index.js";

// Recover a base58 TRON address from hex digest and r||s||v; v may be 0/1 or 27/28.
export function recoverTronSigner(digest: string, signature: string): string {
  const sig = strip(signature);
  if (sig.length !== 130) {
    throw fault(`a signature of ${sig.length / 2} bytes, not the 65 of r||s||v`);
  }
  const parity = Number.parseInt(sig.slice(128), 16);
  const recovery = parity === 27 || parity === 28 ? parity - 27 : parity;
  if (recovery !== 0 && recovery !== 1) {
    throw fault(`a recovery byte of ${sig.slice(128)}, which is neither a parity nor 27/28`);
  }

  const hash = strip(digest);
  if (hash.length !== 64) {
    throw fault(`a digest of ${hash.length / 2} bytes, not 32`);
  }

  try {
    const point = secp256k1.Signature.fromBytes(hexToBytes(sig.slice(0, 128)))
      .addRecoveryBit(recovery)
      .recoverPublicKey(hexToBytes(hash));
    const hash20 = publicKeyHash20(point.toBytes(false));
    return tronAddressFromBytes(Uint8Array.from([0x41, ...hash20]));
  } catch (error) {
    throw fault(
      `a signature no public key recovers from: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const strip = (hex: string): string => (hex.startsWith("0x") ? hex.slice(2) : hex).toLowerCase();

function fault(because: string): ChainError {
  return new ChainError(
    "signing_rejected",
    `cannot confirm who signed the Permit2 authorization: the signer returned ${because}`,
  );
}
