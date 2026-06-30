/**
 * HelpService — --help / --version / --json-schema. Zod-driven: every flag's help,
 * required/optional/default, examples, and the agent JSON-schema come from the command's
 * zod fields/input; one schema supplies validation, types, help, and agent schema.
 *
 * Two command kinds, discriminated by `family`: neutral (full path) and chain (logical path,
 * per-family impls). A leading family token (e.g. tron) is an optional addressing prefix here.
 */
import { z } from "zod";
import type { ChainFamily, ExitCode } from "../../../../domain/types/index.js";
import type { CommandDefinition, StreamManager } from "../contracts/index.js";
import { CommandRegistry } from "../registry/index.js";
import { introspectFields, type FieldInfo } from "../arity/index.js";
import { GLOBAL_FLAGS, type GlobalFlag, inputFlagsFor, buildCatalog } from "./catalog.js";

const META = new Set(["--help", "-h", "--version", "-V", "--json-schema"]);

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
    if (tokens.includes("--version") || tokens.includes("-V")) {
      this.streams.result(this.version);
      return 0;
    }
    const positionals = tokens.filter((t) => !t.startsWith("-"));
    const { family, path } = this.#split(positionals);
    const concrete = this.#resolveConcrete(family, path);

    if (tokens.includes("--json-schema")) {
      if (concrete) {
        this.streams.result(JSON.stringify(z.toJSONSchema(concrete.input)));
        return 0;
      }
      // no concrete command → machine catalog (every command + flags), optionally scoped to a
      // chain family (`tron --json-schema`). Mirrors the help tree.
      this.streams.result(this.#catalog(family));
      return 0;
    }

    if (concrete) {
      this.streams.result(this.#renderCommand(concrete));
      return 0;
    }
    if (!family && path.length === 1 && this.#isNeutralGroup(path[0]!)) {
      this.streams.result(this.#renderNeutralGroup(path[0]!));
      return 0;
    }
    if (path.length > 1 && this.#isChainGroup(path[0]!)) {
      let candidates = this.registry.resolveCandidates(path);
      if (family) candidates = candidates.filter((c) => c.family === family);
      if (candidates.length > 0) {
        this.streams.result(this.#renderLogicalCommand(path, candidates));
        return 0;
      }
    }
    this.streams.result(this.#renderTree(path[0]));
    return 0;
  }

  /** strip an optional leading family token (e.g. tron) — a help/catalog addressing prefix. */
  #split(positionals: string[]): { family?: ChainFamily; path: string[] } {
    const head = positionals[0];
    if (head && (this.registry.families() as string[]).includes(head)) {
      return { family: head as ChainFamily, path: positionals.slice(1) };
    }
    return { path: positionals };
  }

  /** resolve to a single command: a neutral command by full path, or a family-pinned chain command. */
  #resolveConcrete(family: ChainFamily | undefined, path: string[]): CommandDefinition | null {
    if (path.length === 0) return null;
    if (family) return this.registry.resolveForFamily(path, family);
    const neutral = this.registry.resolveNeutral(path);
    if (neutral) return neutral;
    // single-segment chain leaf (e.g. `block`): resolve by its HEAD so `block`, `block 123`, and even
    // `block <typo>` all render the leaf help instead of a phantom `block COMMAND` group. Group heads
    // like `account` have no command at the bare path, so they stay groups (headLeaf is undefined).
    const headLeaf = this.registry.resolveCandidates([path[0]!])[0];
    if (headLeaf && headLeaf.path.length === 1) return headLeaf;
    return null;
  }

  #renderTree(head?: string): string {
    if (!head) return this.#renderRoot();
    if (this.#isChainGroup(head)) return this.#renderLogicalNs(head);
    if (this.#isNeutralGroup(head)) return this.#renderNeutralGroup(head);
    return this.#renderRoot();
  }

  /** top-level overview: first release presents TRON as the product surface.
   * Docker-style three groups: Common (高频入口) / Management (链上资源名词) / Commands (本机治理). */
  #renderRoot(): string {
    const common = [
      ["create", "Create a new HD wallet (BIP39 seed)", ""],
      ["import", "Import a wallet", ""],
      ["list", "List wallets / accounts", ""],
    ] as const;
    const management = [
      ["account", "Query on-chain account state", ""],
      ["token", "Manage the token address book and query tokens", ""],
      ["tx", "Build, send, broadcast, and inspect transactions", ""],
      ["contract", "Call, send, deploy, and inspect smart contracts", ""],
      ["stake", "Stake / delegate resources", "tron"],
      ["message", "Sign arbitrary messages", ""],
      ["block", "Get a block (latest if omitted)", ""],
    ] as const;
    const commands = [
      ["use", "Set the active account", ""],
      ["current", "Show the current (active) account", ""],
      ["rename", "Rename an account label", ""],
      ["derive", "Derive the next HD account from a seed wallet", ""],
      ["backup", "Export an account's secret + metadata (0600)", ""],
      ["delete", "Delete a wallet / account", ""],
      ["config", "Show / get / set configuration values", ""],
      ["networks", "List known networks", ""],
    ] as const;
    const sections = [common, management, commands] as const;
    const nameWidth = Math.max(...sections.flat().map(([name]) => name.length)) + 2;
    // chain-only groups carry a right-hand (family) tag; align it past the widest description.
    const tagCol = Math.max(...sections.flat().map(([, desc]) => desc.length)) + 2;
    const commandRow = (name: string, desc: string, tag: string): string => {
      const body = `  ${name.padEnd(nameWidth)}${dim(desc)}`;
      return tag ? `${body}${" ".repeat(Math.max(2, tagCol - desc.length))}(${tag})` : body.trimEnd();
    };
    const row = (width: number) => (name: string, desc: string): string => `  ${name.padEnd(width)}${desc ? dim(desc) : ""}`.trimEnd();
    const optionRows = [
      ["-o, --output string", 'Output format ("text", "json") (default from config)'],
      ["--network string", 'Network id or alias, e.g. "tron", "nile", "shasta"'],
      ["--account string", "Account label or address to act as (overrides active)"],
      ["--timeout int", "Request timeout in milliseconds"],
      ["-v, --verbose", "Verbose / debug logging"],
      ["-h, --help", "Show help"],
      ["-V, --version", "Print version information and quit"],
    ] as const;
    const optionRow = row(Math.max(...optionRows.map(([name]) => name.length)) + 2);

    // Usage first, description after (: 描述统一在 Usage 之后); root Usage is the inline form.
    const lines = [
      `${bold("Usage:")}  wallet-cli [OPTIONS] COMMAND`,
      "",
      `${bold("wallet-cli")} — CLI wallet for TRON.`,
      "Agent-first: deterministic exit codes, JSON output, no interactive prompts.",
      "",
      bold("Common Commands:"),
    ];
    for (const [name, desc, tag] of common) lines.push(commandRow(name, desc, tag));

    lines.push("", bold("Management Commands:"));
    for (const [name, desc, tag] of management) lines.push(commandRow(name, desc, tag));

    lines.push("", bold("Commands:"));
    for (const [name, desc, tag] of commands) lines.push(commandRow(name, desc, tag));

    lines.push("", bold("Global Options:"));
    for (const [name, desc] of optionRows) lines.push(optionRow(name, desc));
    lines.push("", "Run 'wallet-cli COMMAND --help' for more information on a command.");
    return lines.join("\n");
  }

  /** neutral group (`import --help`): list the group's sub-commands. Derived from the registry. */
  #renderNeutralGroup(head: string): string {
    const cmds = this.#neutralGroupCommands(head);
    const rows = cmds.map((c) => [c.path[1] ?? "", c.summary ?? ""] as const);
    return this.#renderGroup(head, rows, 1000);
  }

  /** logical resource group (`account --help`): default surface, implementations chosen by --network/defaultNetwork. */
  #renderLogicalNs(group: string): string {
    const commands = this.#chainGroupCommands(group);
    const rows = commands.map((c) => [c.path[1] ?? "", c.summary ?? ""] as const);
    return this.#renderGroup(group, rows, 18);
  }

  /** shared group skeleton (群组层): inline Usage → description → verb list → footer. */
  #renderGroup(group: string, rows: ReadonlyArray<readonly [string, string]>, maxWidth: number): string {
    const width = Math.min(maxWidth, Math.max(0, ...rows.map(([verb]) => verb.length)) + 2);
    const lines = [`${bold("Usage:")}  wallet-cli ${group} COMMAND`, ""];
    const desc = GROUP_DESCRIPTIONS[group];
    if (desc) lines.push(desc, "");
    lines.push(bold("Commands:"));
    for (const [verb, summary] of rows) lines.push(`  ${verb.padEnd(width)} ${summary}`.trimEnd());
    lines.push("", `Run 'wallet-cli ${group} COMMAND --help' for more information on a command.`);
    return lines.join("\n");
  }

  /** logical leaf (`account balance --help`): merge per-family flags; addressing/auth taken from the first impl. */
  #renderLogicalCommand(path: string[], candidates: CommandDefinition[]): string {
    const fields = new Map<string, FieldInfo>();
    for (const cmd of candidates) {
      for (const f of introspectFields(cmd.fields)) fields.set(f.name, f);
    }
    const base = candidates[0]!;
    return this.#renderLeaf({
      path,
      summary: base.summary,
      network: base.network,
      auth: base.auth,
      wallet: base.wallet,
      broadcasts: base.broadcasts,
      fields: [...fields.values()],
      inputFlags: inputFlagsFor(base),
      examples: base.examples,
    });
  }

  #renderCommand(cmd: CommandDefinition): string {
    return this.#renderLeaf({
      path: cmd.path,
      summary: cmd.summary,
      network: cmd.network,
      auth: cmd.auth,
      wallet: cmd.wallet,
      broadcasts: cmd.broadcasts,
      fields: introspectFields(cmd.fields),
      inputFlags: inputFlagsFor(cmd),
      examples: cmd.examples,
    });
  }

  /** shared leaf skeleton (叶子层): Usage → description → Requires → Flags → Input flags → Global flags → Examples. */
  #renderLeaf(c: {
    path: string[];
    summary?: string;
    network: CommandDefinition["network"];
    auth: CommandDefinition["auth"];
    wallet: CommandDefinition["wallet"];
    broadcasts?: boolean;
    fields: FieldInfo[];
    inputFlags: readonly GlobalFlag[];
    examples: CommandDefinition["examples"];
  }): string {
    const lines = ["Usage:", `  wallet-cli ${c.path.join(" ")} [flags]`];
    if (c.summary) lines.push("", c.summary);

    const requires: string[] = [];
    if (c.network === "required") requires.push("--network <id|alias>");
    if (c.auth === "required") requires.push("master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY");
    if (c.wallet !== "none") requires.push("an account — defaults to active; override with --account <accountId|label> (or `use <account>`)");
    if (requires.length) {
      lines.push("", "Requires:");
      for (const r of requires) lines.push(`  ${r}`);
    }

    if (c.fields.length) {
      const heads = c.fields.map(flagHead);
      const width = Math.min(34, Math.max(...heads.map((h) => h.length)));
      lines.push("", "Flags:");
      c.fields.forEach((f, i) => {
        const desc = f.description ?? "";
        const tag = flagTag(f);
        lines.push(`  ${heads[i]!.padEnd(width)}  ${desc}${desc && tag ? "  " : ""}${tag}`.trimEnd());
      });
    }

    if (c.inputFlags.length) {
      lines.push("", "Input flags:");
      for (const f of c.inputFlags) lines.push(globalFlagLine(f));
    }

    lines.push("", "Global flags:");
    // curated per command: --network only when the command selects a network; --password-stdin
    // only when it requires unlock; --account is surfaced via Requires, not repeated here.
    for (const g of globalFlagsForText(c.network, c.auth, c.broadcasts ?? false)) lines.push(globalFlagLine(g));

    if (c.examples.length) {
      lines.push("", "Examples:");
      for (const e of c.examples) lines.push(`  ${e.cmd}${e.note ? `   # ${e.note}` : ""}`);
    }
    return lines.join("\n");
  }

  /** chain groups = first path segment of every family-bound command. */
  #chainGroups(): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of this.registry.all()) {
      if (!c.family) continue;
      const group = c.path[0];
      if (group && !seen.has(group)) (seen.add(group), out.push(group));
    }
    return out;
  }

  #isChainGroup(group: string): boolean {
    return this.#chainGroups().includes(group);
  }

  /** chain group sub-commands, deduped across families by logical path. */
  #chainGroupCommands(group: string): Array<{ path: string[]; summary?: string }> {
    const seen = new Set<string>();
    const out: Array<{ path: string[]; summary?: string }> = [];
    for (const c of this.registry.all()) {
      if (!c.family || c.path[0] !== group) continue;
      const key = c.path.join(".");
      if (!seen.has(key)) (seen.add(key), out.push({ path: c.path, summary: c.summary }));
    }
    return out;
  }

  /** neutral groups = heads of neutral commands that have sub-verbs (e.g. import). */
  #neutralGroupCommands(head: string): CommandDefinition[] {
    return this.registry.all().filter((c) => !c.family && c.path[0] === head && c.path.length > 1);
  }

  #isNeutralGroup(head: string): boolean {
    return this.#neutralGroupCommands(head).length > 0;
  }

  /** machine-readable catalog of the whole command surface — the agent's single discovery call. */
  #catalog(familyFilter?: ChainFamily): string {
    return buildCatalog(this.registry, this.version, familyFilter);
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

// Per-command "Global flags" projection: output/timeout/verbose always; --network only when the
// command selects a network; --password-stdin only when it requires unlock; --wait/--wait-timeout
// only for ✍️ broadcast commands; --account is never repeated here (it surfaces under Requires). The full
// GLOBAL_FLAGS array still backs the --json-schema catalog.
function globalFlagsForText(network: CommandDefinition["network"], auth: CommandDefinition["auth"], broadcasts: boolean): GlobalFlag[] {
  return GLOBAL_FLAGS.filter((g) => {
    if (g.flag === "--account") return false;
    if (g.flag === "--network") return network !== "none";
    if (g.flag === "--password-stdin") return auth === "required";
    if (g.flag === "--wait" || g.flag === "--wait-timeout") return broadcasts;
    return true;
  });
}

/** one rendered "  --flag <type>   description  [tag]" line, shared by Input flags and Global flags. */
function globalFlagLine(g: GlobalFlag): string {
  const tag = globalFlagTag(g);
  return `  ${globalFlagHead(g).padEnd(26)} ${g.description}${g.description && tag ? "  " : ""}${tag}`.trimEnd();
}

// Group (群组层) one-line descriptions, keyed by the registry group head. Only groups that surface a
// `<group> --help` page need an entry; absent → the description line is omitted.
const GROUP_DESCRIPTIONS: Record<string, string> = {
  import: "Import a wallet from an existing secret or device.",
  account: "Query on-chain account state.",
  token: "Manage the token address book and query tokens.",
  tx: "Build, send, broadcast, and inspect transactions.",
  contract: "Call, send, deploy, and inspect smart contracts.",
  stake: "Stake / delegate resources.",
  message: "Sign arbitrary messages.",
  block: "Get a block (latest if omitted).",
};

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

/** color only when stdout is a TTY and NO_COLOR is unset — piped/redirected help stays plain. */
function colorOn(): boolean {
  return !!process.stdout.isTTY && !process.env.NO_COLOR;
}
function bold(s: string): string {
  return colorOn() ? `\x1b[1m${s}\x1b[0m` : s;
}
function dim(s: string): string {
  return colorOn() ? `\x1b[2m${s}\x1b[0m` : s;
}
