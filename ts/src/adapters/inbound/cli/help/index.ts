import { z } from "zod";
import type { ChainFamily, ExitCode } from "../../../../domain/types/index.js";
import { acceptsWaitFlags, isChainCommand } from "../contracts/index.js";
import type {
  ChainCommandDefinition,
  ChainSpec,
  CommandDefinition,
  StoredCommand,
  StreamManager,
} from "../contracts/index.js";
import { CommandRegistry } from "../registry/index.js";
import { CONFIG_DEFAULTS } from "../../../../application/contracts/config-defaults.js";
import { MAX_TIMEOUT_MS } from "../../../../domain/config/index.js";
import { UsageError } from "../../../../domain/errors/index.js";
import { introspectFields, type FieldInfo } from "../arity/index.js";
import {
  GLOBAL_FLAGS,
  type CapabilitySupportSource,
  type GlobalFlag,
  inputFlagsFor,
  buildCatalog,
  mergedFields,
} from "./catalog.js";

const META = new Set(["--help", "-h", "--version", "-V", "--json-schema"]);

export function hasMeta(tokens: string[]): boolean {
  return tokens.some((t) => META.has(t));
}

export class HelpService {
  constructor(
    private readonly registry: CommandRegistry,
    private readonly streams: StreamManager,
    private readonly version: string,
    private readonly capabilities?: CapabilitySupportSource,
  ) {}

  handleMeta(tokens: string[]): ExitCode {
    if (tokens.includes("--version") || tokens.includes("-V")) {
      this.streams.result(this.version);
      return 0;
    }
    const positionals = metaPositionals(tokens);
    const { family, path } = this.#split(positionals);
    const concrete = this.#resolveConcrete(family, path);

    if (tokens.includes("--json-schema")) {
      if (concrete) {
        const input = isChainCommand(concrete) ? mergedFields(concrete, family) : concrete.input;
        this.streams.result(JSON.stringify(z.toJSONSchema(input)));
        return 0;
      }
      this.#assertResolvable(family, path);
      this.streams.result(this.#catalog(family));
      return 0;
    }

    if (concrete) {
      this.streams.result(
        isChainCommand(concrete)
          ? this.#renderChainCommand(concrete)
          : this.#renderCommand(concrete),
      );
      return 0;
    }
    this.#assertResolvable(family, path);
    this.streams.result(this.#renderTree(path[0]));
    return 0;
  }

  #assertResolvable(family: ChainFamily | undefined, path: string[]): void {
    if (path.length === 0) return;
    const head = path[0]!;
    if (path.length === 1 && (this.#isChainGroup(head) || this.#isNeutralGroup(head))) return;

    if (family && this.registry.resolveChain(path)) {
      throw new UsageError("family_mismatch", `${path.join(" ")} has no ${family} implementation`);
    }
    throw new UsageError("unknown_command", `unknown command: ${path.join(" ")}`);
  }

  #split(positionals: string[]): { family?: ChainFamily; path: string[] } {
    const head = positionals[0];
    if (head && (this.registry.families() as string[]).includes(head)) {
      return { family: head as ChainFamily, path: positionals.slice(1) };
    }
    return { path: positionals };
  }

  // Match the longest command prefix; trailing tokens may be argument values, but groups do not count.
  #resolveConcrete(family: ChainFamily | undefined, path: string[]): StoredCommand | null {
    for (let end = path.length; end > 0; end -= 1) {
      const prefix = path.slice(0, end);
      const chain = this.registry.resolveChain(prefix);
      if (chain && (!family || chain.families[family])) return chain;
      if (family) continue;
      const neutral = this.registry.resolveNeutral(prefix);
      if (neutral) return neutral;
    }
    return null;
  }

  #renderTree(head?: string): string {
    if (!head) return this.#renderRoot();
    if (this.#isChainGroup(head)) return this.#renderLogicalNs(head);
    if (this.#isNeutralGroup(head)) return this.#renderNeutralGroup(head);
    return this.#renderRoot();
  }

  #renderRoot(): string {
    const common = [
      ["create", "Create a new HD wallet (BIP39 seed)", ""],
      ["import", "Import a wallet", ""],
      ["list", "List wallets / accounts", ""],
    ] as const;
    const management = [
      ["account", "Query on-chain account state", ""],
      ["permission", "View / update account permissions (multi-sig)", "tron"],
      ["token", "Manage the token address book and query tokens", ""],
      ["tx", "Build, send, broadcast, and inspect transactions", ""],
      ["gasfree", "Gas-free token transfers via the GasFree service", "tron"],
      [
        "sunswap",
        "Swap, manage liquidity, and look up pools, positions and prices on SunSwap",
        "tron",
      ],
      ["sunpump", "Create and trade tokens on the SunPump bonding curve", "tron"],
      ["contract", "Call, deploy, govern, and inspect smart contracts", ""],
      ["proposal", "Create / vote on governance proposals", "tron"],
      ["witness", "Register / operate a super representative", "tron"],
      ["asset", "Issue & manage TRC10 tokens", "tron"],
      ["exchange", "Create and trade Bancor exchange pairs", "tron"],
      ["stake", "Stake / delegate resources & query state", "tron"],
      ["vote", "Vote for super representatives", "tron"],
      ["reward", "Query / withdraw voting rewards", "tron"],
      ["chain", "Query chain and node state", ""],
      ["message", "Sign arbitrary messages", ""],
      ["typed-data", "Sign EIP-712 / TIP-712 structured data", ""],
      ["block", "Get a block (latest if omitted)", ""],
      ["x402", "Pay and inspect x402 service providers", ""],
      ["bai", "Query and recharge a B.AI account", ""],
      ["8004", "Read and manage ERC-8004 Agent identities", ""],
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
      ["change-password", "Change the master password (re-encrypt keystores)", ""],
      ["encoding", "Convert / validate addresses & encodings", ""],
      ["address", "Generate a random keypair (local, not stored)", ""],
      ["contact", "Manage the recipient address book", ""],
    ] as const;
    const sections = [common, management, commands] as const;
    const nameWidth = Math.max(...sections.flat().map(([name]) => name.length)) + 2;
    const tagCol = Math.max(...sections.flat().map(([, desc]) => desc.length)) + 2;
    const commandRow = (name: string, desc: string, tag: string): string => {
      const body = `  ${name.padEnd(nameWidth)}${dim(desc)}`;
      return tag
        ? `${body}${" ".repeat(Math.max(2, tagCol - desc.length))}(${tag.toUpperCase()} only)`
        : body.trimEnd();
    };
    const row =
      (width: number) =>
      (name: string, desc: string): string =>
        `  ${name.padEnd(width)}${desc ? dim(desc) : ""}`.trimEnd();
    const optionRows = [
      ["-o, --output string", 'Output format ("text", "json") (default from config)'],
      ["--network string", 'Network id or alias, e.g. "tron", "ethereum", "sepolia"'],
      ["--account string", "Account label or address to act as (overrides active)"],
      [
        "--timeout int",
        `Deadline for the whole command in milliseconds (0-${MAX_TIMEOUT_MS}); 0 = no limit (default from config timeoutMs, built-in ${CONFIG_DEFAULTS.timeoutMs})`,
      ],
      [
        "--wait",
        "Wait until the submitted transaction is confirmed or failed, within the deadline (default where a transaction is submitted)",
      ],
      [
        "--no-wait",
        "Return after submission without waiting for confirmation; approvals still wait",
      ],
      ["-v, --verbose", "Verbose / debug logging"],
      ["-h, --help", "Show help"],
      ["-V, --version", "Print version information and quit"],
    ] as const;
    const optionRow = row(Math.max(...optionRows.map(([name]) => name.length)) + 2);

    const lines = [
      `${bold("Usage:")}  wallet-cli [OPTIONS] COMMAND`,
      "",
      `${bold("wallet-cli")} — CLI wallet for TRON and EVM networks.`,
      "Agent-first: deterministic exit codes, JSON output.",
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

  #renderNeutralGroup(head: string): string {
    const cmds = this.#neutralGroupCommands(head);
    const rows = cmds.map((c) => [c.path[1] ?? "", c.summary ?? "", ""] as const);
    return this.#renderGroup(head, rows);
  }

  #renderLogicalNs(group: string): string {
    const commands = this.#chainGroupCommands(group);
    const neutral = this.#neutralGroupCommands(group);
    const tags = commands.map((c) => groupRowTag(c.families));
    // Uniform family tags are already shown on the root group row.
    const uniform =
      neutral.length === 0 && tags.length > 0 && tags.every((t) => t !== "" && t === tags[0]);
    const rows = commands.map(
      (c, i) => [c.path[1] ?? "", c.summary ?? "", uniform ? "" : tags[i]!] as const,
    );
    return this.#renderGroup(group, [
      ...rows,
      ...neutral.map((c) => [c.path[1] ?? "", c.summary ?? "", ""] as const),
    ]);
  }

  #renderGroup(group: string, rows: ReadonlyArray<readonly [string, string, string]>): string {
    // Capping the width would misalign summaries after long verbs.
    const width = Math.max(0, ...rows.map(([verb]) => verb.length)) + 2;
    const tagCol = Math.max(0, ...rows.map(([, summary]) => summary.length)) + 2;
    const lines = [`${bold("Usage:")}  wallet-cli ${group} COMMAND`, ""];
    const desc = GROUP_DESCRIPTIONS[group];
    if (desc) lines.push(desc, "");
    lines.push(bold("Commands:"));
    for (const [verb, summary, tag] of rows) {
      const body = `  ${verb.padEnd(width)} ${summary}`;
      lines.push(
        tag
          ? `${body}${" ".repeat(Math.max(2, tagCol - summary.length))}(${tag.toUpperCase()} only)`
          : body.trimEnd(),
      );
    }
    lines.push("", `Run 'wallet-cli ${group} COMMAND --help' for more information on a command.`);
    return lines.join("\n");
  }

  #renderCommand(cmd: CommandDefinition): string {
    return this.#renderLeaf({
      path: cmd.path,
      summary: cmd.summary,
      description: cmd.description,
      network: cmd.network,
      auth: cmd.auth,
      wallet: cmd.wallet,
      broadcasts: cmd.broadcasts,
      rejectsWait: cmd.rejectsWait,
      fields: introspectFields(cmd.fields),
      inputFlags: inputFlagsFor(cmd),
      exclusive: cmd.exclusive,
      examples: cmd.examples,
      requires: cmd.requires,
      positionals: cmd.positionals,
      secretsTtyOnly: cmd.secretsTtyOnly,
      interactive: cmd.interactive,
      requiresAfterAuth: cmd.requiresAfterAuth,
    });
  }

  #renderChainCommand(def: ChainCommandDefinition): string {
    const { spec } = def;
    return this.#renderLeaf({
      path: spec.path,
      summary: spec.summary,
      description: spec.description,
      network: spec.network,
      auth: spec.auth,
      wallet: spec.wallet,
      broadcasts: spec.broadcasts,
      rejectsWait: spec.rejectsWait,
      fields: introspectFields(mergedFields(def)),
      fieldFamilies: fieldFamilies(def),
      inputFlags: spec.stdin ? inputFlagsFor(spec) : [],
      stdinFamily: spec.stdinFamily,
      exclusive: spec.exclusive,
      examples: spec.examples,
      requires: spec.requires,
      positionals: spec.positionals,
      interactive: spec.interactive,
    });
  }

  #renderLeaf(c: {
    path: string[];
    summary?: string;
    description?: string;
    network: ChainSpec["network"] | "none";
    auth: CommandDefinition["auth"];
    wallet: CommandDefinition["wallet"];
    broadcasts?: boolean;
    rejectsWait?: string;
    fields: FieldInfo[];
    fieldFamilies?: Map<string, ChainFamily>;
    inputFlags: readonly GlobalFlag[];
    stdinFamily?: ChainFamily;
    exclusive?: ChainSpec["exclusive"];
    examples: CommandDefinition["examples"];
    requires?: string[];
    requiresAfterAuth?: string[];
    positionals?: { field: string; placeholder?: string }[];
    secretsTtyOnly?: boolean;
    interactive?: boolean;
  }): string {
    const positionals = (c.positionals ?? []).map((p) => {
      const field = c.fields.find((f) => f.name === p.field);
      const name = p.placeholder ?? p.field;
      const required = field ? !field.optional && !field.hasDefault : false;
      return { name, required, description: field?.description ?? "" };
    });
    const usagePositional = positionals
      .map((p) => (p.required ? ` <${p.name}>` : ` [<${p.name}>]`))
      .join("");
    const lines = ["Usage:", `  wallet-cli ${c.path.join(" ")}${usagePositional} [options]`];
    const description = c.description ?? c.summary;
    if (description) lines.push("", description);

    if (positionals.length) {
      lines.push("", "Args:");
      const width = Math.min(34, Math.max(...positionals.map((p) => p.name.length)));
      for (const p of positionals)
        lines.push(`  ${p.name.padEnd(width)}  ${p.description}`.trimEnd());
    }

    const requires: string[] = [...(c.requires ?? [])];
    if (c.auth === "required") {
      requires.push(
        c.secretsTtyOnly
          ? "the master password — entered interactively in a TTY"
          : c.interactive
            ? "the master password — pass --password-stdin, or enter it interactively in a TTY"
            : "the master password — pass --password-stdin; this command never prompts",
      );
      requires.push(...(c.requiresAfterAuth ?? []));
    } else if (c.auth === "conditional") {
      requires.push(
        "the master password only when the selected mode signs — pass --password-stdin then; other modes need no password",
      );
    }
    if (c.wallet !== "none")
      requires.push(
        "an account — defaults to active; override with --account <accountId|label> (or run `wallet-cli use <account>` to change the active account)",
      );
    if (requires.length) {
      lines.push("", "Requires:");
      for (const r of requires) lines.push(`  ${r}`);
    }

    const posNames = new Set((c.positionals ?? []).map((p) => p.field));
    const flagFields = posNames.size ? c.fields.filter((f) => !posNames.has(f.name)) : c.fields;
    const optionRows: OptionRow[] = [
      ...flagFields.map((f) => {
        const family = c.fieldFamilies?.get(f.name);
        return {
          key: f.kebab,
          head: flagHead(f),
          desc: f.description ?? "",
          tag: flagTag(f),
          ...(family ? { familyTag: `(${family.toUpperCase()} only)` } : {}),
        };
      }),
      ...c.inputFlags.map((g) => ({
        key: g.flag.replace(/^--/, ""),
        head: globalFlagHead(g),
        desc: g.description,
        tag: globalFlagTag(g),
        ...(c.stdinFamily ? { familyTag: `(${c.stdinFamily.toUpperCase()} only)` } : {}),
      })),
    ];
    if (optionRows.length) {
      const width = Math.min(34, Math.max(...optionRows.map((r) => r.head.length)));
      // Family tags survive exclusive groups even when optional tags are omitted.
      const rowLine = (r: OptionRow, tag: string): string => {
        const tags = [tag, r.familyTag].filter(Boolean).join("  ");
        return `  ${r.head.padEnd(width)}  ${r.desc}${r.desc && tags ? "  " : ""}${tags}`.trimEnd();
      };
      // Exactly-one groups omit per-member optional tags to avoid implying all may be omitted.
      const grouped = new Set<string>();
      const blocks: string[][] = [];
      for (const group of c.exclusive ?? []) {
        // A missing member is a spec error; do not silently hide the constraint.
        const members = group.flags.map((flag) => {
          const row = optionRows.find((r) => r.key === flag);
          if (!row)
            throw new Error(
              `exclusive group "${group.label}" names unknown flag --${flag} on ${c.path.join(" ")}`,
            );
          return row;
        });
        if (members.length < 2) continue;
        for (const m of members) grouped.add(m.key);
        const atMostOne = group.select === "at-most-one";
        blocks.push([
          `  ${atMostOne ? "At most one" : "Exactly one"} of these — ${group.label}:`,
          ...members.map((m) => rowLine(m, atMostOne ? m.tag : "")),
        ]);
      }
      const rest = optionRows.filter((r) => !grouped.has(r.key)).map((r) => rowLine(r, r.tag));
      if (rest.length) blocks.push(rest);
      lines.push("", "Options:", ...blocks.flatMap((block, i) => (i ? ["", ...block] : block)));
    }

    lines.push("", "Global options:");
    for (const g of globalFlagsForText(
      c.network,
      c.auth,
      c.wallet,
      acceptsWaitFlags(c),
      c.secretsTtyOnly ?? false,
    ))
      lines.push(globalFlagLine(g));

    if (c.examples.length) {
      lines.push("", "Examples:");
      for (const e of c.examples) lines.push(`  ${e.cmd}${e.note ? `   # ${e.note}` : ""}`);
    }
    return lines.join("\n");
  }

  #chainGroups(): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of this.registry.all()) {
      const group = isChainCommand(c) ? c.spec.path[0] : undefined;
      if (group && !seen.has(group)) {
        seen.add(group);
        out.push(group);
      }
    }
    return out;
  }

  #isChainGroup(group: string): boolean {
    return this.#chainGroups().includes(group);
  }

  #chainGroupCommands(
    group: string,
  ): Array<{ path: string[]; summary?: string; families: string[] }> {
    const out: Array<{ path: string[]; summary?: string; families: string[] }> = [];
    for (const c of this.registry.all()) {
      if (isChainCommand(c) && c.spec.path[0] === group) {
        out.push({
          path: c.spec.path,
          summary: c.spec.summary,
          families: Object.entries(c.families)
            .filter(([, binding]) => binding !== undefined)
            .map(([family]) => family),
        });
      }
    }
    return out;
  }

  #neutralGroupCommands(head: string): CommandDefinition[] {
    return this.registry
      .all()
      .filter(
        (c): c is CommandDefinition =>
          !isChainCommand(c) && c.path[0] === head && c.path.length > 1,
      );
  }

  #isNeutralGroup(head: string): boolean {
    return this.#neutralGroupCommands(head).length > 0;
  }

  #catalog(familyFilter?: ChainFamily): string {
    return buildCatalog(this.registry, this.version, familyFilter, this.capabilities);
  }
}

// Help lists all families regardless of --network; shared fields must stay untagged.
function fieldFamilies(def: ChainCommandDefinition): Map<string, ChainFamily> {
  const owners = new Map<string, ChainFamily[]>();
  for (const [family, binding] of Object.entries(def.families) as [
    ChainFamily,
    ChainCommandDefinition["families"][ChainFamily],
  ][]) {
    for (const name of Object.keys(binding?.fields?.shape ?? {})) {
      owners.set(name, [...(owners.get(name) ?? []), family]);
    }
  }
  const shared = new Set(Object.keys(def.spec.baseFields.shape));
  return new Map(
    [...owners]
      .filter(([name, families]) => families.length === 1 && !shared.has(name))
      .map(([name, families]) => [name, families[0]!]),
  );
}

function metaPositionals(tokens: string[]): string[] {
  const valueFlags = new Set(
    GLOBAL_FLAGS.filter((flag) => flag.type !== "boolean").flatMap((flag) =>
      [flag.flag, flag.alias].filter((name): name is string => name !== undefined),
    ),
  );
  const positionals: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.startsWith("-")) {
      if (valueFlags.has(token)) i += 1;
      continue;
    }
    positionals.push(token);
  }
  return positionals;
}

// key is the kebab-case flag name used by exclusive groups.
interface OptionRow {
  key: string;
  head: string;
  desc: string;
  tag: string;
  familyTag?: string;
}

function flagHead(f: FieldInfo): string {
  const typ = f.choices
    ? ` <${f.choices.join("|")}>`
    : f.baseType === "boolean"
      ? ""
      : ` <${f.baseType}>`;
  return `--${f.kebab}${typ}`;
}

function flagTag(f: FieldInfo): string {
  if (!f.optional && !f.hasDefault) return "[required]";
  if (f.hasDefault) return `[optional, default: ${formatDefault(f.defaultValue)}]`;
  return "[optional]";
}

function formatDefault(v: unknown): string {
  if (typeof v === "string") return v === "" ? '""' : v;
  return String(v);
}

function globalFlagsForText(
  network: ChainSpec["network"] | "none",
  auth: CommandDefinition["auth"],
  wallet: CommandDefinition["wallet"],
  acceptsWait: boolean,
  secretsTtyOnly: boolean,
): GlobalFlag[] {
  return GLOBAL_FLAGS.filter((g) => {
    if (g.flag === "--account") return wallet !== "none";
    if (g.flag === "--network") return network !== "none";
    if (g.flag === "--password-stdin") return auth !== "none" && !secretsTtyOnly;
    if (g.flag === "--wait" || g.flag === "--no-wait") return acceptsWait;
    return true;
  });
}

function groupRowTag(families: readonly string[]): string {
  return families.length === 1 ? families[0]! : "";
}

function globalFlagLine(g: GlobalFlag): string {
  const tag = globalFlagTag(g);
  return `  ${globalFlagHead(g).padEnd(26)} ${g.description}${g.description && tag ? "  " : ""}${tag}`.trimEnd();
}

const GROUP_DESCRIPTIONS: Record<string, string> = {
  import: "Import a wallet.",
  account: "Query on-chain account state.",
  token: "Manage the token address book and query tokens.",
  tx: "Build, send, broadcast, and inspect transactions.",
  contract: "Call, deploy, govern, and inspect smart contracts.",
  proposal: "Create, approve, delete, and query on-chain governance proposals.",
  witness: "Register and operate a super representative candidacy.",
  gasfree:
    "Gas-free token transfers via the GasFree service (open.gasfree.io).\nFees are charged in the transferred token — a per-transfer service fee, plus a one-time\nactivation fee on the first transfer from an inactive GasFree address — so no TRX is needed.\nRequires API credentials (config gasfreeApiKey / gasfreeApiSecret).",
  sunswap:
    "Add, remove and collect fees on SunSwap liquidity, and look up pools, positions and prices.",
  sunpump: "Buy and sell SunPump tokens on their bonding curve, before they launch onto SunSwap.",
  stake: "Stake / delegate resources & query state (TRON Stake 2.0).",
  vote: "Vote for super representatives (SR).\nVoting accrues rewards — query and claim them with 'wallet-cli reward'.",
  reward: "Query and withdraw voting/block rewards.",
  // The fee varies by network and chain parameters.
  permission:
    "View and update account permissions (TRON multi-sign).\nAn account has one owner permission (full control), up to 8 active permissions (scoped operations),\nand — for SRs — one witness permission. Replacing the structure burns a chain-set fee (100 TRX on mainnet).\nMisconfiguring owner permission can permanently lock the account.",
  chain: "Query chain and node state.",
  message: "Sign arbitrary messages.",
  "typed-data": "Sign EIP-712 / TIP-712 structured data.",
  asset: "Issue and manage TRC10 tokens.",
  exchange: "Create and trade Bancor exchange pairs.",
  block: "Get a block (latest if omitted).",
  encoding: "Convert and validate addresses and encodings across formats.",
  address: "Generate a random secp256k1 keypair locally without storing it in the wallet.",
  contact: "Manage the recipient address book.",
  bai: "Query B.AI account credits, usage records, and recharge orders.",
  "8004": "Read and manage ERC-8004 Agent identities on supported networks.",
  x402: "Pay x402 endpoints and inspect the provider catalog.",
};

function globalFlagHead(g: GlobalFlag): string {
  const head = g.alias ? `${g.flag}, ${g.alias}` : g.flag;
  const typ = g.type === "boolean" ? "" : ` <${g.values ? g.values.join("|") : g.type}>`;
  return `${head}${typ}`;
}

function globalFlagTag(g: GlobalFlag): string {
  if (g.defaultValue !== undefined) return `[optional, default: ${formatDefault(g.defaultValue)}]`;
  return "[optional]";
}

function colorOn(): boolean {
  return !!process.stdout.isTTY && !process.env.NO_COLOR;
}
function bold(s: string): string {
  return colorOn() ? `\x1b[1m${s}\x1b[0m` : s;
}
function dim(s: string): string {
  return colorOn() ? `\x1b[2m${s}\x1b[0m` : s;
}
