/**
 * Derivation — BIP39 mnemonic/seed plus BIP44 HD derivation.
 * secp256k1 is shared by both families; only the coin type differs.
 */
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

  /**
   * The software derivation template: `m/44'/<coin>'/0'/0/<index>` for every family.
   *
   * Both ecosystems increment address_index — TronLink, agent-wallet and the Java wallet-cli on
   * TRON, MetaMask/Rabby/Trezor on EVM — so an account derived here follows their default restore
   * flow. Before this was corrected, TRON hung the number at the account level, outside those
   * default scans; `legacyPaths` still names it so the key remains identifiable by its exact path.
   */
  static path(family: ChainFamily, index: number): string {
    return `m/44'/${FAMILIES[family].coinType}'/0'/0/${index}`;
  }

  /** Ledger Live's account-level template. `--path` reaches any other device scheme explicitly. */
  static ledgerPath(family: ChainFamily, index: number): string {
    return `m/44'/${FAMILIES[family].coinType}'/${index}'/0/0`;
  }

  /**
   * Software templates this CLI produced in the past but no longer does, newest first.
   *
   * Only TRON has one, and only from index 1: index 0 is the same path under both templates, and
   * EVM's template never changed. An empty list means every account of this family and index can
   * only have come from the current template.
   */
  static legacyPaths(family: ChainFamily, index: number): string[] {
    if (family !== "tron" || index === 0) return [];
    return [`m/44'/195'/${index}'/0/0`];
  }

  /** Derive a keypair from a 64-byte seed at the given BIP44 path. publicKey is uncompressed (65B). */
  static derive(seed: Bytes, path: string): KeyPair {
    const node = HDKey.fromMasterSeed(seed).derive(path);
    if (!node.privateKey)
      throw new WalletError("encoding_error", `cannot derive private key at ${path}`);
    const privateKey = node.privateKey;
    const publicKey = secp256k1.getPublicKey(privateKey, false); // uncompressed
    return { privateKey, publicKey };
  }

  /** raw private key → uncompressed public key (for privateKey-source wallets). */
  static publicKeyFromPrivate(privateKey: Bytes): Bytes {
    return secp256k1.getPublicKey(privateKey, false);
  }

  /** whether a 32-byte scalar is in secp256k1's valid private-key range `[1, n-1]`. */
  static isValidPrivateKey(privateKey: Bytes): boolean {
    return secp256k1.utils.isValidSecretKey(privateKey);
  }
}
