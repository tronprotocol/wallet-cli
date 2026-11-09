import { createBase58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import {
  addressBodyLength,
  addressCodec,
  addressShape,
  evmChecksumAddress,
  isEvmAddress,
  publicKeyHash20,
  tronAddressFromHash20,
  tronHash20Hex,
  tronHexFromHash20,
} from "../family/index.js";
import { UsageError } from "../errors/index.js";

const base58check = createBase58check(sha256);
const tron = addressCodec("tron");
const evm = addressCodec("evm");

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
    throw invalid("input is empty or contains unsafe whitespace/control characters");
  }

  const tronBodyLength = addressBodyLength("tron", value);
  if (tronBodyLength !== undefined && tronBodyLength >= 25 && tronBodyLength <= 40) {
    if (!tron.validate(value)) {
      throw invalid("base58 checksum mismatch (typo in the address?)");
    }
    return addressView(value, "tron-base58", hexToBytes(tronHash20Hex(value)));
  }
  const shape = addressShape(value);
  if (shape === "tron-hex") {
    return addressView(value, "tron-hex", hexToBytes(tronHash20Hex(value)));
  }
  if (shape === "evm") {
    if (!isEvmAddress(value)) {
      throw invalid("EVM EIP-55 checksum mismatch");
    }
    return addressView(value, "evm", hexToBytes(value.slice(2)));
  }
  if (/^(?:02|03)[0-9a-fA-F]{64}$/.test(value) || /^04[0-9a-fA-F]{128}$/.test(value)) {
    const publicKey = hexToBytes(value);
    try {
      const payload = publicKeyHash20(publicKey);
      return {
        input: value,
        inputType: "public-key",
        valid: true,
        tron: tron.fromPublicKey(publicKey),
        tronHex: tronHexFromHash20(bytesToHex(payload)),
        evm: evm.fromPublicKey(publicKey),
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
        throw invalid("input is not valid hex, Base64, or Base58Check");
      }
      bytes = Uint8Array.from(Buffer.from(value, "base64"));
      inputType = "base64";
    }
  }
  if (bytes.length === 32) {
    throw invalid("32-byte input may be a private key and is not accepted on argv");
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
  return {
    input,
    inputType,
    valid: true,
    tron: tronAddressFromHash20(payload),
    tronHex: tronHexFromHash20(bytesToHex(payload)),
    evm: evmChecksumAddress(payload),
  };
}

function isCanonicalBase64(value: string): boolean {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return false;
  }
  return Buffer.from(value, "base64").toString("base64") === value;
}

function invalid(reason: string): UsageError {
  return new UsageError("invalid_value", reason);
}
