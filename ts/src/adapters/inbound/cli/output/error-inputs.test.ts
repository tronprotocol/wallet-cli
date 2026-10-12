import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactService } from "../../../../application/use-cases/contact-service.js";
import type { ContactRepository } from "../../../../application/ports/contact-repository.js";
import { CliError, normalizeError, UsageError } from "../../../../domain/errors/index.js";
import { Keystore } from "../../../outbound/keystore/index.js";
import { AtomicFileStore } from "../../../outbound/persistence/fs/index.js";
import { readBoundedTextFile } from "../commands/artifact.js";
import { StreamManager } from "../stream/index.js";
import { createOutputFormatter } from "./index.js";
import { contractCreate2TronBinding, contractDeployEvmBinding } from "../commands/contract.js";
import { sunpumpLaunchTronBinding } from "../commands/sunpump/launch.js";
import { registerX402Commands } from "../commands/x402.js";
import { registerWalletCommands } from "../commands/wallet.js";
import { CommandRegistry } from "../registry/index.js";
import { SignerResolver } from "../../../../application/services/signer/index.js";
import { X402PaymentClient } from "../../../outbound/x402/payment-client.js";

function thrown(action: () => unknown): CliError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    return error as CliError;
  }
  throw new Error("expected a CLI error");
}

function render(error: CliError, mode: "text" | "json"): string {
  const frames: string[] = [];
  const streams = new StreamManager(
    mode,
    false,
    (s) => frames.push(s),
    (s) => frames.push(s),
  );
  // Runner normalizes before formatting; the original CliError must keep its safe text view.
  createOutputFormatter(mode, streams, 0).error(normalizeError(error));
  return frames.join("");
}

describe("untrusted input in text errors (WALLETCLI-SEC-002)", () => {
  const roots: string[] = [];
  function root() {
    const path = mkdtempSync(join(tmpdir(), "error-inputs-"));
    roots.push(path);
    return path;
  }
  afterEach(() => {
    for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
  });

  const service = { deploy: vi.fn(), create2: vi.fn(), pay: vi.fn(), launch: vi.fn() };
  const deploy = contractDeployEvmBinding(service as never);
  const create2 = contractCreate2TronBinding(service as never);
  const launch = sunpumpLaunchTronBinding(service as never);
  const registry = new CommandRegistry();
  registerX402Commands(registry, service as never);
  registerWalletCommands(registry, { walletService: {} as never, ledger: {} as never });
  const pay = registry.resolveNeutral(["x402", "pay"])!;
  const importKeystore = registry.resolveNeutral(["import", "keystore"])!;
  const fileCommands = [
    {
      name: "contract deploy code",
      run: (path: string) => deploy.run({} as never, {} as never, { codeFile: path }),
    },
    {
      name: "contract deploy artifact",
      run: (path: string) => deploy.run({} as never, {} as never, { artifact: path }),
    },
    {
      name: "contract create2 code",
      run: (path: string) => create2.run({} as never, {} as never, { codeFile: path }),
    },
    {
      name: "x402 request body",
      run: (path: string) => pay.run({} as never, {} as never, { bodyFile: path }),
    },
    {
      name: "sunpump image",
      run: (path: string) => launch.run({} as never, {} as never, { image: path }),
    },
  ];

  async function fileError(run: (path: string) => unknown, path: string) {
    let error: unknown;
    try {
      await run(path);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(CliError);
    const cliError = error as CliError;
    expect(render(cliError, "text").trimEnd()).not.toMatch(/[\n\r\u2028\u2029]/);
    expect(render(cliError, "text")).toContain("\\nFAKE_LOG");
    expect(JSON.parse(render(cliError, "json")).error.message).toContain(path);
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  }

  it.each(["missing", "malformed JSON"])(
    "escapes the keystore reader's %s filename error",
    async (kind) => {
      const path = join(root(), "input\nFAKE_LOG");
      if (kind === "malformed JSON") writeFileSync(path, "not JSON");
      await fileError((path) => importKeystore.run({} as never, undefined, { path }), path);
    },
  );

  describe.each(fileCommands)("$name filename errors", ({ run }) => {
    it.each(["missing", "directory"])("escapes a %s path before formatting", async (kind) => {
      const path = join(root(), "input\nFAKE_LOG");
      if (kind === "directory") mkdirSync(path);
      await fileError(run, path);
    });
  });

  it.each([
    { name: "non-hex code", body: "not hex", run: fileCommands[0]!.run },
    { name: "malformed artifact", body: "not JSON", run: fileCommands[1]!.run },
    { name: "missing artifact bytecode", body: "{}", run: fileCommands[1]!.run },
    { name: "empty artifact bytecode", body: '{"bytecode":"0x"}', run: fileCommands[1]!.run },
    { name: "oversized request body", body: "x".repeat(1_048_577), run: fileCommands[3]!.run },
  ])("escapes an existing filename in $name validation", async ({ body, run }) => {
    const path = join(root(), "input\nFAKE_LOG");
    writeFileSync(path, body);
    await fileError(run, path);
  });

  const inputs = [
    "bad\nFAKE_LOG",
    "bad\r\nFAKE_LOG",
    "bad\u2028FAKE_LOG",
    "bad\u2029FAKE_LOG",
    "\u001b[31mANSI\nFAKE_LOG",
  ];
  it.each(inputs)("keeps an invalid contact address on one physical line: %j", (address) => {
    const service = new ContactService({} as ContactRepository);
    const error = thrown(() => service.add("friend", address));
    expect(render(error, "text").trimEnd()).not.toMatch(/[\n\r\u2028\u2029]/);
    expect(render(error, "text")).toContain("FAKE_LOG");
    expect(render(error, "text")).not.toContain("\u001b");
    expect(JSON.parse(render(error, "json")).error.message).toBe(
      `not a recognised chain address: ${address}`,
    );
  });

  it("escapes the filename carried by the actual tx --file reader's OS error", () => {
    const path = join(root(), "missing\nFAKE_LOG.hex");
    const error = thrown(() => readBoundedTextFile(path, 1024, "transaction hex file"));
    expect(render(error, "text").trimEnd()).not.toContain("\n");
    expect(render(error, "text")).toContain("missing\\nFAKE_LOG.hex");
    expect(JSON.parse(render(error, "json")).error.message).toContain(path);
  });

  it.each(["missing\nFAKE_LOG", "wlt_missing\nFAKE_LOG"])(
    "escapes an account lookup: %j",
    (input) => {
      const keystore = new Keystore(root(), new AtomicFileStore(), () => "unused");
      const error = thrown(() => keystore.resolveAccount(input));
      expect(render(error, "text").trimEnd()).not.toContain("\n");
      expect(render(error, "text")).toContain("missing\\nFAKE_LOG");
      expect(JSON.parse(render(error, "json")).error.message).toBe(
        input.startsWith("wlt_") ? `unknown account ${input}` : `no account labelled '${input}'`,
      );
    },
  );

  it("preserves a keystore error's safe text through payment preparation", () => {
    const keystore = new Keystore(root(), new AtomicFileStore(), () => "unused");
    const resolver = new SignerResolver(keystore, {} as never, {} as never);
    const client = new X402PaymentClient(resolver);
    const error = thrown(() =>
      client.prepare({ activeAccount: "missing\nFAKE_LOG" } as never, { family: "tron" } as never),
    );
    expect(render(error, "text").trimEnd()).not.toContain("\n");
    expect(render(error, "text")).toContain("missing\\nFAKE_LOG");
    expect(JSON.parse(render(error, "json")).error).toMatchObject({
      message: "no account labelled 'missing\nFAKE_LOG'",
      details: { phase: "sign", paymentStatus: "not_sent" },
    });
  });

  it("preserves authored multiline guidance and candidate table layout", () => {
    const error = new UsageError("ambiguous_account", "Choose an account.\nUse its accountId.", {
      matches: [
        { accountId: "wlt_a", label: "first", type: "watch", index: null },
        { accountId: "wlt_b", label: "second", type: "watch", index: null },
      ],
    });
    const text = render(error, "text");
    expect(text).toContain("Choose an account.\nUse its accountId.\n");
    expect(text).toContain("wlt_a");
    expect(text).toContain("wlt_b");
    expect(text.split("\n").length).toBeGreaterThan(4);
  });

  it("keeps a stored account label inside its candidate-table cell", () => {
    const keystore = new Keystore(root(), new AtomicFileStore(), () => "unused");
    const address = "TWer2Ygk5TEheHp3TPuYeqxmB6SsGZmaL6";
    keystore.registerWatch({ family: "tron", address, label: "watch\nFAKE_LOG" });
    keystore.registerLedger({
      family: "tron",
      address,
      label: "ledger",
      path: "m/44'/195'/0'/0/0",
    });
    const error = thrown(() => keystore.resolveAccount(address));
    const text = render(error, "text");
    expect(text).not.toContain("\nFAKE_LOG");
    expect(text).toContain("watch\\nFAKE_LOG");
    expect(JSON.parse(render(error, "json")).error.details.matches[0].label).toBe(
      "watch\nFAKE_LOG",
    );
  });
});
