import { Derivation } from "../../../../../domain/derivation/index.js";

export function isValidPrivateKeyHex(s: string): boolean {
  return /^(0x)?[0-9a-fA-F]{64}$/.test(s.trim());
}

export function isValidMnemonic(s: string): boolean {
  return Derivation.validateMnemonic(s);
}
