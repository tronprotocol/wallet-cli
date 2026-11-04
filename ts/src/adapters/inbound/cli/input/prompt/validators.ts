import { Derivation } from "../../../../../domain/derivation/index.js";

export function isValidPrivateKeyHex(s: string): boolean {
  const match = /^(?:0x)?([0-9a-fA-F]{64})$/.exec(s.trim());
  return match !== null && Derivation.isValidPrivateKey(Buffer.from(match[1]!, "hex"));
}

export function isValidMnemonic(s: string): boolean {
  return Derivation.validateMnemonic(s);
}
