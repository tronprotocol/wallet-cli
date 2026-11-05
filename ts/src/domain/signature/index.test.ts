import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { hashMessage } from "ethers";
import { utils as tronUtils } from "tronweb";
import { addressCodec } from "../family/index.js";
import { messageDigest, recoverSignerAddress, tronTransactionDigest } from "./index.js";

const KEY = secp256k1.utils.randomSecretKey();
const PUB = secp256k1.getPublicKey(KEY, false);

function sign(digest: Uint8Array, vOffset = 27): string {
  const sig = secp256k1.sign(digest, KEY, { prehash: false, format: "recovered" });
  return `${bytesToHex(sig.slice(1))}${(vOffset + sig[0]!).toString(16).padStart(2, "0")}`;
}

describe("signature recovery", () => {
  it.each(["tron", "evm"] as const)("recovers the %s signer with v as 27/28 or 0/1", (family) => {
    const digest = messageDigest(family, "hello");
    const address = addressCodec(family).fromPublicKey(PUB);
    expect(recoverSignerAddress(family, digest, sign(digest))).toBe(address);
    expect(recoverSignerAddress(family, digest, `0x${sign(digest, 0)}`)).toBe(address);
  });

  it("returns a different address for another digest", () => {
    const digest = messageDigest("tron", "hello");
    const other = messageDigest("tron", "hellp");
    expect(recoverSignerAddress("tron", other, sign(digest))).not.toBe(
      addressCodec("tron").fromPublicKey(PUB),
    );
  });

  it.each(["9000", "", "zz", `${"11".repeat(64)}05`, "00".repeat(65)])(
    "rejects the malformed signature %j",
    (signature) => {
      expect(recoverSignerAddress("tron", messageDigest("tron", "x"), signature)).toBeUndefined();
    },
  );

  it("hashes messages as TronWeb and ethers do", () => {
    expect(`0x${bytesToHex(messageDigest("tron", "héllo"))}`).toBe(
      tronUtils.message.hashMessage("héllo"),
    );
    expect(`0x${bytesToHex(messageDigest("evm", "héllo"))}`).toBe(hashMessage("héllo"));
  });

  it("hashes TRON raw data with sha256", () => {
    expect(bytesToHex(tronTransactionDigest("0x0a02")!)).toBe(
      createHash("sha256").update(Buffer.from("0a02", "hex")).digest("hex"),
    );
    expect(tronTransactionDigest("0g")).toBeUndefined();
  });
});
