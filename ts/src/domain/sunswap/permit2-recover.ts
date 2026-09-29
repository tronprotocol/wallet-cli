/**
 * Who signed a digest.
 *
 * The Permit2 guard's last check is that the finished signature belongs to the account we are
 * trading for, and that cannot be taken from the signer's own claim about itself: the point is to
 * catch a signer that used a different key than the account names. So the address is derived from
 * the signature, with the same audited primitive every other key operation in this CLI uses.
 *
 * Pure: a digest and a signature in, an address out. No I/O, no wallet, nothing to mock.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { publicKeyHash20, tronAddressFromBytes } from "../address/index.js";
import { ChainError } from "../errors/index.js";

/**
 * The TRON address that produced `signature` over `digest`.
 *
 * `signature` is Ethereum's 65-byte `r || s || v`, which is what both our software strategy and
 * the Ledger path emit. `v` is accepted as 27/28 or as a bare parity of 0/1 — the device reports
 * parity and ethers reports 27/28, and rejecting either form would only mean the check gets
 * skipped on one signer.
 */
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
    // A TRON address is keccak(x||y)'s last 20 bytes behind the 0x41 prefix — the same derivation
    // every account in this CLI already uses, reached through the same helpers.
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
