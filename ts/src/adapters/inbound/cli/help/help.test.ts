import { describe, it, expect } from "vitest";
import { z } from "zod";
import { HelpService } from "./index.js";
import { CommandRegistry } from "../registry/index.js";
import type { ChainSpec, FamilyBinding, StreamManager } from "../contracts/index.js";
import {
  txBroadcastSpec,
  txBroadcastTronBinding,
  txSendSpec,
  txTronLinkMultisigSpec,
} from "../commands/tx.js";
import { messageSignSpec } from "../commands/shared.js";

// ── minimal fakes ─────────────────────────────────────────────────────────────

function makeStream(): StreamManager & { last: string | undefined } {
  const s: any = {
    last: undefined,
    result(text: string) {
      s.last = text;
    },
    diagnostic() {},
    errorLine() {},
    event() {},
    readStdinOnce: () => "",
    warnings: () => [],
  };
  return s;
}

function chainSpec(path: string[], shape: z.ZodRawShape): ChainSpec {
  return {
    path,
    network: "optional",
    wallet: "none",
    auth: "none",
    baseFields: z.object(shape),
    examples: [],
  };
}

function build(): { help: HelpService; stream: ReturnType<typeof makeStream> } {
  const reg = new CommandRegistry();
  reg.addChain(chainSpec(["block"], { number: z.string().optional() }), "tron", {
    run: async () => ({}),
  }); // single-segment leaf
  reg.addChain(chainSpec(["tx", "info"], { txid: z.string().min(1) }), "tron", {
    run: async () => ({}),
  }); // multi-segment leaf
  reg.addChain(chainSpec(["tx", "send"], { to: z.string() }), "tron", { run: async () => ({}) }); // sibling under the tx group
  const stream = makeStream();
  const help = new HelpService(reg, stream, "9.9.9");
  return { help, stream };
}

// ── --json-schema resolution ──────────────────────────────────────────────────

describe("HelpService --json-schema", () => {
  it("emits a multi-segment chain leaf's own input schema (not the catalog)", () => {
    const { help, stream } = build();
    help.handleMeta(["tx", "info", "--json-schema"]);
    const out = JSON.parse(stream.last!);
    expect(out.properties).toHaveProperty("txid");
    expect(out).not.toHaveProperty("commands"); // catalog shape has `commands`
  });

  it("still emits a single-segment chain leaf's input schema", () => {
    const { help, stream } = build();
    help.handleMeta(["block", "--json-schema"]);
    const out = JSON.parse(stream.last!);
    expect(out.properties).toHaveProperty("number");
    expect(out).not.toHaveProperty("commands");
  });

  it("emits the machine catalog for a group head with no bare command", () => {
    const { help, stream } = build();
    help.handleMeta(["tx", "--json-schema"]);
    const out = JSON.parse(stream.last!);
    expect(out).toHaveProperty("commands"); // group head → catalog, not a phantom command schema
  });

  it("scopes a concrete chain command schema to the addressed family", () => {
    const reg = new CommandRegistry();
    const spec = chainSpec(["tx", "send"], { to: z.string() });
    reg.addChain(spec, "tron", {
      run: async () => ({}),
      fields: z.object({ feeLimit: z.string() }),
    });
    reg.addChain(spec, "evm", {
      run: async () => ({}),
      fields: z.object({ gasLimit: z.string() }),
    });
    const stream = makeStream();

    new HelpService(reg, stream, "9.9.9").handleMeta(["evm", "tx", "send", "--json-schema"]);

    const out = JSON.parse(stream.last!);
    expect(out.properties).toHaveProperty("to");
    expect(out.properties).toHaveProperty("gasLimit");
    expect(out.properties).not.toHaveProperty("feeLimit");
  });

  it("scopes the family catalog's input schemas to that family", () => {
    const reg = new CommandRegistry();
    const spec = chainSpec(["tx", "send"], { to: z.string() });
    reg.addChain(spec, "tron", {
      run: async () => ({}),
      fields: z.object({ feeLimit: z.string() }),
    });
    reg.addChain(spec, "evm", {
      run: async () => ({}),
      fields: z.object({ gasLimit: z.string() }),
    });
    const stream = makeStream();

    new HelpService(reg, stream, "9.9.9").handleMeta(["evm", "--json-schema"]);

    const command = JSON.parse(stream.last!).commands.find(
      (c: { id: string }) => c.id === "tx.send",
    );
    expect(command.inputSchema.properties).toHaveProperty("to");
    expect(command.inputSchema.properties).toHaveProperty("gasLimit");
    expect(command.inputSchema.properties).not.toHaveProperty("feeLimit");
  });
});

// Asserting the spec object is not enough: the renderer resolves members by kebab flag name, so a
// group can be well-formed and still never appear. These render the real specs end to end.
describe("shipped exclusive groups actually render", () => {
  // The binding matters here: flags a family declares itself (`--transaction`) live on it, not on
  // the spec, so a stub binding would render help missing exactly those rows.
  function optionsOf(spec: ChainSpec, binding?: FamilyBinding): string[] {
    const reg = new CommandRegistry();
    reg.addChain(spec, "tron", binding ?? { run: async () => ({}) });
    const stream = makeStream();
    new HelpService(reg, stream, "0.0.0").handleMeta([...spec.path, "--help"]);
    const lines = (stream.last ?? "").split("\n");
    return lines.slice(lines.indexOf("Options:") + 1, lines.indexOf("Global options:"));
  }

  it("renders both of tx send's groups, with the right requirement wording", () => {
    const out = optionsOf(txSendSpec);
    expect(out).toContain("  Exactly one of these — the amount to send:");
    expect(out).toContain(
      "  At most one of these — which asset to send; omit for the network's native coin:",
    );
    const amount = out[out.indexOf("  Exactly one of these — the amount to send:") + 1]!;
    expect(amount).toContain("--amount");
    expect(out[out.indexOf("  Exactly one of these — the amount to send:") + 2]).toContain(
      "--raw-amount",
    );
  });

  it("renders message sign's group, pairing the inline flag with its stdin channel", () => {
    const out = optionsOf(messageSignSpec);
    expect(out[0]).toBe("  Exactly one of these — the message to sign:");
    expect(out.slice(1, 3).map((l) => l.trim().split(" ")[0])).toEqual([
      "--message",
      "--message-stdin",
    ]);
    expect(out[1]).not.toContain("[optional]");
  });

  it("renders tx broadcast's group including the stdin channel flag", () => {
    const out = optionsOf(txBroadcastSpec, txBroadcastTronBinding({} as never));
    expect(out[0]).toBe("  Exactly one of these — the signed transaction to broadcast:");
    expect(out.slice(1, 5).map((l) => l.trim().split(" ")[0])).toEqual([
      "--transaction",
      "--tx-stdin",
      "--hex",
      "--file",
    ]);
    // The two TRON-only members say so. A jointly-required group drops "[optional]" from its rows
    // (that tag would contradict the group), but the family tag is a different fact and survives:
    // without it, "no tag" would mean both "every family" and "we did not move the flag".
    expect(out[1]).toContain("(tron)");
    expect(out[2]).toContain("(tron)");
    expect(out[1]).not.toContain("[optional]");
    // --hex and --file are read by both families and stay untagged.
    expect(out[3]).not.toContain("(tron)");
    expect(out[4]).not.toContain("(tron)");
  });

  // tx multisig's three modes are rejected in combination by tronLinkMultisigRefine. Without the
  // group they each rendered a bare "[optional]", so the constraint was discoverable only by
  // failing a run. Omitting all three IS valid (it lists), hence "at most one".
  it("renders tx multisig's mode group, keeping the members optional", () => {
    const out = optionsOf(txTronLinkMultisigSpec);
    expect(out[0]).toBe("  At most one of these — which mode to run; omit all three to list:");
    expect(out.slice(1, 4).map((l) => l.trim().split(" ")[0])).toEqual([
      "--create",
      "--sign",
      "--watch",
    ]);
    for (const line of out.slice(1, 4)) expect(line).toContain("[optional");
    // --hex/--file are not modes; they stay free-standing below the block.
    expect(out.filter((l) => l.includes("--hex") || l.includes("--file"))).toHaveLength(2);
  });
});

// The (tron) tag on the root listing tells a reader which groups disappear on a non-TRON network.
// It is therefore a claim about the CURRENT bindings, and a stale one actively misleads: `chain`
// carried (tron) for a whole release after `chain node` and `chain prices` gained EVM bindings,
// telling every EVM reader that a group they could in fact use was closed to them. A group is
// tagged only while EVERY command under it is bound to that one family.
describe("root help family tags", () => {
  function rootRow(name: string): string {
    const stream = makeStream();
    new HelpService(new CommandRegistry(), stream, "0.0.0").handleMeta(["--help"]);
    return (stream.last ?? "").split("\n").find((l) => l.trimStart().startsWith(`${name} `)) ?? "";
  }

  it("leaves chain untagged, because chain node / chain prices serve EVM too", () => {
    expect(rootRow("chain")).not.toMatch(/\(tron\)$/);
  });

  it("still tags the groups that really are TRON-only", () => {
    for (const group of ["permission", "gasfree", "stake", "vote", "reward"]) {
      expect(rootRow(group)).toMatch(/\(tron\)$/);
    }
  });

  it("leaves family-neutral groups untagged", () => {
    for (const group of ["contract", "message", "block"]) {
      expect(rootRow(group)).not.toMatch(/\(tron\)$/);
    }
  });
});

// A group page is the first thing a reader sees, and for these two the deciding factor is cost:
// a permission update burns a substantial one-off fee, and GasFree is only "free" of TRX — it bills
// in the token being sent. Neither was stated anywhere a reader passes before running the command.
describe("group help states what a command costs", () => {
  function groupHelp(group: string): string {
    const reg = new CommandRegistry();
    reg.addChain(chainSpec([group, "show"], {}), "tron", { run: async () => ({}) });
    const stream = makeStream();
    new HelpService(reg, stream, "0.0.0").handleMeta([group, "--help"]);
    return stream.last ?? "";
  }

  it("permission help explains the model and names the update fee", () => {
    const text = groupHelp("permission");
    expect(text).toMatch(/owner/i);
    expect(text).toMatch(/active/i);
    expect(text).toMatch(/witness/i);
    // the fee is a chain parameter the command reads live, so it must be pinned to a network
    expect(text).toMatch(/100 TRX on mainnet/);
  });

  it("gasfree help says fees come out of the token, not TRX", () => {
    const text = groupHelp("gasfree");
    expect(text).toMatch(/no TRX/i);
    expect(text).toMatch(/activation fee/i);
    expect(text).toMatch(/first transfer/i);
    expect(text).toMatch(/service fee/i);
  });
});

// The catalog is the agent's single discovery call, so an exclusive set has to reach it too —
// otherwise the constraint is human-help-only and an agent can only discover it by failing a run.
describe("--json-schema catalog: exclusive groups", () => {
  function catalogEntry(spec: Partial<ChainSpec>): any {
    const reg = new CommandRegistry();
    reg.addChain(
      {
        path: ["demo"],
        network: "none",
        wallet: "none",
        auth: "none",
        examples: [],
        baseFields: z.object({ hex: z.string().optional(), file: z.string().optional() }),
        ...spec,
      } as ChainSpec,
      "tron",
      { run: async () => ({}) },
    );
    const stream = makeStream();
    new HelpService(reg, stream, "0.0.0").handleMeta(["--json-schema"]);
    return JSON.parse(stream.last!).commands.find((c: any) => c.id === "demo");
  }

  it("emits the declared groups on a chain command", () => {
    const entry = catalogEntry({ exclusive: [{ label: "the input", flags: ["hex", "file"] }] });
    expect(entry.exclusive).toEqual([{ label: "the input", flags: ["hex", "file"] }]);
  });

  it("omits the key entirely when the command declares no group", () => {
    expect(catalogEntry({})).not.toHaveProperty("exclusive");
  });

  it("carries tx multisig's real mode group, so an agent sees the constraint too", () => {
    const reg = new CommandRegistry();
    reg.addChain(txTronLinkMultisigSpec, "tron", { run: async () => ({}) });
    const stream = makeStream();
    new HelpService(reg, stream, "0.0.0").handleMeta(["--json-schema"]);
    const entry = JSON.parse(stream.last!).commands.find((c: any) => c.id === "tx.multisig");
    expect(entry.exclusive).toEqual([
      {
        label: "which mode to run; omit all three to list",
        flags: ["create", "sign", "watch"],
        select: "at-most-one",
      },
    ]);
  });
});

describe("HelpService ChainCommandDefinition", () => {
  it("renders one chain leaf and one family-keyed catalog entry", () => {
    const reg = new CommandRegistry();
    reg.addChain(
      {
        path: ["block"],
        network: "optional",
        wallet: "none",
        auth: "none",
        positionals: [{ field: "number" }],
        summary: "Get a block by number",
        examples: [],
        baseFields: z.object({ number: z.string().optional().describe("block number") }),
      },
      "tron",
      { run: async () => ({}) },
    );
    const stream = makeStream();
    const help = new HelpService(reg, stream, "9.9.9");

    help.handleMeta(["block", "--help"]);
    expect(stream.last).toContain("Get a block by number");
    expect(stream.last!.match(/^  number\s/gm)).toHaveLength(1);

    help.handleMeta(["--json-schema"]);
    const catalog = JSON.parse(stream.last!);
    expect(catalog.commands).toContainEqual(
      expect.objectContaining({ id: "block", families: ["tron"] }),
    );
  });
});

// Regression: options that are jointly required rendered as "[optional]" each, so `--help` read
// as "all of these may be omitted" while the command failed with "provide exactly one of …".
describe("Options: exclusive groups", () => {
  function renderOptions(spec: Partial<ChainSpec>, stdinFlags = false): string[] {
    const reg = new CommandRegistry();
    reg.addChain(
      {
        path: ["demo"],
        network: "none",
        wallet: "none",
        auth: "none",
        examples: [],
        ...(stdinFlags ? { stdin: "tx" as const } : {}),
        baseFields: z.object({
          hex: z.string().optional().describe("transaction hex"),
          file: z.string().optional().describe("file containing the hex"),
          dryRun: z.boolean().default(false).describe("estimate only"),
        }),
        ...spec,
      } as ChainSpec,
      "tron",
      { run: async () => ({}) },
    );
    const stream = makeStream();
    new HelpService(reg, stream, "0.0.0").handleMeta(["demo", "--help"]);
    const lines = (stream.last ?? "").split("\n");
    const start = lines.indexOf("Options:");
    return lines.slice(start + 1, lines.indexOf("Global options:"));
  }

  it("heads the group and drops the misleading per-member [optional] tag", () => {
    const out = renderOptions({
      exclusive: [{ label: "the transaction to inspect", flags: ["hex", "file"] }],
    });
    expect(out[0]).toBe("  Exactly one of these — the transaction to inspect:");
    expect(out[1]).toContain("--hex");
    expect(out[1]).not.toContain("[optional]");
    expect(out[2]).toContain("--file");
    expect(out[2]).not.toContain("[optional]");
  });

  it("keeps ungrouped options tagged, in their own block below the group", () => {
    const out = renderOptions({ exclusive: [{ label: "the input", flags: ["hex", "file"] }] });
    expect(out[3]).toBe("");
    expect(out[4]).toContain("--dry-run");
    expect(out[4]).toContain("[optional, default: false]");
  });

  it("orders members as declared and can include a --*-stdin channel flag", () => {
    const out = renderOptions(
      { exclusive: [{ label: "the input", flags: ["file", "tx-stdin", "hex"] }] },
      true,
    );
    expect(out.slice(1, 4).map((l) => l.trim().split(" ")[0])).toEqual([
      "--file",
      "--tx-stdin",
      "--hex",
    ]);
  });

  // A set that may be omitted entirely (tx send's --token/--contract/--asset-id — omit all three
  // and you send native TRX) must not claim one is required, and its members really are optional.
  it("says 'At most one' and keeps the tags for a set that may be omitted", () => {
    const out = renderOptions({
      exclusive: [{ label: "which asset to send", flags: ["hex", "file"], select: "at-most-one" }],
    });
    expect(out[0]).toBe("  At most one of these — which asset to send:");
    expect(out[1]).toContain("[optional]");
    expect(out[2]).toContain("[optional]");
  });

  // A group naming a flag the command does not have used to be dropped silently, so a typo in the
  // member list (camelCase instead of kebab, say) shipped as help that never mentions the group.
  it("refuses to render a group that names an unknown flag", () => {
    expect(() =>
      renderOptions({ exclusive: [{ label: "the input", flags: ["hex", "fyle"] }] }),
    ).toThrow(/fyle/);
  });

  it("leaves options untouched when no group is declared", () => {
    const out = renderOptions({});
    expect(out.every((l) => !l.includes("Exactly one of these"))).toBe(true);
    expect(out[0]).toContain("[optional]");
  });
});

describe("Requires: master password line", () => {
  function renderAuthLine(spec: Partial<ChainSpec>): string {
    const reg = new CommandRegistry();
    reg.addChain(
      {
        path: ["demo"],
        network: "none",
        wallet: "none",
        auth: "required",
        baseFields: z.object({}),
        examples: [],
        ...spec,
      } as ChainSpec,
      "tron",
      { run: async () => ({}) },
    );
    const stream = makeStream();
    new HelpService(reg, stream, "0.0.0").handleMeta(["demo", "--help"]);
    return (stream.last ?? "").split("\n").find((l) => l.includes("master password")) ?? "";
  }

  // Regression: the help used to promise "or enter it interactively in a TTY" for every command
  // that needs the password. Chain commands never prompt — they fail fast with auth_required —
  // so that sent readers looking for a broken terminal instead of adding --password-stdin.
  it("says a non-interactive command never prompts", () => {
    expect(renderAuthLine({})).toContain("never prompts");
  });

  it("offers the TTY route only when the command opts into prompting", () => {
    expect(renderAuthLine({ interactive: true })).toContain("enter it interactively in a TTY");
    expect(renderAuthLine({ interactive: true })).not.toContain("never prompts");
  });

  // "locked" is taken: stake help uses it for the TRX freeze period, and Ledger help uses
  // "unlocked" for the device. Say what the reader must supply, not what state the keystore is in.
  it("describes mode-dependent authentication in terms of the password, not a lock state", () => {
    const line = renderAuthLine({ auth: "conditional" });
    expect(line).toContain("only when the selected mode signs");
    expect(line).toContain("other modes need no password");
    expect(line).not.toContain("locked");
  });
});

// §「family 專屬 flag 在 help 裡全量展示、按族標註，不按網路裁剪」: help is STATIC — --network does
// not shape it — so both families' flags appear together and each says which family it belongs to.
describe("help tags family-specific flags", () => {
  function twoFamilyHelp() {
    const reg = new CommandRegistry();
    const spec = chainSpec(["tx", "send"], {
      to: z.string().describe("recipient"),
      amount: z.string().optional().describe("amount to send"),
    });
    reg.addChain(spec, "tron", {
      run: async () => ({}),
      fields: z.object({ feeLimit: z.string().optional().describe("max TRX to burn") }),
    });
    reg.addChain(spec, "evm", {
      run: async () => ({}),
      fields: z.object({
        gasLimit: z.string().optional().describe("gas units"),
        maxFee: z.string().optional().describe("max fee in gwei"),
      }),
    });
    const stream = makeStream();
    new HelpService(reg, stream, "9.9.9").handleMeta(["tx", "send", "--help"]);
    return stream.last!;
  }

  it("lists both families' flags, however the network is set", () => {
    const out = twoFamilyHelp();
    expect(out).toContain("--fee-limit");
    expect(out).toContain("--gas-limit");
    expect(out).toContain("--max-fee");
  });

  it("marks each family-specific flag with its family, at the end of the line", () => {
    const line = (flag: string) =>
      twoFamilyHelp()
        .split("\n")
        .find((l) => l.includes(`${flag} `) || l.trimEnd().endsWith(flag))!;

    expect(line("--fee-limit").trimEnd()).toMatch(/\(tron\)$/);
    expect(line("--gas-limit").trimEnd()).toMatch(/\(evm\)$/);
    expect(line("--max-fee").trimEnd()).toMatch(/\(evm\)$/);
  });

  // A flag BOTH families declare (each with its own validation) is shared, not family-specific.
  it("leaves a flag declared by every family untagged", () => {
    const reg = new CommandRegistry();
    const spec = chainSpec(["tx", "send"], { to: z.string().describe("recipient") });
    const shared = z.object({ memo: z.string().optional().describe("note") });
    reg.addChain(spec, "tron", { run: async () => ({}), fields: shared });
    reg.addChain(spec, "evm", { run: async () => ({}), fields: shared });
    const stream = makeStream();
    new HelpService(reg, stream, "9.9.9").handleMeta(["tx", "send", "--help"]);

    const memoLine = stream.last!.split("\n").find((l) => l.includes("--memo"))!;
    expect(memoLine).not.toMatch(/\((tron|evm)\)/);
  });

  // A binding may narrow a base field for its own family; the flag still exists for everyone,
  // so it stays untagged.
  it("leaves a base field untagged even when one family refines it", () => {
    const reg = new CommandRegistry();
    const spec = chainSpec(["tx", "send"], { to: z.string().describe("recipient") });
    reg.addChain(spec, "tron", {
      run: async () => ({}),
      fields: z.object({ to: z.string().min(34).describe("recipient") }),
    });
    reg.addChain(spec, "evm", { run: async () => ({}) });
    const stream = makeStream();
    new HelpService(reg, stream, "9.9.9").handleMeta(["tx", "send", "--help"]);

    const toLine = stream.last!.split("\n").find((l) => l.includes("--to "))!;
    expect(toLine).not.toMatch(/\((tron|evm)\)/);
  });

  // A flag every family accepts is not family-specific, and tagging it would imply a
  // restriction that does not exist.
  it("leaves shared flags untagged", () => {
    const out = twoFamilyHelp();
    const toLine = out.split("\n").find((l) => l.includes("--to "))!;

    expect(toLine).not.toMatch(/\((tron|evm)\)/);
  });
});
