/**
 * HelpService — --help / --version / --json-schema. Zod-driven: every flag's help,
 * required/optional/default, examples, and the agent JSON-schema come from the command's
 * zod fields/input; one schema supplies validation, types, help, and agent schema.
 *
 * Two command kinds, discriminated by `family`: neutral (full path) and chain (logical path,
 * per-family impls). A leading family token (e.g. tron) is an optional addressing prefix here.
 */
import { z, type ZodObject, type ZodRawShape } from "zod";
import type { ChainFamily, ExitCode } from "../../../../domain/types/index.js";
import { isChainCommand } from "../contracts/index.js";
import type {
  ChainCommandDefinition,
  ChainSpec,
  CommandDefinition,
  StoredCommand,
  StreamManager,
} from "../contracts/index.js";
import { CommandRegistry } from "../registry/index.js";
import { UsageError } from "../../../../domain/errors/index.js";
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
      // no path → machine catalog (every command + flags), optionally scoped to a chain family
      // (`tron --json-schema`). Mirrors the help tree.
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
    if (!family && path.length === 1 && this.#isNeutralGroup(path[0]!)) {
      this.streams.result(this.#renderNeutralGroup(path[0]!));
      return 0;
    }
    this.#assertResolvable(family, path);
    this.streams.result(this.#renderTree(path[0]));
    return 0;
  }

  /**
   * A path that names nothing is an error here, exactly as it is at dispatch.
   *
   * Before this, ANY unresolved path fell through to the root listing (or the full catalog) and
   * returned 0 — so `wallet-cli tx snd --help` answered a question nobody asked and called it
   * success. A typo has to fail the same way with `--help` on the line as without it, or the
   * meta flags become a hole in the CLI's own exit-code contract.
   */
  #assertResolvable(family: ChainFamily | undefined, path: string[]): void {
    if (path.length === 0) return;
    const head = path[0]!;
    // A bare group name is legitimate — that is what renders the group page.
    if (path.length === 1 && (this.#isChainGroup(head) || this.#isNeutralGroup(head))) return;

    // Distinguish "no such command" from "that command exists, just not for this family":
    // the second is what a family-prefixed query (`evm account history --help`) really hit,
    // and answering it with unknown_command would send the reader looking for a typo.
    if (family && this.registry.resolveChain(path)) {
      throw new UsageError("family_mismatch", `${path.join(" ")} has no ${family} implementation`);
    }
    throw new UsageError("unknown_command", `unknown command: ${path.join(" ")}`);
  }

  /** strip an optional leading family token (e.g. tron) — a help/catalog addressing prefix. */
  #split(positionals: string[]): { family?: ChainFamily; path: string[] } {
    const head = positionals[0];
    if (head && (this.registry.families() as string[]).includes(head)) {
      return { family: head as ChainFamily, path: positionals.slice(1) };
    }
    return { path: positionals };
  }

  /**
   * Resolve to a single command: the LONGEST prefix of the path that names one.
   *
   * People reach help by appending --help to the line they were already typing, so the path
   * still carries arguments: `tx send --to T... --help` arrives as ["tx","send","T..."] because
   * `metaPositionals` only knows which GLOBAL flags consume a value, and positionals
   * (`block 123`, `contract clear-abi TQ5...`) are genuinely part of the path. Everything past
   * the command is an argument, so the prefix is what we resolve.
   *
   * A prefix that names only a GROUP does not count — otherwise `tx bogus` would resolve to
   * `tx` and a mistyped verb would silently get someone else's help page.
   */
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

  /** top-level overview: first release presents TRON as the product surface.
   * Docker-style three groups: Common (high-frequency entry points) / Management (on-chain resource
   * nouns) / Commands (local governance). */
  #renderRoot(): string {
    const common = [
      ["create", "Create a new HD wallet (BIP39 seed)", ""],
      ["import", "Import a wallet", ""],
      ["list", "List wallets / accounts", ""],
    ] as const;
    // Rows, order and wording follow the §10.2 spec block, with two deliberate departures
    // recorded in needs-doc §U-3: `exchange` keeps a verb phrase (the spec's "On-chain Bancor
    // exchange" is a noun phrase, which §10.1 rule 1 forbids), and `contract` keeps "govern"
    // (the spec's "send" drops any mention of the four governance sub-commands).
    // Descriptions are verb summaries and must NOT name sub-commands — a TRON-only verb named
    // here (`chain`'s old "params") sends EVM readers hunting for a command they cannot run.
    const management = [
      ["account", "Query on-chain account state", ""],
      ["permission", "View / update account permissions (multi-sig)", "tron"],
      ["token", "Manage the token address book and query tokens", ""],
      ["tx", "Build, send, broadcast, and inspect transactions", ""],
      ["gasfree", "Gas-free token transfers via the GasFree service", "tron"],
      ["contract", "Call, deploy, govern, and inspect smart contracts", ""],
      ["proposal", "Create / vote on governance proposals", "tron"],
      ["witness", "Register / operate a super representative", "tron"],
      ["asset", "Issue & manage TRC10 tokens", "tron"],
      ["exchange", "Create and trade Bancor exchange pairs", "tron"],
      ["stake", "Stake / delegate resources & query state", "tron"],
      ["vote", "Vote for super representatives", "tron"],
      ["reward", "Query / withdraw voting rewards", "tron"],
      // No (tron) tag: `chain node` and `chain prices` both serve EVM. Only `chain params`
      // is TRON-only, and that difference belongs on the sub-command row in the group help.
      ["chain", "Query chain and node state", ""],
      ["message", "Sign arbitrary messages", ""],
      ["typed-data", "Sign EIP-712 / TIP-712 structured data", ""],
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
      ["change-password", "Change the master password (re-encrypt keystores)", ""],
      ["encoding", "Convert / validate addresses & encodings", ""],
      ["address", "Generate a random keypair (local, not stored)", ""],
      ["contact", "Manage the recipient address book", ""],
    ] as const;
    const sections = [common, management, commands] as const;
    const nameWidth = Math.max(...sections.flat().map(([name]) => name.length)) + 2;
    // chain-only groups carry a right-hand (family) tag; align it past the widest description.
    const tagCol = Math.max(...sections.flat().map(([, desc]) => desc.length)) + 2;
    const commandRow = (name: string, desc: string, tag: string): string => {
      const body = `  ${name.padEnd(nameWidth)}${dim(desc)}`;
      return tag
        ? `${body}${" ".repeat(Math.max(2, tagCol - desc.length))}(${tag})`
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
      ["--timeout int", "Request timeout in milliseconds"],
      ["-v, --verbose", "Verbose / debug logging"],
      ["-h, --help", "Show help"],
      ["-V, --version", "Print version information and quit"],
    ] as const;
    const optionRow = row(Math.max(...optionRows.map(([name]) => name.length)) + 2);

    // Usage first, description after; root Usage is the inline form.
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

  /** neutral group (`import --help`): list the group's sub-commands. Derived from the registry.
   *  Neutral commands are not chain-bound at all, so no row carries a family tag. */
  #renderNeutralGroup(head: string): string {
    const cmds = this.#neutralGroupCommands(head);
    const rows = cmds.map((c) => [c.path[1] ?? "", c.summary ?? "", ""] as const);
    return this.#renderGroup(head, rows);
  }

  /** logical resource group (`account --help`): default surface, implementations chosen by --network/defaultNetwork. */
  #renderLogicalNs(group: string): string {
    const commands = this.#chainGroupCommands(group);
    const tags = commands.map((c) => groupRowTag(c.families));
    // A group whose every command belongs to the same single family is already tagged as a whole
    // at the root (`stake … (tron)`). Repeating it on all six rows adds a column that never
    // varies — §10.3: "其組 help 內部不再逐條重複". Tag rows only where they DISCRIMINATE.
    const uniform = tags.length > 0 && tags.every((t) => t !== "" && t === tags[0]);
    const rows = commands.map(
      (c, i) => [c.path[1] ?? "", c.summary ?? "", uniform ? "" : tags[i]!] as const,
    );
    return this.#renderGroup(group, rows);
  }

  /** shared group skeleton: inline Usage → description → verb list → footer. */
  #renderGroup(group: string, rows: ReadonlyArray<readonly [string, string, string]>): string {
    // Width is the longest verb, uncapped: a cap cannot shorten an over-long verb, it only stops
    // padEnd from reaching it — so every summary in the group loses its column the moment one verb
    // exceeds the cap (`contract set-user-resource-percent`, 25 chars, did exactly that).
    const width = Math.max(0, ...rows.map(([verb]) => verb.length)) + 2;
    // Family tags share one column, aligned past the widest summary, so they read as a column
    // rather than as trailing prose. Two spaces minimum, matching the leaf Options tags.
    const tagCol = Math.max(0, ...rows.map(([, summary]) => summary.length)) + 2;
    const lines = [`${bold("Usage:")}  wallet-cli ${group} COMMAND`, ""];
    const desc = GROUP_DESCRIPTIONS[group];
    if (desc) lines.push(desc, "");
    lines.push(bold("Commands:"));
    for (const [verb, summary, tag] of rows) {
      const body = `  ${verb.padEnd(width)} ${summary}`;
      lines.push(
        tag ? `${body}${" ".repeat(Math.max(2, tagCol - summary.length))}(${tag})` : body.trimEnd(),
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

  /** shared leaf skeleton: Usage → description → Requires → Options (incl. stdin channel) → Global options → Examples. */
  #renderLeaf(c: {
    path: string[];
    summary?: string;
    description?: string;
    network: ChainSpec["network"] | "none";
    auth: CommandDefinition["auth"];
    wallet: CommandDefinition["wallet"];
    broadcasts?: boolean;
    fields: FieldInfo[];
    /** family-specific flags, so each can be marked with the family it belongs to. */
    fieldFamilies?: Map<string, ChainFamily>;
    inputFlags: readonly GlobalFlag[];
    /** family that owns the stdin channel, when only one family reads it. */
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
    // leaf description: prefer the fuller multi-line `description` when a command declares one,
    // else fall back to the one-line `summary` used in the parent group's listing.
    const description = c.description ?? c.summary;
    if (description) lines.push("", description);

    if (positionals.length) {
      lines.push("", "Args:");
      const width = Math.min(34, Math.max(...positionals.map((p) => p.name.length)));
      for (const p of positionals)
        lines.push(`  ${p.name.padEnd(width)}  ${p.description}`.trimEnd());
    }

    const requires: string[] = [...(c.requires ?? [])];
    // A command only prompts when it opts in (`interactive`); everything else fails fast so
    // scripts and agents get a deterministic error instead of a hung prompt. Say which one this
    // is — promising a TTY prompt that never comes sends the reader hunting for a broken terminal.
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

    // positional fields are documented under Args, not repeated as --flags. A command's stdin channel
    // (--*-stdin) is a command-specific option too, so it renders inline under Options — not a section
    // of its own. (The machine --json-schema catalog still keeps inputFlags as a distinct key.)
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
          ...(family ? { familyTag: `(${family})` } : {}),
        };
      }),
      ...c.inputFlags.map((g) => ({
        key: g.flag.replace(/^--/, ""),
        head: globalFlagHead(g),
        desc: g.description,
        tag: globalFlagTag(g),
        ...(c.stdinFamily ? { familyTag: `(${c.stdinFamily})` } : {}),
      })),
    ];
    if (optionRows.length) {
      const width = Math.min(34, Math.max(...optionRows.map((r) => r.head.length)));
      // Two independent tags: "[optional]" says whether the flag may be omitted, "(tron)" says
      // which family reads it. They are joined here so the family tag survives on its own in an
      // exclusive block, where the optional tag is deliberately dropped.
      const rowLine = (r: OptionRow, tag: string): string => {
        const tags = [tag, r.familyTag].filter(Boolean).join("  ");
        return `  ${r.head.padEnd(width)}  ${r.desc}${r.desc && tags ? "  " : ""}${tags}`.trimEnd();
      };
      // an exclusive set renders as its own labelled block, ahead of the free-standing options.
      // A jointly-required set drops the per-member "[optional]" tag: individually true, but read
      // together it says the whole set may be omitted — which is exactly what the runtime rejects.
      // An "at-most-one" set genuinely may be omitted, so its members keep their tags.
      const grouped = new Set<string>();
      const blocks: string[][] = [];
      for (const group of c.exclusive ?? []) {
        // Resolving by kebab flag name means a stale or mistyped member would just disappear,
        // leaving help that silently omits the constraint. Fail loudly — only a spec can be wrong
        // here, never user input.
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
    // curated per command: --network only when the command selects a network; --password-stdin
    // only when it requires unlock; --account only when the command acts as an account.
    for (const g of globalFlagsForText(
      c.network,
      c.auth,
      c.wallet,
      c.broadcasts ?? false,
      c.secretsTtyOnly ?? false,
    ))
      lines.push(globalFlagLine(g));

    if (c.examples.length) {
      lines.push("", "Examples:");
      for (const e of c.examples) lines.push(`  ${e.cmd}${e.note ? `   # ${e.note}` : ""}`);
    }
    return lines.join("\n");
  }

  /** chain groups = first path segment of every assembled chain command. */
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

  /** chain group sub-commands, one row per logical chain definition. */
  #chainGroupCommands(
    group: string,
  ): Array<{ path: string[]; summary?: string; families: string[] }> {
    const out: Array<{ path: string[]; summary?: string; families: string[] }> = [];
    for (const c of this.registry.all()) {
      if (isChainCommand(c) && c.spec.path[0] === group) {
        out.push({
          path: c.spec.path,
          summary: c.spec.summary,
          // Which families actually have a binding — the tag is DERIVED from that, never
          // hand-written, so it disappears on its own the day the second family is bound.
          families: Object.entries(c.families)
            .filter(([, binding]) => binding !== undefined)
            .map(([family]) => family),
        });
      }
    }
    return out;
  }

  /** neutral groups = heads of neutral commands that have sub-verbs (e.g. import). */
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

  /** machine-readable catalog of the whole command surface — the agent's single discovery call. */
  #catalog(familyFilter?: ChainFamily): string {
    return buildCatalog(this.registry, this.version, familyFilter);
  }
}

function mergedFields(def: ChainCommandDefinition, family?: ChainFamily): ZodObject<ZodRawShape> {
  let shape = { ...def.spec.baseFields.shape };
  const bindings = family ? [def.families[family]] : Object.values(def.families);
  for (const b of bindings) if (b?.fields) shape = { ...shape, ...b.fields.shape };
  return z.object(shape);
}

/**
 * Which family a flag belongs to, for the flags that belong to exactly one.
 *
 * Help is static — `--network` does not shape it — so every family's flags are listed together
 * and each says who it is for. A flag declared by more than one family, or present in
 * baseFields, is shared: tagging it would imply a restriction that does not exist.
 */
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

/** "--flag <type>" header for a command flag — enum fields list their choices instead of <enum>. */
/** one rendered Options row; `key` is the kebab flag name an ExclusiveGroup refers to. */
interface OptionRow {
  key: string;
  head: string;
  desc: string;
  /** "[optional]" / "[required]" — dropped inside a jointly-required exclusive block. */
  tag: string;
  /** "(tron)" — which family reads this flag; independent of `tag`, so it survives that block. */
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

// Per-command "Global options" projection: output/timeout/verbose always; --network only when the
// command selects a network; --password-stdin when it may unlock; --wait/--wait-timeout
// only for ✍️ broadcast commands; --account only when the command acts as an account (also surfaced,
// with fuller semantics, under Requires). The full GLOBAL_FLAGS array still backs the --json-schema catalog.
function globalFlagsForText(
  network: ChainSpec["network"] | "none",
  auth: CommandDefinition["auth"],
  wallet: CommandDefinition["wallet"],
  broadcasts: boolean,
  secretsTtyOnly: boolean,
): GlobalFlag[] {
  return GLOBAL_FLAGS.filter((g) => {
    if (g.flag === "--account") return wallet !== "none";
    if (g.flag === "--network") return network !== "none";
    if (g.flag === "--password-stdin") return auth !== "none" && !secretsTtyOnly;
    if (g.flag === "--wait" || g.flag === "--wait-timeout") return broadcasts;
    return true;
  });
}

/**
 * The `(tron)` / `(evm)` tag for one sub-command row in a group help page.
 *
 * §10.1: the tag means "only this family can serve this command IN THE CURRENT VERSION" — it is
 * not a promise about the future. So it is derived from the registry rather than written down:
 * a command bound to exactly one family is tagged, one bound to both is not, and the tag drops
 * off by itself the day the missing binding lands (`contract info` will, once EVM gets an
 * indexer). Hand-written tags are how `chain` came to be labelled `(tron)` at the root long
 * after `chain node` and `chain prices` started serving EVM.
 */
function groupRowTag(families: readonly string[]): string {
  return families.length === 1 ? families[0]! : "";
}

/** one rendered "  --flag <type>   description  [tag]" line, used by the Global options section. */
function globalFlagLine(g: GlobalFlag): string {
  const tag = globalFlagTag(g);
  return `  ${globalFlagHead(g).padEnd(26)} ${g.description}${g.description && tag ? "  " : ""}${tag}`.trimEnd();
}

// Group descriptions, keyed by the registry group head. Usually one line; a group whose
// behavior warrants it may span multiple lines (embed "\n"). Only groups that surface a
// `<group> --help` page need an entry; absent → the description line is omitted.
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
  stake: "Stake / delegate resources & query state (TRON Stake 2.0).",
  vote: "Vote for super representatives (SR).\nVoting accrues rewards — query and claim them with 'wallet-cli reward'.",
  reward: "Query and withdraw voting/block rewards.",
  // The fee is a chain parameter read live at run time (getUpdateAccountPermissionFee), so it is
  // pinned to mainnet rather than stated as an absolute.
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
