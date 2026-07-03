/**
 * SharedTypes — keystore blobs (encrypted secret-at-rest).
 */
export type KeystoreType = "bip39-seed" | "raw-privkey" | "verifier";
export interface CryptoParams {
  cipher: "aes-128-ctr";
  ciphertext: string;
  cipherparams: { iv: string };
  kdf: "scrypt";
  kdfparams: { n: number; r: number; p: number; dklen: number; salt: string };
  mac: string;
}
export interface KeystoreBlob {
  id: string;
  type: KeystoreType;
  version: number;
  crypto: CryptoParams;
}
