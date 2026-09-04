import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AtomicFileStore } from "../adapters/outbound/persistence/fs/index.js";
import { Keystore } from "../adapters/outbound/keystore/index.js";
import { migrationSteps } from "./migration-steps.js";
import { Derivation } from "../domain/derivation/index.js";
import { evmAddressFromPublicKey } from "../domain/address/index.js";

const MNEMONIC = "test test test test test test test test test test test junk";
const PASSWORD = "masterpw123A";

/** a REAL keystore with a REAL encrypted vault, then wound back to the v1 shape on disk. */
function realV1Keystore() {
  const root = mkdtempSync(join(tmpdir(), "mig-real-"));
  const store = new AtomicFileStore();
  const ks = new Keystore(root, store, () => PASSWORD);
  ks.import({ secret: MNEMONIC, type: "seed", label: "main" });
  ks.addAccount(ks.list()[0]!.seedId!, 2);

  const path = join(root, "wallets.json");
  const doc = JSON.parse(readFileSync(path, "utf8"));
  doc.version = 1;
  for (const byIndex of Object.values(
    doc.wallets[0].source.addresses as Record<string, Record<string, string>>,
  )) {
    delete byIndex.evm; // wind back to what a pre-EVM keystore actually looks like
  }
  writeFileSync(path, JSON.stringify(doc));
  return { root, store, path };
}

describe("the wallets step against a real encrypted vault", () => {
  it("derives every known index's EVM address using the decrypted seed", () => {
    const { root, store, path } = realV1Keystore();
    const step = migrationSteps(root, store)[0]!;
    const doc = JSON.parse(readFileSync(path, "utf8"));

    expect(step.needsPassword(doc)).toBe(true);
    const migrated = step.migrate(doc, PASSWORD) as {
      wallets: [{ source: { addresses: Record<string, { tron: string; evm: string }> } }];
    };

    const seed = Derivation.mnemonicToSeed(MNEMONIC);
    for (const index of ["0", "2"]) {
      expect(migrated.wallets[0].source.addresses[index]!.evm).toBe(
        evmAddressFromPublicKey(Derivation.derive(seed, `m/44'/60'/0'/0/${index}`).publicKey),
      );
    }
  });

  it("refuses a wrong password rather than writing garbage", () => {
    const { root, store, path } = realV1Keystore();
    const step = migrationSteps(root, store)[0]!;
    const doc = JSON.parse(readFileSync(path, "utf8"));

    expect(() => step.migrate(doc, "not-the-password")).toThrow();
  });
});
