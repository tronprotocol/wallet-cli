/**
 * HelpService (L4) — --help / --version / --json-schema. zod-driven: every flag's help,
 * required/optional/default, examples, and the agent JSON-schema come from the command's
 * zod fields/input; one zod = validation + types + help + agent schema (修正②). (plan §3 L4)
 */
import { z } from "zod";
import type { CommandDefinition, ExitCode, StreamManager } from "../../core/types/index.js";
import { CommandRegistry } from "../../runtime/registry/index.js";
import { introspectFields, type FieldInfo } from "../../runtime/adapter/index.js";
import { isChainFamily } from "../../core/family/index.js";

const META = new Set(["--help", "-h", "--version", "--json-schema"]);

export function hasMeta(tokens: string[]): boolean {
  return tokens.some((t) => META.has(t));
}

export class HelpService {
  constructor(
    private readonly registry: CommandRegistry,
    private readonly streams: StreamManager,
    private readonly version: string,
  ) {}

  handleMeta(tokens: string[]): ExitCode {
    if (tokens.includes("--version")) {
      this.streams.result(this.version);
      return 0;
    }
    const positionals = tokens.filter((t) => !t.startsWith("-"));
    const cmd = this.#resolve(positionals);

    if (tokens.includes("--json-schema")) {
      if (cmd) {
        this.streams.result(JSON.stringify(z.toJSONSchema(cmd.input)));
        return 0;
      }
      // no concrete command → full machine catalog (every command + flags + global flags),
      // optionally scoped to a bare namespace (`tron --json-schema`). Mirrors the help tree.
      const ns = positionals[0];
      const known = new Set(this.registry.tree().namespaces);
      this.streams.result(this.#catalog(ns && known.has(ns) ? ns : undefined));
      return 0;
    }

    if (cmd) {
      this.streams.result(this.#renderCommand(cmd));
      return 0;
    }
    // bare known namespace (e.g. `tron --help`, `wallet --help`) → that namespace's subtree.
    const ns = positionals[0];
    const known = new Set(this.registry.tree().namespaces);
    this.streams.result(this.#renderTree(ns && known.has(ns) ? ns : undefined));
    return 0;
  }

  #resolve(positionals: string[]): CommandDefinition | null {
    if (positionals.length === 0) return null;
    const ns = positionals[0]!;
    const path = positionals.slice(1);
    if (isChainFamily(ns)) return this.registry.resolveConcrete(ns, path);
    // neutral namespaces take one action (wallet/config/chains)
    return this.registry.resolveConcrete(ns, path);
  }

  #renderTree(nsFilter?: string): string {
    if (!nsFilter) return this.#renderRoot();
    return isChainFamily(nsFilter) ? this.#renderChainNs(nsFilter) : this.#renderNeutralNs(nsFilter);
  }

  /** top-level overview: one row per namespace (chain → its resources; neutral → its actions). */
  #renderRoot(): string {
    const families = this.registry.families();
    const neutral = this.registry.neutralNamespaces();
    const width = Math.max(...[...families, ...neutral].map((n) => n.length)) + 2;

    const lines = [
      "wallet-cli — multi-chain CLI wallet for TRON, Ethereum, BSC, Base, Arbitrum, Optimism & more",
      "Agent-first, human-friendly: deterministic exit codes, JSON output, no interactive prompts.",
      "",
      "Usage:",
      "  wallet-cli <namespace> <command> [flags]",
      "",
      "Chain commands  (wallet-cli <family> <resource> <action> --network <net>):",
    ];
    for (const fam of families) lines.push(...wrapRow(fam, width, this.#resourcesOf(fam)));

    lines.push("", "Wallet & utilities:");
    for (const ns of neutral) {
      const commands = this.registry.tree().commands.filter((c) => c.ns === ns);
      const actions = commands.map((c) => c.path[0]).filter(Boolean) as string[];
      lines.push(...(actions.length ? wrapRow(ns, width, actions) : [`  ${ns.padEnd(width)} ${commands[0]?.summary ?? ""}`]));
    }

    lines.push(
      "",
      "Run `wallet-cli <namespace> --help` to drill into a group (e.g. `wallet-cli tron --help`),",
      "`wallet-cli <command> --help` for one command, or `wallet-cli --json-schema` for the full machine catalog.",
    );
    return lines.join("\n");
  }

  /** chain namespace (`tron --help`): group commands by resource, actions inline. */
  #renderChainNs(ns: string): string {
    const resources = this.#resourcesOf(ns);
    const width = Math.max(...resources.map((r) => r.length)) + 2;
    const lines = [
      `wallet-cli ${ns} — commands`,
      "",
      "Usage:",
      `  wallet-cli ${ns} <resource> <action> [flags]`,
      "",
      "Commands:",
    ];
    for (const res of resources) {
      const actions = this.registry
        .tree()
        .commands.filter((c) => c.ns === ns && c.path[0] === res)
        .map((c) => c.path[1]!);
      lines.push(...wrapRow(res, width, actions));
    }
    lines.push("", `Run \`wallet-cli ${ns} <resource> <action> --help\` for command details.`);
    return lines.join("\n");
  }

  /** neutral namespace (`wallet --help`): flat list of actions + summaries (small, readable). */
  #renderNeutralNs(ns: string): string {
    const commands = this.registry.tree().commands.filter((c) => c.ns === ns);
    const labelOf = (c: (typeof commands)[number]) => [c.ns, ...c.path].join(" ");
    const width = Math.min(36, Math.max(0, ...commands.map((c) => labelOf(c).length)) + 2);
    const lines = [`wallet-cli ${ns} — commands`, "", "Usage:", `  wallet-cli ${ns} <command> [flags]`, "", "Commands:"];
    for (const c of commands) lines.push(`  ${labelOf(c).padEnd(width)} ${c.summary ?? ""}`.trimEnd());
    lines.push("", `Run \`wallet-cli ${ns} <command> --help\` for command details.`);
    return lines.join("\n");
  }

  /** ordered, de-duped resources (first path segment) of a chain family. */
  #resourcesOf(ns: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of this.registry.tree().commands) {
      if (c.ns !== ns) continue;
      const res = c.path[0];
      if (res && !seen.has(res)) (seen.add(res), out.push(res));
    }
    return out;
  }

  #renderCommand(cmd: CommandDefinition): string {
    const usageNs = cmd.family ?? cmd.id.split(".")[0]!;
    const lines = [
      `${cmd.id}${cmd.summary ? ` — ${cmd.summary}` : ""}`,
      "",
      "Usage:",
      `  wallet-cli ${[usageNs, ...cmd.path].join(" ")} [flags]`,
    ];
    const requires: string[] = [];
    if (cmd.network === "required") requires.push("--network <id|alias>");
    if (cmd.auth === "required") requires.push("master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY");
    if (cmd.wallet !== "none") requires.push("an account — defaults to active; override with --account <accountId|label> (or `wallet set-active`)");
    if (requires.length) {
      lines.push("", "Requires:");
      for (const r of requires) lines.push(`  ${r}`);
    }

    const fields = introspectFields(cmd.fields);
    if (fields.length) {
      const heads = fields.map(flagHead);
      const width = Math.min(34, Math.max(...heads.map((h) => h.length)));
      lines.push("", "Flags:");
      fields.forEach((f, i) => {
        const desc = f.description ?? "";
        const tag = flagTag(f);
        lines.push(`  ${heads[i]!.padEnd(width)}  ${desc}${desc && tag ? "  " : ""}${tag}`.trimEnd());
      });
    }

    const inputFlags = inputFlagsFor(cmd);
    if (inputFlags.length) {
      lines.push("", "Input flags:");
      for (const f of inputFlags) {
        const desc = f.description;
        const tag = globalFlagTag(f);
        lines.push(`  ${globalFlagHead(f).padEnd(26)} ${desc}${desc && tag ? "  " : ""}${tag}`.trimEnd());
      }
    }

    lines.push("", "Global flags:");
    for (const g of GLOBAL_FLAGS) {
      const desc = g.description;
      const tag = globalFlagTag(g);
      lines.push(`  ${globalFlagHead(g).padEnd(26)} ${desc}${desc && tag ? "  " : ""}${tag}`.trimEnd());
    }

    if (cmd.examples.length) {
      lines.push("", "Examples:");
      for (const e of cmd.examples) lines.push(`  ${e.cmd}${e.note ? `   # ${e.note}` : ""}`);
    }
    return lines.join("\n");
  }

  /** machine-readable catalog of the whole command surface — the agent's single discovery call. */
  #catalog(nsFilter?: string): string {
    const nsOf = (c: CommandDefinition) => c.family ?? c.id.split(".")[0]!;
    const commands = this.registry
      .all()
      .filter((c) => !nsFilter || nsOf(c) === nsFilter)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((cmd) => {
        const ns = nsOf(cmd);
        return {
          id: cmd.id,
          namespace: ns,
          path: cmd.path,
          usage: `wallet-cli ${[ns, ...cmd.path].join(" ")} [flags]`,
          summary: cmd.summary ?? "",
          requires: { network: cmd.network, auth: cmd.auth, wallet: cmd.wallet },
          ...(cmd.capability ? { capability: cmd.capability } : {}),
          examples: cmd.examples.map((e) => e.cmd),
          ...(inputFlagsFor(cmd).length ? { inputFlags: inputFlagsFor(cmd) } : {}),
          inputSchema: toJsonSchema(cmd.input),
        };
      });
    return JSON.stringify({ tool: "wallet-cli", version: this.version, globalFlags: GLOBAL_FLAGS, commands });
  }
}

/** "--flag <type>" header for a command flag — enum fields list their choices instead of <enum>. */
function flagHead(f: FieldInfo): string {
  const typ = f.choices ? ` <${f.choices.join("|")}>` : f.baseType === "boolean" ? "" : ` <${f.baseType}>`;
  return `--${f.kebab}${typ}`;
}

/** "[required]" / "[optional, default: X]" / "[optional]" tag derived from the zod schema. */
function flagTag(f: FieldInfo): string {
  if (!f.optional && !f.hasDefault) return "[required]";
  if (f.hasDefault) return `[optional, default: ${formatDefault(f.defaultValue)}]`;
  return "[optional]";
}

function formatDefault(v: unknown): string {
  if (typeof v === "string") return v === "" ? '""' : v;
  return String(v);
}

/** "  label   a · b · c" with continuation lines hanging-indented under the first item. */
function wrapRow(label: string, labelWidth: number, items: string[], max = 96): string[] {
  const indent = 2 + labelWidth + 1; // "  " + padded label + space
  const out: string[] = [];
  let line = `  ${label.padEnd(labelWidth)} `;
  let count = 0;
  for (const item of items) {
    const piece = count === 0 ? item : ` · ${item}`;
    if (count > 0 && line.length + piece.length > max) {
      out.push(line);
      line = " ".repeat(indent) + item;
    } else {
      line += piece;
    }
    count++;
  }
  out.push(line);
  return out;
}

/** never let one un-convertible schema break the whole catalog. */
function toJsonSchema(input: CommandDefinition["input"]): unknown {
  try {
    return z.toJSONSchema(input as z.ZodType);
  } catch {
    return { type: "object" };
  }
}

// Flags accepted on every command (kubectl-style globals + secret channels). Single structured
// source: rendered as text in command --help AND as `globalFlags` in the root --json-schema catalog.
// Authoritative arity lives in CliShell's GLOBAL_OPTS; this is the documentation projection for
// semantically global flags. Command-scoped stdin channels are documented via INPUT_FLAGS below.
interface GlobalFlag {
  flag: string;
  alias?: string;
  type: "string" | "number" | "boolean";
  values?: string[];
  description: string;
  optional?: boolean;
  defaultValue?: string | number | boolean;
}
const GLOBAL_FLAGS: readonly GlobalFlag[] = [
  { flag: "--output", alias: "-o", type: "string", values: ["text", "json"], description: "result format", defaultValue: "config.defaultOutput (built-in: text)" },
  { flag: "--network", type: "string", description: "network id or alias, e.g. tron:mainnet, nile, base; required only when listed in Requires; commands without a network requirement fall back via config.defaults.network.<family>" },
  { flag: "--account", type: "string", description: "accountId, label, or address for wallet-bound commands; falls back to the active account from wallet set-active" },
  { flag: "--timeout", type: "number", description: "per RPC/device call timeout, in milliseconds", defaultValue: "config.timeoutMs (built-in: 30000)" },
  { flag: "--quiet", type: "boolean", description: "suppress diagnostic/progress messages on stderr, without suppressing result output; mutually exclusive with --verbose", defaultValue: false },
  { flag: "--verbose", type: "boolean", description: "show extra diagnostic/debug messages on stderr, without changing result format; mutually exclusive with --quiet", defaultValue: false },
  { flag: "--rpc-url", type: "string", description: "override the selected network RPC URL for this run" },
  { flag: "--grpc-endpoint", type: "string", description: "override the selected TRON gRPC endpoint for this run" },
  { flag: "--password-stdin", type: "boolean", description: "read the master password from stdin (fd 0); only one *-stdin flag can consume stdin per run" },
];

const INPUT_FLAGS = {
  privateKeyStdin: { flag: "--private-key-stdin", type: "boolean", description: "read the private key from stdin (fd 0)" },
  mnemonicStdin: { flag: "--mnemonic-stdin", type: "boolean", description: "read the BIP39 mnemonic from stdin (fd 0)" },
  txStdin: { flag: "--tx-stdin", type: "boolean", description: "read the signed transaction JSON from stdin (fd 0)" },
  messageStdin: { flag: "--message-stdin", type: "boolean", description: "read the message bytes/text from stdin (fd 0)" },
} as const satisfies Record<string, GlobalFlag>;

function inputFlagsFor(cmd: CommandDefinition): readonly GlobalFlag[] {
  switch (cmd.id) {
    case "wallet.import-private-key":
      return [INPUT_FLAGS.privateKeyStdin];
    case "wallet.import-mnemonic":
      return [INPUT_FLAGS.mnemonicStdin];
    case "tron.tx.broadcast":
      return [INPUT_FLAGS.txStdin];
    case "tron.message.sign":
    case "evm.message.sign":
      return [INPUT_FLAGS.messageStdin];
    default:
      return [];
  }
}

/** "--output, -o <text|json>" style header for text help. */
function globalFlagHead(g: GlobalFlag): string {
  const head = g.alias ? `${g.flag}, ${g.alias}` : g.flag;
  const typ = g.type === "boolean" ? "" : ` <${g.values ? g.values.join("|") : g.type}>`;
  return `${head}${typ}`;
}

function globalFlagTag(g: GlobalFlag): string {
  if (g.defaultValue !== undefined) return `[optional, default: ${formatDefault(g.defaultValue)}]`;
  return "[optional]";
}
