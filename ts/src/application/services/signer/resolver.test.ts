import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SignerResolver } from "./index.js";
import { tronSignStrategy } from "../../../adapters/outbound/chain/tron/signing-strategy.js";
import { Keystore } from "../../../adapters/outbound/keystore/index.js";
import { AtomicFileStore } from "../../../adapters/outbound/persistence/fs/index.js";
import type { Ledger } from "../../../adapters/outbound/ledger/index.js";

function freshKeystore() {
  const root = mkdtempSync(join(tmpdir(), "sr-"));
  return new Keystore(root, new AtomicFileStore(), () => "masterpw123A");
}

describe("SignerResolver — watch accounts", () => {
  let ks: Keystore;
  let resolver: SignerResolver;
  beforeEach(() => {
    ks = freshKeystore();
    // ledger never touched for watch; strategies never touched (watch can't sign)
    resolver = new SignerResolver(ks, {} as unknown as Ledger, { tron: tronSignStrategy });
  });

  it("refuses to sign for a watch-only account (watch_only_no_signer)", () => {
    const ref = ks.registerWatch({ family: "tron", address: "Twatch1" }).accountId;
    let err: { code?: string } | undefined;
    try {
      resolver.resolve(ref, "tron");
    } catch (e) {
      err = e as { code?: string };
    }
    expect(err?.code).toBe("watch_only_no_signer");
  });

  it("assertCanSign rejects a watch-only account before any RPC/decrypt", () => {
    const ref = ks.registerWatch({ family: "tron", address: "Twatch1" }).accountId;
    let err: { code?: string } | undefined;
    try {
      resolver.assertCanSign(ref, "tron");
    } catch (e) {
      err = e as { code?: string };
    }
    expect(err?.code).toBe("watch_only_no_signer");
  });

  it("assertCanSign passes for a signable (private-key) account", () => {
    // 32-byte test key → deterministic tron address; assertCanSign must not throw.
    const ref = ks.import({ type: "privateKey", secret: "0x".padEnd(66, "1") }).accountId;
    expect(() => resolver.assertCanSign(ref, "tron")).not.toThrow();
  });
});
