import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils.js";
import { UsageError } from "../errors/index.js";
import { tronBase58ToBytes, tronBytesToBase58 } from "../address/index.js";

const MIN_INT64 = -(1n << 63n);
const MAX_INT64 = (1n << 63n) - 1n;

export interface TronCreate2Result {
  deployerAddress: string;
  salt: number | string;
  saltHex: string;
  codeHash: string;
  address: string;
}

/** Compute the TVM CREATE2 address with the exact formula used by Java wallet-cli. */
export function computeTronCreate2Address(
  deployerAddress: string,
  creationCode: string,
  decimalSalt: string,
): TronCreate2Result {
  let deployer: Uint8Array;
  try {
    deployer = tronBase58ToBytes(deployerAddress);
  } catch {
    throw new UsageError("invalid_address", `invalid TRON deployer address: ${deployerAddress}`);
  }

  const codeHex = creationCode.replace(/^\s*0x/i, "").replace(/\s+/g, "");
  if (!codeHex || codeHex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(codeHex)) {
    throw new UsageError("invalid_value", "creation bytecode must be non-empty, even-length hex");
  }
  if (!/^-?\d+$/.test(decimalSalt)) {
    throw new UsageError("invalid_value", "salt must be a decimal signed 64-bit integer");
  }
  const salt = BigInt(decimalSalt);
  if (salt < MIN_INT64 || salt > MAX_INT64) {
    throw new UsageError("invalid_value", "salt is outside the signed 64-bit range");
  }

  // Java wallet-cli writes Longs.toByteArray(salt) into bytes 24..31 of a zeroed 32-byte salt.
  const saltBytes = new Uint8Array(32);
  new DataView(saltBytes.buffer).setBigInt64(24, salt, false);
  const codeHashBytes = keccak_256(hexToBytes(codeHex));
  const digest = keccak_256(concatBytes(deployer, saltBytes, codeHashBytes));
  // Hash.sha3omit12 on TRON returns 0x41 || digest[12..31].
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(digest.slice(12), 1);

  const safeSalt =
    salt >= BigInt(Number.MIN_SAFE_INTEGER) && salt <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(salt)
      : salt.toString();
  return {
    deployerAddress,
    salt: safeSalt,
    saltHex: `0x${bytesToHex(saltBytes)}`,
    codeHash: bytesToHex(codeHashBytes),
    address: tronBytesToBase58(payload),
  };
}
