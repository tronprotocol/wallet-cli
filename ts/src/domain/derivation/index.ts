import {
  mnemonicToSeedSync,
  generateMnemonic,
  validateMnemonic,
  mnemonicToEntropy,
  entropyToMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { HDKey } from "@scure/bip32";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import type { Bytes, ChainFamily, KeyPair } from "../types/index.js";
import { FAMILIES } from "../family/index.js";
import { WalletError } from "../errors/index.js";

export class Derivation {
  static generateMnemonic(strength = 128): string {
    return generateMnemonic(wordlist, strength);
  }

  static validateMnemonic(mnemonic: string): boolean {
    return validateMnemonic(mnemonic.trim(), wordlist);
  }

  // Returns a 64-byte BIP39 seed.
  static mnemonicToSeed(mnemonic: string, passphrase?: string): Bytes {
    return mnemonicToSeedSync(mnemonic.trim(), passphrase);
  }

  static mnemonicToEntropy(mnemonic: string): Bytes {
    return mnemonicToEntropy(mnemonic.trim(), wordlist);
  }
  static entropyToMnemonic(entropy: Bytes): string {
    return entropyToMnemonic(entropy, wordlist);
  }

  // Software wallets increment address_index for default restore compatibility.
  static path(family: ChainFamily, index: number): string {
    return `m/44'/${FAMILIES[family].coinType}'/0'/0/${index}`;
  }

  // Ledger Live increments the hardened account index.
  static ledgerPath(family: ChainFamily, index: number): string {
    return `m/44'/${FAMILIES[family].coinType}'/${index}'/0/0`;
  }

  // Alternate account-level TRON path for identifying imported accounts.
  static legacyPaths(family: ChainFamily, index: number): string[] {
    if (family !== "tron" || index === 0) return [];
    return [`m/44'/195'/${index}'/0/0`];
  }

  // Accepts a 64-byte seed; returns a 65-byte uncompressed public key.
  static derive(seed: Bytes, path: string): KeyPair {
    const node = HDKey.fromMasterSeed(seed).derive(path);
    if (!node.privateKey)
      throw new WalletError("encoding_error", `cannot derive private key at ${path}`);
    const privateKey = node.privateKey;
    const publicKey = secp256k1.getPublicKey(privateKey, false);
    return { privateKey, publicKey };
  }

  // Returns a 65-byte uncompressed public key.
  static publicKeyFromPrivate(privateKey: Bytes): Bytes {
    return secp256k1.getPublicKey(privateKey, false);
  }

  // Checks for a 32-byte secp256k1 scalar in [1, n-1].
  static isValidPrivateKey(privateKey: Bytes): boolean {
    return secp256k1.utils.isValidSecretKey(privateKey);
  }
}
