/**
 * Derivation — BIP39 mnemonic/seed plus BIP44 HD derivation.
 * secp256k1 is shared by both families; only the coin type differs.
 */
import { mnemonicToSeedSync, generateMnemonic, validateMnemonic, mnemonicToEntropy, entropyToMnemonic } from "@scure/bip39";
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

  /** BIP39 mnemonic → 64-byte seed, with optional passphrase. */
  static mnemonicToSeed(mnemonic: string, passphrase?: string): Bytes {
    return mnemonicToSeedSync(mnemonic.trim(), passphrase);
  }

  /** entropy (the value persisted in a vault) ↔ mnemonic. */
  static mnemonicToEntropy(mnemonic: string): Bytes {
    return mnemonicToEntropy(mnemonic.trim(), wordlist);
  }
  static entropyToMnemonic(entropy: Bytes): string {
    return entropyToMnemonic(entropy, wordlist);
  }

  /** m/44'/{coin}'/{account}'/0/0 */
  static path(family: ChainFamily, account: number): string {
    return `m/44'/${FAMILIES[family].coinType}'/${account}'/0/0`;
  }

  /** Derive a keypair from a 64-byte seed at the given BIP44 path. publicKey is uncompressed (65B). */
  static derive(seed: Bytes, path: string): KeyPair {
    const node = HDKey.fromMasterSeed(seed).derive(path);
    if (!node.privateKey) throw new WalletError("encoding_error", `cannot derive private key at ${path}`);
    const privateKey = node.privateKey;
    const publicKey = secp256k1.getPublicKey(privateKey, false); // uncompressed
    return { privateKey, publicKey };
  }

  /** raw private key → uncompressed public key (for privateKey-source wallets). */
  static publicKeyFromPrivate(privateKey: Bytes): Bytes {
    return secp256k1.getPublicKey(privateKey, false);
  }
}
