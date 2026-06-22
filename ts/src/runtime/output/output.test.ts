import { describe, it, expect } from "vitest";
import { createOutputFormatter } from "./index.js";
import { StreamManager } from "../../core/stream/index.js";
import { UsageError } from "../../core/errors/index.js";
import type { CommandDefinition, NetworkDescriptor } from "../../core/types/index.js";

function capture(output: "text" | "json") {
  const out: string[] = [];
  const err: string[] = [];
  const sm = new StreamManager(output, false, false, (s) => out.push(s), (s) => err.push(s));
  return { sm, out, err };
}

const cmd = { id: "tron.account.balance", path: ["account", "balance"] } as unknown as CommandDefinition;
const net: NetworkDescriptor = {
  id: "tron:nile", family: "tron", chainId: "nile", aliases: ["nile"], capabilities: [],
};

describe("createOutputFormatter (json)", () => {
  it("success returns a single parseable envelope", () => {
    const { sm } = capture("json");
    const f = createOutputFormatter("json", sm, 0);
    const env = JSON.parse(f.success(cmd, net, { balance: "1" }));
    expect(env.success).toBe(true);
    expect(env.command).toBe("tron.account.balance");
    expect(env.data).toEqual({ balance: "1" });
    expect(env.meta).toMatchObject({ warnings: [] });
  });

  it("error writes an error envelope to stdout via streams.result", () => {
    const { sm, out, err } = capture("json");
    const f = createOutputFormatter("json", sm, 0);
    f.error(new UsageError("missing_option", "need --to"), { commandId: cmd.id, net });
    expect(err).toEqual([]);
    const env = JSON.parse(out[0]!);
    expect(env.success).toBe(false);
    expect(env.error).toMatchObject({ code: "missing_option" });
  });

  it("event renders an NDJSON line that parses back to the event", () => {
    const { sm } = capture("json");
    const f = createOutputFormatter("json", sm, 0);
    const frame = f.event({ type: "awaiting_device", reason: "sign" });
    expect(JSON.parse(frame!)).toEqual({ type: "awaiting_device", reason: "sign" });
  });
});

describe("createOutputFormatter (text)", () => {
  it("success returns human lines naming the command", () => {
    const { sm } = capture("text");
    const f = createOutputFormatter("text", sm, 0);
    const text = f.success(cmd, net, { balance: "1" });
    expect(text).toContain("tron.account.balance");
    expect(text).toContain("balance");
  });

  it("error writes a short line to stderr, not stdout", () => {
    const { sm, out, err } = capture("text");
    const f = createOutputFormatter("text", sm, 0);
    f.error(new UsageError("missing_option", "need --to"));
    expect(out).toEqual([]);
    expect(err[0]).toContain("missing_option");
  });

  it("event renders a non-null human progress line (no spinner)", () => {
    const { sm } = capture("text");
    const f = createOutputFormatter("text", sm, 0);
    const frame = f.event({ type: "awaiting_device", reason: "sign" });
    expect(frame).not.toBeNull();
    expect(frame).not.toContain("{"); // human text, not NDJSON
  });

  it("renders wallet create as a focused human receipt", () => {
    const { sm } = capture("text");
    const f = createOutputFormatter("text", sm, 0);
    const walletCmd = { id: "wallet.create", path: ["create"] } as unknown as CommandDefinition;
    const text = f.success(walletCmd, undefined, {
      status: "created",
      accountId: "wlt_abc.0",
      label: "main",
      type: "seed",
      active: true,
      addresses: { tron: "T1234567890abcdef", evm: "0x1234567890abcdef" },
    });
    expect(text).toContain("Created wallet");
    expect(text).toContain("main");
    expect(text).toContain("Run `wallet backup`");
  });

  it("renders backup metadata without secret material", () => {
    const { sm } = capture("text");
    const f = createOutputFormatter("text", sm, 0);
    const backupCmd = { id: "wallet.backup", path: ["backup"] } as unknown as CommandDefinition;
    const text = f.success(backupCmd, undefined, {
      accountId: "wlt_abc.0",
      secretType: "mnemonic",
      out: "/tmp/main-backup.json",
      fileMode: "0600",
      bytes: 512,
      mnemonic: "test test test test test test test test test test test junk",
      privateKey: "00".repeat(32),
    });
    expect(text).toContain("/tmp/main-backup.json");
    expect(text).not.toContain("test test");
    expect(text).not.toContain("000000");
  });
});
