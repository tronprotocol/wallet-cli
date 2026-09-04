/**
 * End-to-end coverage for Task 3 (scope import dedup to one source kind), exercised through real
 * CLI dispatch rather than calling Keystore.import directly: import private-key, then import the
 * mnemonic that derives the SAME EVM address at account #0, and confirm both accounts survive
 * (list shows two) and a wallet-management command on that shared address refuses to guess
 * (ambiguous_account, per ADR — list/backup/delete/rename/derive never accept a family to narrow
 * with). `import private-key` / `import mnemonic` are TTY-only, so this drives them through the
 * same fake-TTY prompter pattern wallet.test.ts and wallet.backup.test.ts already use instead of a
 * real PTY.
 */
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bytesToHex } from "@noble/hashes/utils.js";
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
import { Derivation } from "../../../../domain/derivation/index.js";
import { WalletService } from "../../../../application/use-cases/wallet-service.js";
import { registerWalletCommands } from "./wallet.js";
import type { SessionRef } from "../contracts/index.js";

// Cheap KDF for keystore encryption in this suite — see cheap-scrypt.ts. Production untouched.
vi.mock(
  "@noble/hashes/scrypt.js",
  async () => import("../../../outbound/persistence/crypto/__test-support__/cheap-scrypt.js"),
);

const MNEMONIC = "test test test test test test test test test test test junk";
const VALID_PASSWORD = "Abcdef1!";
// the raw private key MNEMONIC derives at m/44'/60'/0'/0/0 — importing this key and later
// importing MNEMONIC as a seed land on the same EVM address via two DIFFERENT source kinds.
const EVM_KEY_OF_MNEMONIC_ACCOUNT_0 = bytesToHex(
  Derivation.derive(Derivation.mnemonicToSeed(MNEMONIC), Derivation.path("evm", 0)).privateKey,
);

/**
 * Fresh CLI plumbing (StreamManager allows exactly one `result` write, so it — and everything
 * built from it — must be rebuilt per command) sharing one keystore/root and one hidden-answer
 * script consumed across calls, the way a single interactive session would.
 */
function fixture(root: string, hiddenAnswers: string[], hiddenIdx: { i: number }) {
  const store = new AtomicFileStore();
  const streams = new StreamManager("text", false);
  const prompter = new Prompter({
    isTTY: () => true,
    async question(_prompt: string, hidden: boolean) {
      return hidden ? (hiddenAnswers[hiddenIdx.i++] ?? VALID_PASSWORD) : "";
    },
    async readKey() {
      return { name: "return" };
    },
    write() {},
    beginRaw() {},
    endRaw() {},
  });
  const secrets = new SecretResolver(streams, {}, prompter);
  const keystore = new Keystore(root, store, () => secrets.masterPassword());
  const config = ConfigLoader.load();
  const networkRegistry = new NetworkRegistry(config);
  const formatter = createOutputFormatter("text", streams, Date.now());
  const registry = new CommandRegistry();
  const walletService = new WalletService(
    keystore,
    {} as any,
    { write: () => ({ out: "unused", fileMode: "0600", bytes: 0 }) },
    { append: () => {}, list: () => [] },
  );
  registerWalletCommands(registry, { walletService, ledger: {} as any } as any);

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
  return { shellOpts, keystore };
}

describe("import private-key then import mnemonic on the same address (real CLI dispatch)", () => {
  it("keeps both accounts and makes wallet-management commands on the shared address ambiguous", async () => {
    // Fresh $WALLET_CLI_HOME asks Set + Confirm master password before the first secret; the
    // second import only asks to verify it (already established), then the mnemonic.
    const root = mkdtempSync(join(tmpdir(), "wallet-import-dedup-e2e-"));
    const hiddenIdx = { i: 0 };
    const hiddenAnswers = [
      VALID_PASSWORD, // set
      VALID_PASSWORD, // confirm
      EVM_KEY_OF_MNEMONIC_ACCOUNT_0, // import private-key's secret
      VALID_PASSWORD, // verify, for the second import
      MNEMONIC, // import mnemonic's secret
    ];

    const first = fixture(root, hiddenAnswers, hiddenIdx);
    await buildCli(first.shellOpts).parseAsync(["import", "private-key", "--label", "hot"]);

    const second = fixture(root, hiddenAnswers, hiddenIdx);
    await buildCli(second.shellOpts).parseAsync(["import", "mnemonic", "--label", "seed"]);

    const { shellOpts, keystore } = fixture(root, hiddenAnswers, hiddenIdx);
    const views = keystore.list();
    expect(views).toHaveLength(2);
    const types = views.map((v) => keystore.resolveAccount(v.accountId).wallet.source.type).sort();
    expect(types).toEqual(["privateKey", "seed"]);

    const evmAddr = views.find(
      (v) => keystore.resolveAccount(v.accountId).wallet.source.type === "privateKey",
    )!.addresses.evm!;
    expect(
      views.find((v) => keystore.resolveAccount(v.accountId).wallet.source.type === "seed")!
        .addresses.evm,
    ).toBe(evmAddr);

    await expect(buildCli(shellOpts).parseAsync(["backup", evmAddr])).rejects.toMatchObject({
      code: "ambiguous_account",
    });
  });
});
