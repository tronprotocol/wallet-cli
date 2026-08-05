import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils.js";
import type {
  Bytes,
  GasFreeAuthorization,
  TypedDataPayload,
} from "../types/index.js";
import { TronAddress, tronAddressBytes } from "../address/index.js";

export const GASFREE_DOMAIN_TYPE =
  "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";
export const GASFREE_PERMIT_TYPE =
  "PermitTransfer(address token,address serviceProvider,address user,address receiver,uint256 value,uint256 maxFee,uint256 deadline,uint256 version,uint256 nonce)";
export const GASFREE_DOMAIN_NAME = "GasFreeController";
export const GASFREE_DOMAIN_VERSION = "V1.0.0";

const UTF8 = new TextEncoder();

function uint256Word(value: string, field: string): Bytes {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${field} must be an unsigned decimal integer`);
  }
  const integer = BigInt(value);
  if (integer >= 1n << 256n) throw new Error(`${field} exceeds uint256`);
  return hexToBytes(integer.toString(16).padStart(64, "0"));
}

function addressWord(address: string): Bytes {
  const decoded = tronAddressBytes(address);
  const result = new Uint8Array(32);
  result.set(decoded.slice(1), 12);
  return result;
}

export interface GasFreeDomainInput {
  controllerChainId: string;
  verifyingContract: string;
}

/** Java GasFreeApi.getDomainSeparator byte-for-byte equivalent. */
export function gasFreeDomainSeparator(domain: GasFreeDomainInput): Bytes {
  return keccak_256(concatBytes(
    keccak_256(UTF8.encode(GASFREE_DOMAIN_TYPE)),
    keccak_256(UTF8.encode(GASFREE_DOMAIN_NAME)),
    keccak_256(UTF8.encode(GASFREE_DOMAIN_VERSION)),
    uint256Word(domain.controllerChainId, "controllerChainId"),
    addressWord(domain.verifyingContract),
  ));
}

/** Java GasFreeApi.buildMessage byte-for-byte equivalent. */
export function gasFreeMessageHash(authorization: GasFreeAuthorization): Bytes {
  return keccak_256(concatBytes(
    keccak_256(UTF8.encode(GASFREE_PERMIT_TYPE)),
    addressWord(authorization.token),
    addressWord(authorization.serviceProvider),
    addressWord(authorization.user),
    addressWord(authorization.receiver),
    uint256Word(authorization.value, "value"),
    uint256Word(authorization.maxFee, "maxFee"),
    uint256Word(authorization.deadline, "deadline"),
    uint256Word(authorization.version, "version"),
    uint256Word(authorization.nonce, "nonce"),
  ));
}

/** keccak256(0x1901 || domainSeparator || messageHash), matching Java signOffChain input. */
export function gasFreeDigest(
  domain: GasFreeDomainInput,
  authorization: GasFreeAuthorization,
): Bytes {
  return keccak_256(concatBytes(
    Uint8Array.of(0x19, 0x01),
    gasFreeDomainSeparator(domain),
    gasFreeMessageHash(authorization),
  ));
}

/** Build the exact TIP-712 payload used by software and Ledger signers. */
export function gasFreeTypedData(
  domain: GasFreeDomainInput,
  authorization: GasFreeAuthorization,
): TypedDataPayload {
  return {
    domain: {
      name: GASFREE_DOMAIN_NAME,
      version: GASFREE_DOMAIN_VERSION,
      chainId: domain.controllerChainId,
      verifyingContract: domain.verifyingContract,
    },
    types: {
      PermitTransfer: [
        { name: "token", type: "address" },
        { name: "serviceProvider", type: "address" },
        { name: "user", type: "address" },
        { name: "receiver", type: "address" },
        { name: "value", type: "uint256" },
        { name: "maxFee", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "version", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "PermitTransfer",
    message: { ...authorization },
  };
}

/** Validate low-s r||s||v and return Java-compatible lowercase hex without 0x. */
export function normalizeGasFreeSignature(signatureHex: string): string {
  const normalized = signatureHex.replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{130}$/.test(normalized)) {
    throw new Error("GasFree signature must be 65-byte hexadecimal r || s || v");
  }
  const raw = hexToBytes(normalized);
  const v = raw[64]!;
  const recovery = v >= 27 ? v - 27 : v;
  if (recovery !== 0 && recovery !== 1) {
    throw new Error("GasFree signature recovery id must be 0/1 or 27/28");
  }
  const signature = secp256k1.Signature.fromBytes(raw.slice(0, 64), "compact");
  if (signature.hasHighS()) throw new Error("GasFree signature must use low-s form");
  raw[64] = recovery + 27;
  return bytesToHex(raw);
}

export function recoverGasFreeSigner(digest: Bytes, signatureHex: string): string {
  if (digest.length !== 32) throw new Error("GasFree digest must be 32 bytes");
  const canonical = hexToBytes(normalizeGasFreeSignature(signatureHex));
  const recovery = canonical[64]! - 27;
  const recoveredSignature = concatBytes(
    Uint8Array.of(recovery),
    canonical.slice(0, 64),
  );
  const compressed = secp256k1.recoverPublicKey(recoveredSignature, digest, { prehash: false });
  const uncompressed = secp256k1.Point.fromBytes(compressed).toBytes(false);
  return new TronAddress().fromPublicKey(uncompressed);
}
