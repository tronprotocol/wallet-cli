import { describe, it, expect } from "vitest";
import type { Source } from "../types/wallet.js";
import { SOURCE_KINDS, sourceLabel, sourceFamily } from "./index.js";

describe("source registry", () => {
  it("describes every known source kind", () => {
    expect(Object.keys(SOURCE_KINDS).sort()).toEqual(["ledger", "privateKey", "seed", "watch"]);
  });

  it("marks only seed as HD", () => {
    expect(SOURCE_KINDS.seed.isHD).toBe(true);
    expect(SOURCE_KINDS.privateKey.isHD).toBe(false);
    expect(SOURCE_KINDS.ledger.isHD).toBe(false);
    expect(SOURCE_KINDS.watch.isHD).toBe(false);
  });

  it("marks only seed/privateKey as secret-bearing", () => {
    expect(SOURCE_KINDS.seed.hasSecret).toBe(true);
    expect(SOURCE_KINDS.privateKey.hasSecret).toBe(true);
    expect(SOURCE_KINDS.ledger.hasSecret).toBe(false);
    expect(SOURCE_KINDS.watch.hasSecret).toBe(false);
  });

  it("labels each kind and passes unknowns through", () => {
    expect(sourceLabel("seed")).toBe("HD");
    expect(sourceLabel("privateKey")).toBe("private key");
    expect(sourceLabel("ledger")).toBe("Ledger");
    expect(sourceLabel("watch")).toBe("watch-only");
    expect(sourceLabel("???")).toBe("???");
    expect(sourceLabel(undefined)).toBe("");
  });

  it("pins family for single-family sources only", () => {
    const ledger: Source = { type: "ledger", family: "tron", path: "m/44'/195'/0'/0/0", address: "T..." };
    const watch: Source = { type: "watch", family: "tron", address: "T..." };
    const seed: Source = { type: "seed", vaultId: "vlt_x", addresses: {} };
    const priv: Source = { type: "privateKey", keyId: "key_x", addresses: { tron: "T..." } };
    expect(sourceFamily(ledger)).toBe("tron");
    expect(sourceFamily(watch)).toBe("tron");
    expect(sourceFamily(seed)).toBeUndefined();
    expect(sourceFamily(priv)).toBeUndefined();
  });
});
