import { describe, expect, it } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { utils as tronUtils } from "tronweb";
import { TronAddress } from "../address/index.js";
import type { GasFreeAuthorization } from "../types/index.js";
import {
  gasFreeDigest,
  gasFreeDomainSeparator,
  gasFreeMessageHash,
  gasFreeTypedData,
  normalizeGasFreeSignature,
  recoverGasFreeSigner,
} from "./index.js";

const DOMAIN = {
  controllerChainId: "3448148188",
  verifyingContract: "THQGuFzL87ZqhxkgqYEryRAd7gqFqL5rdc",
};
const AUTHORIZATION: GasFreeAuthorization = {
  token: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
  serviceProvider: "TKtWbdzEq5ss9vTS9kwRhBp5mXmBfBns3E",
  user: "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC",
  receiver: "TEkj3ndMVEmFLYaFrATMwMjBRZ1EAZkucT",
  value: "25000000",
  maxFee: "1500000",
  deadline: "1700000060",
  version: "1",
  nonce: "8",
};
const SIGNATURE =
  "0x580aab9832cf56d8f418711aa55653a02e51fb97a04fcd09c3bd4cd41cd376f73336a48257ca0d74bbcb8f70cc1bf6e310ca31f167a2ef8b2b93317d9f9a68e31b";

describe("GasFree Java-compatible TIP-712", () => {
  it("matches fixed domain, struct, and final digest vectors", () => {
    expect(bytesToHex(gasFreeDomainSeparator(DOMAIN))).toBe(
      "31a0a46f427dd040c91835228e4555951bde0a894cae6239869bb680ebc6ebea",
    );
    expect(bytesToHex(gasFreeMessageHash(AUTHORIZATION))).toBe(
      "e028dcd1dc81a93cb32a9ac32f1799614d4431c83f0ed5c6c2f932b48f22e614",
    );
    expect(bytesToHex(gasFreeDigest(DOMAIN, AUTHORIZATION))).toBe(
      "006c1bfb7e397bc2975949b80aa099a33a69a9b8835d84a9714723d25652f5ff",
    );
  });

  it("matches TronWeb TIP-712 hashing and recovers the Java r||s||v signer", () => {
    const payload = gasFreeTypedData(DOMAIN, AUTHORIZATION);
    const digest = tronUtils.typedData.TypedDataEncoder.hash(
      payload.domain as never,
      payload.types as never,
      payload.message,
    );
    expect(digest).toBe(`0x${bytesToHex(gasFreeDigest(DOMAIN, AUTHORIZATION))}`);
    expect(normalizeGasFreeSignature(SIGNATURE)).toBe(SIGNATURE.slice(2));
    expect(recoverGasFreeSigner(gasFreeDigest(DOMAIN, AUTHORIZATION), SIGNATURE))
      .toBe(AUTHORIZATION.user);
  });

  it("derives the same TRON address from compressed and uncompressed keys", () => {
    const privateKey = hexToBytes(`${"00".repeat(31)}01`);
    const address = new TronAddress();
    expect(address.fromPublicKey(secp256k1.getPublicKey(privateKey, true)))
      .toBe(AUTHORIZATION.user);
    expect(address.fromPublicKey(secp256k1.getPublicKey(privateKey, false)))
      .toBe(AUTHORIZATION.user);
  });
});
