import { describe, it, expect } from "vitest";
import { createOutputFormatter } from "./index.js";
import { StreamManager } from "../stream/index.js";
import { UsageError } from "../../../../domain/errors/index.js";
import { commandId } from "../command-id.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import type { CommandDefinition } from "../contracts/index.js";
import { renderGenericText, TextFormatters } from "../render/index.js";

function capture(output: "text" | "json") {
  const out: string[] = [];
  const err: string[] = [];
  const sm = new StreamManager(
    output,
    false,
    (s) => out.push(s),
    (s) => err.push(s),
  );
  return { sm, out, err };
}

const cmd = { path: ["account", "balance"] } as unknown as CommandDefinition;
const net: NetworkDescriptor = {
  id: "tron:nile",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "nile",
  capabilities: [],
};

describe("createOutputFormatter (json)", () => {
  it("success returns a single parseable envelope", () => {
    const { sm } = capture("json");
    const f = createOutputFormatter("json", sm, 0);
    const env = JSON.parse(f.success(commandId(cmd), net, { balance: "1" }));
    expect(env.success).toBe(true);
    expect(env.command).toBe("account.balance");
    expect(env.chain).toMatchObject({ network: "tron:nile", chainId: "nile" });
    expect(env.data).toEqual({ balance: "1" });
    expect(env.meta).toMatchObject({ warnings: [] });
  });

  it("error writes an error envelope to stdout via streams.result", () => {
    const { sm, out, err } = capture("json");
    const f = createOutputFormatter("json", sm, 0);
    f.error(new UsageError("missing_option", "need --to"), { commandId: commandId(cmd), net });
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

  it("moves pagination into JSON envelope metadata", () => {
    const { sm } = capture("json");
    const f = createOutputFormatter("json", sm, 0);
    const env = JSON.parse(
      f.success("proposal.list", net, {
        approvalThreshold: 18,
        proposals: [],
        pagination: { offset: 10, limit: 5, total: 42 },
      }),
    );
    expect(env.data).toEqual({ approvalThreshold: 18, proposals: [] });
    expect(env.meta.pagination).toEqual({ offset: 10, limit: 5, total: 42 });
  });

  // The commands whose endpoint reports no count (asset list / exchange list) must land in the SAME
  // place as those that do — otherwise one envelope carries one concept in two locations, decided by
  // whether a total happens to be knowable.
  it("moves pagination into metadata even when no total is knowable, as total: null", () => {
    const { sm } = capture("json");
    const f = createOutputFormatter("json", sm, 0);
    const env = JSON.parse(
      f.success("asset.list", net, {
        assets: [{ assetId: "1000001" }],
        pagination: { offset: 0, limit: 10 },
      }),
    );
    expect(env.data).toEqual({ assets: [{ assetId: "1000001" }] });
    expect(env.meta.pagination).toEqual({ offset: 0, limit: 10, total: null });
  });

  it("keeps both window keys present so null is the only 'unknown' signal", () => {
    const { sm } = capture("json");
    const f = createOutputFormatter("json", sm, 0);
    const env = JSON.parse(
      f.success("backup.records", undefined, {
        records: [],
        pagination: { offset: 0, limit: null, total: 0 },
      }),
    );
    expect(Object.keys(env.meta.pagination).sort()).toEqual(["limit", "offset", "total"]);
    expect(env.meta.pagination).toEqual({ offset: 0, limit: null, total: 0 });
  });

  it("leaves a `pagination` field that is not a window untouched in data", () => {
    const { sm } = capture("json");
    const f = createOutputFormatter("json", sm, 0);
    const env = JSON.parse(f.success("some.command", net, { pagination: { mode: "cursor" } }));
    expect(env.data).toEqual({ pagination: { mode: "cursor" } });
    expect(env.meta.pagination).toBeUndefined();
  });

  it("carries no pagination key at all for an unpaginated command", () => {
    const { sm } = capture("json");
    const f = createOutputFormatter("json", sm, 0);
    const env = JSON.parse(f.success("account.info", net, { address: "T..." }));
    expect(env.meta).not.toHaveProperty("pagination");
  });

  // Text mode titles read the window from the view model, so it must NOT be stripped there.
  it("leaves pagination in the view model for text renderers", () => {
    const { sm } = capture("text");
    const f = createOutputFormatter("text", sm, 0);
    const seen: unknown[] = [];
    f.success("asset.list", net, { assets: [], pagination: { offset: 0, limit: 10 } }, (data) => {
      seen.push((data as { pagination?: unknown }).pagination);
      return "rendered";
    });
    expect(seen).toEqual([{ offset: 0, limit: 10 }]);
  });
});

describe("createOutputFormatter (text)", () => {
  it("generic output identifies the network by canonical id", () => {
    const text = renderGenericText("tron.test", net, {});
    expect(text).toContain("network: tron:nile");
    expect(text).not.toContain("network: nile");
  });

  it("success returns human lines naming the command", () => {
    const { sm } = capture("text");
    const f = createOutputFormatter("text", sm, 0);
    const text = f.success(commandId(cmd), net, { balance: "1" });
    expect(text).toContain("account.balance");
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
    const walletCmd = {
      path: ["create"],
      formatText: TextFormatters.walletCreated("Created", [
        "Recovery phrase is encrypted locally and was not printed.",
        "Run `backup` soon and store the file offline.",
      ]),
    } as unknown as CommandDefinition;
    const text = f.success(
      commandId(walletCmd),
      undefined,
      {
        status: "created",
        accountId: "wlt_abc.0",
        label: "main",
        type: "seed",
        active: true,
        addresses: { tron: "T1234567890abcdef", evm: "0x1234567890abcdef" },
      },
      walletCmd.formatText,
    );
    expect(text).toContain("Created wallet");
    expect(text).toContain("main");
    expect(text).toContain("Run `backup`");
  });

  it("renders existing wallet receipts with a warning marker", () => {
    const { sm } = capture("text");
    const f = createOutputFormatter("text", sm, 0);
    const walletCmd = {
      path: ["import", "private-key"],
      formatText: TextFormatters.walletCreated("Imported", [
        "Private key was read from hidden input and was not printed.",
      ]),
    } as unknown as CommandDefinition;
    const text = f.success(
      commandId(walletCmd),
      undefined,
      {
        status: "existing",
        accountId: "wlt_abc.0",
        label: "main",
        type: "seed",
        addresses: { tron: "T1234567890abcdef", evm: "0x1234567890abcdef" },
      },
      walletCmd.formatText,
    );
    // icon and label live in separate ANSI spans, so assert on the pieces (not a fused substring).
    expect(text).toContain("⚠");
    expect(text).toContain("Existing wallet");
    expect(text).not.toContain("✅"); // existing wallets must not show the success check
  });

  it("strips terminal control sequences from rendered data values", () => {
    const { sm } = capture("text");
    const f = createOutputFormatter("text", sm, 0);
    // a hostile label / remote metadata value carrying ANSI CSI, OSC, and a bare C1 CSI byte.
    const text = f.success(commandId(cmd), net, { balance: "1\x1b[31mHACKED\x1b]0;pwn\x07\x9bK" });
    expect(text).not.toContain("\x1b");
    expect(text).not.toContain("\x9b");
    expect(text).not.toContain("\x07");
    expect(text).toContain("1"); // the real value survives, only control bytes are removed
  });

  it("preserves newlines while stripping control bytes", () => {
    const { sm } = capture("text");
    const f = createOutputFormatter("text", sm, 0);
    const text = f.success(commandId(cmd), net, { balance: "1" });
    expect(text).toContain("\n"); // layout line breaks must remain intact
  });

  it("sanitizes human error and event lines", () => {
    const { sm } = capture("text");
    const f = createOutputFormatter("text", sm, 0);
    const frame = f.event({ type: "pre-verify-address", address: "T1\x1b[2Jabc" });
    expect(frame).not.toContain("\x1b");
    const { sm: sm2, err } = capture("text");
    const f2 = createOutputFormatter("text", sm2, 0);
    f2.error(new UsageError("invalid_value", "bad \x1b[31mvalue\x1b[0m from node"));
    expect(err[0]).not.toContain("\x1b");
  });

  it("json mode keeps data raw (no sanitization)", () => {
    const { sm } = capture("json");
    const f = createOutputFormatter("json", sm, 0);
    const env = JSON.parse(f.success(commandId(cmd), net, { balance: "1\x1b[31m" }));
    expect(env.data.balance).toBe("1\x1b[31m"); // machine-parseable output stays byte-exact
  });

  it("renders backup metadata without secret material", () => {
    const { sm } = capture("text");
    const f = createOutputFormatter("text", sm, 0);
    const backupCmd = {
      path: ["backup"],
      formatText: TextFormatters.walletBackup,
    } as unknown as CommandDefinition;
    const text = f.success(
      commandId(backupCmd),
      undefined,
      {
        accountId: "wlt_abc.0",
        secretType: "mnemonic",
        out: "/tmp/main-backup.json",
        fileMode: "0600",
        bytes: 512,
        mnemonic: "test test test test test test test test test test test junk",
        privateKey: "00".repeat(32),
      },
      backupCmd.formatText,
    );
    expect(text).toContain("/tmp/main-backup.json");
    expect(text).not.toContain("test test");
    expect(text).not.toContain("000000");
  });
});

// Chain-controlled strings (permission names, token metadata, TronLink signer labels) reach the
// security summaries a user reads before approving. Bidi controls are not control BYTES, so the
// C0/C1 strip lets them through — and U+202E reorders everything printed after it.
describe("invisible formatting in untrusted display fields", () => {
  const RLO = String.fromCharCode(0x202e);
  const LRI = String.fromCharCode(0x2066);
  const ZWSP = String.fromCharCode(0x200b);

  it("marks bidi controls in text mode so reordering cannot hide", () => {
    const { sm } = capture("text");
    const f = createOutputFormatter("text", sm, 0);
    const text = f.success(commandId(cmd), net, { label: `Treasury${RLO} ecnanetniam` });
    expect(text).not.toContain(RLO);
    expect(text).toContain("<U+202E>");
  });

  it("marks isolates and zero-width characters too", () => {
    const { sm } = capture("text");
    const f = createOutputFormatter("text", sm, 0);
    const text = f.success(commandId(cmd), net, { label: `a${LRI}b${ZWSP}c` });
    expect(text).toContain("<U+2066>");
    expect(text).toContain("<U+200B>");
    expect(text).not.toContain(LRI);
    expect(text).not.toContain(ZWSP);
  });

  it("leaves ordinary right-to-left text alone", () => {
    const { sm } = capture("text");
    const f = createOutputFormatter("text", sm, 0);
    // implicit bidi comes from the characters' own properties — nothing to neutralize
    const text = f.success(commandId(cmd), net, { label: "Acme \u0645\u0631\u062d\u0628\u0627" });
    expect(text).toContain("Acme \u0645\u0631\u062d\u0628\u0627");
    expect(text).not.toContain("<U+");
  });

  it("json mode keeps the original bytes for machine consumers", () => {
    const { sm } = capture("json");
    const f = createOutputFormatter("json", sm, 0);
    const env = JSON.parse(f.success(commandId(cmd), net, { label: `Treasury${RLO}x` }));
    expect(env.data.label).toBe(`Treasury${RLO}x`);
  });

  it("also covers error lines and progress events", () => {
    const { sm, err } = capture("text");
    createOutputFormatter("text", sm, 0).error(new UsageError("invalid_value", `bad ${RLO} value`));
    expect(err[0]).toContain("<U+202E>");

    const { sm: sm2 } = capture("text");
    const frame = createOutputFormatter("text", sm2, 0).event({
      type: "pre-verify-address",
      address: `T1${RLO}abc`,
    });
    expect(frame).toContain("<U+202E>");
  });
});
