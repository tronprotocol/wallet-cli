import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SignerResolver } from "./index.js";
import { Keystore } from "../keystore/index.js";
import { AtomicFileStore } from "../fs/index.js";
import type { Ledger } from "../ledger/index.js";

function freshKeystore() {
  const root = mkdtempSync(join(tmpdir(), "sr-"));
  return new Keystore(root, new AtomicFileStore(), () => "masterpw123A");
}

describe("SignerResolver — watch accounts", () => {
  let ks: Keystore;
  let resolver: SignerResolver;
  beforeEach(() => {
    ks = freshKeystore();
    resolver = new SignerResolver(ks, {} as unknown as Ledger); // ledger never touched for watch
  });

  it("refuses to sign for a watch-only account (watch_only_no_signer)", () => {
    const ref = ks.registerWatch({ family: "tron", address: "Twatch1" });
    let err: { code?: string } | undefined;
    try {
      resolver.resolve(ref, "tron");
    } catch (e) {
      err = e as { code?: string };
    }
    expect(err?.code).toBe("watch_only_no_signer");
  });

  it("reports missing_wallet_address when the requested family doesn't match the watch", () => {
    const ref = ks.registerWatch({ family: "tron", address: "Twatch1" });
    let err: { code?: string } | undefined;
    try {
      resolver.resolve(ref, "evm");
    } catch (e) {
      err = e as { code?: string };
    }
    expect(err?.code).toBe("missing_wallet_address");
  });
});
