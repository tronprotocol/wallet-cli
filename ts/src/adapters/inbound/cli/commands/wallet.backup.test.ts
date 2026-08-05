/**
 * `backup` password gating, exercised through real dispatch — the ordering only exists there.
 * A Ledger-only keystore has no master password sentinel, so verifying one can never succeed:
 * the account-type check must therefore win over the password gate.
 */
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCli, type ShellOptions } from "../shell/index.js";
import { CommandRegistry } from "../registry/index.js";
import { CapabilityRegistry } from "../../../../application/services/capability/index.js";
import { TargetResolver } from "../../../../application/services/target/index.js";
import { StreamManager } from "../stream/index.js";
import { createOutputFormatter } from "../output/index.js";
import { ConfigLoader, NetworkRegistry } from "../../../outbound/config/index.js";
import { AtomicFileStore } from "../../../outbound/persistence/fs/index.js";
import { Keystore } from "../../../outbound/keystore/index.js";
import { SecretResolver } from "../input/secret/index.js";
import { Prompter } from "../input/prompt/index.js";
import { WalletService } from "../../../../application/use-cases/wallet-service.js";
import { registerWalletCommands } from "./wallet.js";
import type { SessionRef } from "../contracts/index.js";

// Cheap KDF for keystore encryption in this suite — see cheap-scrypt.ts. Production untouched.
vi.mock("@noble/hashes/scrypt.js", async () =>
  import("../../../outbound/persistence/crypto/__test-support__/cheap-scrypt.js"),
);

const VALID_MNEMONIC = "test test test test test test test test test test test junk";
const VALID_PASSWORD = "Abcdef1!";
const LEDGER_ADDRESS = "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL";

function fixture(opts: { tty: boolean }) {
  const root = mkdtempSync(join(tmpdir(), "wallet-backup-test-"));
  const store = new AtomicFileStore();
  const streams = new StreamManager("text", false);
  const prompter = new Prompter({
    isTTY: () => opts.tty,
    async question(_prompt: string, _hidden: boolean) { return VALID_PASSWORD; },
    async readKey() { return { name: "return" }; },
    write() {},
    beginRaw() {},
    endRaw() {},
  });
  const secrets = new SecretResolver(streams, {}, prompter);
  const keystore = new Keystore(root, store, () => secrets.masterPassword());
  const spyPrime = vi.spyOn(secrets, "primePassword");

  const config = ConfigLoader.load();
  const networkRegistry = new NetworkRegistry(config);
  const formatter = createOutputFormatter("text", streams, Date.now());
  const registry = new CommandRegistry();
  registerWalletCommands(registry, {
    walletService: new WalletService(keystore, {} as any, {
      write: () => ({ out: "unused", fileMode: "0600", bytes: 0 }),
    }),
    ledger: {} as any,
  } as any);

  const session: SessionRef = {};
  const shellOpts: ShellOptions = {
    registry,
    globals: { output: "text", verbose: false },
    deps: { config, networkRegistry, streams, secrets, keystore, prompter, formatter },
    targetResolver: new TargetResolver({ networkRegistry, keystore }),
    caps: new CapabilityRegistry(),
    streams,
    formatter,
    session,
  };
  return { shellOpts, keystore, secrets, spyPrime };
}

describe("backup password gating", () => {
  it("fails a Ledger account with not_exportable instead of demanding the master password", async () => {
    const { shellOpts, keystore, spyPrime } = fixture({ tty: false });
    const { accountId } = keystore.registerLedger({
      family: "tron",
      path: "m/44'/195'/0'/0/0",
      address: LEDGER_ADDRESS,
    });

    await expect(buildCli(shellOpts).parseAsync(["backup", accountId]))
      .rejects.toMatchObject({ code: "not_exportable" });
    expect(spyPrime).not.toHaveBeenCalled();
  });

  it("still verifies the master password before exporting a software account", async () => {
    const { shellOpts, keystore, secrets, spyPrime } = fixture({ tty: true });
    await secrets.primePassword({ mode: "set" });
    const { accountId } = keystore.import({ secret: VALID_MNEMONIC, type: "seed" });
    secrets.clearPrimed();
    spyPrime.mockClear(); // ignore the prime used to seed the wallet above

    await buildCli(shellOpts).parseAsync(["backup", accountId]);

    expect(spyPrime).toHaveBeenCalledOnce();
    expect(spyPrime.mock.calls[0]![0].mode).toBe("verify");
  });
});
