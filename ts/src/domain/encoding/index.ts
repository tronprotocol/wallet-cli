import { createBase58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import {
  evmAddressFromPublicKey,
  evmChecksumAddress,
  publicKeyHash20,
  TronAddress,
  tronAddressBytes,
  tronAddressFromBytes,
} from "../address/index.js";
import { UsageError } from "../errors/index.js";

const base58check = createBase58check(sha256);
const tron = new TronAddress();

export type EncodingConversion =
  | {
      input: string;
      inputType: "tron-base58" | "tron-hex" | "evm" | "public-key";
      valid: true;
      tron: string;
      tronHex: string;
      evm: string;
    }
  | {
      input: string;
      inputType: "hex" | "base64" | "base58check";
      valid: true;
      hex: string;
      base64: string;
      base58check: string;
    };

export function convertEncoding(input: string): EncodingConversion {
  const value = input.trim();
  if (!value || /[\p{Cc}\p{Cf}\s]/u.test(value)) {
    throw invalid(
      "input is empty or contains unsafe whitespace/control characters",
    );
  }

  if (/^T[1-9A-HJ-NP-Za-km-z]{25,40}$/.test(value)) {
    if (!tron.validate(value)) {
      throw invalid("base58 checksum mismatch (typo in the address?)");
    }
    return addressView(
      value,
      "tron-base58",
      tronAddressBytes(value).slice(1),
    );
  }
  if (/^(?:0x)?41[0-9a-fA-F]{40}$/.test(value)) {
    const raw = hexToBytes(value.replace(/^0x/, ""));
    return addressView(value, "tron-hex", raw.slice(1));
  }
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) {
    const payload = hexToBytes(value.slice(2));
    const checksum = evmChecksumAddress(payload);
    if (
      /[a-f]/.test(value)
      && /[A-F]/.test(value)
      && value !== checksum
    ) {
      throw invalid("EVM EIP-55 checksum mismatch");
    }
    return addressView(value, "evm", payload);
  }
  if (
    /^(?:02|03)[0-9a-fA-F]{64}$/.test(value)
    || /^04[0-9a-fA-F]{128}$/.test(value)
  ) {
    const publicKey = hexToBytes(value);
    try {
      const payload = publicKeyHash20(publicKey);
      return {
        input: value,
        inputType: "public-key",
        valid: true,
        tron: tron.fromPublicKey(publicKey),
        tronHex: `41${bytesToHex(payload)}`,
        evm: evmAddressFromPublicKey(publicKey),
      };
    } catch {
      throw invalid("public key is not a valid secp256k1 point");
    }
  }

  let bytes: Uint8Array;
  let inputType: "hex" | "base64" | "base58check";
  if (/^(?:0x)?[0-9a-fA-F]+$/.test(value)) {
    const hex = value.replace(/^0x/, "");
    if (hex.length % 2 !== 0) {
      throw invalid("hex input must contain complete bytes");
    }
    bytes = hexToBytes(hex);
    inputType = "hex";
  } else {
    try {
      bytes = base58check.decode(value);
      inputType = "base58check";
    } catch {
      if (!isCanonicalBase64(value)) {
        throw invalid(
          "input is not valid hex, Base64, or Base58Check",
        );
      }
      bytes = Uint8Array.from(Buffer.from(value, "base64"));
      inputType = "base64";
    }
  }
  if (bytes.length === 32) {
    throw invalid(
      "32-byte input may be a private key and is not accepted on argv",
    );
  }
  if (bytes.length === 0 || bytes.length > 1024 * 1024) {
    throw invalid("decoded input must contain 1 byte to 1 MiB");
  }
  return {
    input: value,
    inputType,
    valid: true,
    hex: bytesToHex(bytes),
    base64: Buffer.from(bytes).toString("base64"),
    base58check: base58check.encode(bytes),
  };
}

function addressView(
  input: string,
  inputType: "tron-base58" | "tron-hex" | "evm",
  payload: Uint8Array,
): EncodingConversion {
  const prefixed = new Uint8Array(21);
  prefixed[0] = 0x41;
  prefixed.set(payload, 1);
  return {
    input,
    inputType,
    valid: true,
    tron: tronAddressFromBytes(prefixed),
    tronHex: bytesToHex(prefixed),
    evm: evmChecksumAddress(payload),
  };
}

function isCanonicalBase64(value: string): boolean {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    return false;
  }
  return Buffer.from(value, "base64").toString("base64") === value;
}

function invalid(reason: string): UsageError {
  return new UsageError("invalid_value", reason);
}
