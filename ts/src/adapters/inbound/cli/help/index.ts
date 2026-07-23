/**
 * HelpService — --help / --version / --json-schema. Zod-driven: every flag's help,
 * required/optional/default, examples, and the agent JSON-schema come from the command's
 * zod fields/input; one schema supplies validation, types, help, and agent schema.
 *
 * Two command kinds, discriminated by `family`: neutral (full path) and chain (logical path,
 * per-family impls). A leading family token (e.g. tron) is an optional addressing prefix here.
 */
import { z, type ZodObject, type ZodRawShape } from "zod"
import type { ChainFamily, ExitCode } from "../../../../domain/types/index.js"
import { isChainCommand } from "../contracts/index.js"
import type { ChainCommandDefinition, ChainSpec, CommandDefinition, StoredCommand, StreamManager } from "../contracts/index.js"
import { CommandRegistry } from "../registry/index.js"
import { introspectFields, type FieldInfo } from "../arity/index.js"
import { GLOBAL_FLAGS, type GlobalFlag, inputFlagsFor, buildCatalog } from "./catalog.js"

const META = new Set(["--help", "-h", "--version", "-V", "--json-schema"])

export function hasMeta(tokens: string[]): boolean {
  return tokens.some((t) => META.has(t))
}

export class HelpService {
  constructor(
    private readonly registry: CommandRegistry,
    private readonly streams: StreamManager,
    private readonly version: string,
  ) {}

  handleMeta(tokens: string[]): ExitCode {
    if (tokens.includes("--version") || tokens.includes("-V")) {
      this.streams.result(this.version)
      return 0
    }
    const positionals = metaPositionals(tokens)
    const { family, path } = this.#split(positionals)
    const concrete = this.#resolveConcrete(family, path)

    if (tokens.includes("--json-schema")) {
      if (concrete) {
        const input = isChainCommand(concrete) ? mergedFields(concrete) : concrete.input
        this.streams.result(JSON.stringify(z.toJSONSchema(input)))
        return 0
      }
      // no concrete command → machine catalog (every command + flags), optionally scoped to a
      // chain family (`tron --json-schema`). Mirrors the help tree.
      this.streams.result(this.#catalog(family))
      return 0
    }

    if (concrete) {
      this.streams.result(isChainCommand(concrete) ? this.#renderChainCommand(concrete) : this.#renderCommand(concrete))
      return 0
    }
    if (!family && path.length === 1 && this.#isNeutralGroup(path[0]!)) {
      this.streams.result(this.#renderNeutralGroup(path[0]!))
      return 0
    }
    this.streams.result(this.#renderTree(path[0]))
    return 0
  }

  /** strip an optional leading family token (e.g. tron) — a help/catalog addressing prefix. */
  #split(positionals: string[]): { family?: ChainFamily; path: string[] } {
    const head = positionals[0]
    if (head && (this.registry.families() as string[]).includes(head)) {
      return { family: head as ChainFamily, path: positionals.slice(1) }
    }
    return { path: positionals }
  }

  /** resolve to a single command: a neutral command by full path, or a family-pinned chain command. */
  #resolveConcrete(family: ChainFamily | undefined, path: string[]): StoredCommand | null {
    if (path.length === 0) return null
    const chain = this.registry.resolveChain(path)
    if (chain && (!family || chain.families[family])) return chain
    const chainHeadLeaf = this.registry.resolveChain([path[0]!])
    if (chainHeadLeaf && (!family || chainHeadLeaf.families[family])) return chainHeadLeaf
    if (family) return null
    const neutral = this.registry.resolveNeutral(path)
    if (neutral) return neutral
    return null
  }

  #renderTree(head?: string): string {
    if (!head) return this.#renderRoot()
    if (this.#isChainGroup(head)) return this.#renderLogicalNs(head)
    if (this.#isNeutralGroup(head)) return this.#renderNeutralGroup(head)
    return this.#renderRoot()
  }

  /** top-level overview: first release presents TRON as the product surface.
   * Docker-style three groups: Common (高频入口) / Management (链上资源名词) / Commands (本机治理). */
  #renderRoot(): string {
    const common = [
      ["create", "Create a new HD wallet (BIP39 seed)", ""],
      ["import", "Import a wallet", ""],
      ["list", "List wallets / accounts", ""],
    ] as const
    const management = [
      ["account", "Query on-chain account state, activate & name accounts", ""],
      ["permission", "View and update account multi-sign permissions", "tron"],
      ["token", "Manage the token address book and query tokens", ""],
      ["tx", "Build, send, broadcast, co-sign, and inspect transactions", ""],
      ["gasfree", "Gas-free token transfers via the GasFree service", "tron"],
      ["contract", "Call, send, deploy, and inspect smart contracts", ""],
      ["stake", "Stake / delegate resources & query state", "tron"],
      ["vote", "Vote for super representatives", "tron"],
      ["reward", "Query / withdraw voting rewards", "tron"],
      ["chain", "Query chain params, prices & node info", ""],
      ["message", "Sign arbitrary messages", ""],
      ["typed-data", "Sign EIP-712 / TIP-712 structured data", ""],
      ["block", "Get a block (latest if omitted)", ""],
    ] as const
    const commands = [
      ["use", "Set the active account", ""],
      ["current", "Show the current account (--qr for a receive QR code)", ""],
      ["rename", "Rename an account label", ""],
      ["derive", "Derive the next HD account from a seed wallet", ""],
      ["backup", "Export an account's secret + metadata (0600)", ""],
      ["delete", "Delete a wallet / account", ""],
      ["config", "Show / get / set configuration values", ""],
      ["networks", "List known networks", ""],
      ["change-password", "Change the master password (re-encrypt keystores)", ""],
      ["encoding", "Convert / validate addresses & encodings across formats", ""],
      ["address", "Generate a random keypair (local, not stored)", ""],
      ["contact", "Manage the recipient address book", ""],
    ] as const
    const sections = [common, management, commands] as const
    const nameWidth = Math.max(...sections.flat().map(([name]) => name.length)) + 2
    // chain-only groups carry a right-hand (family) tag; align it past the widest description.
    const tagCol = Math.max(...sections.flat().map(([, desc]) => desc.length)) + 2
    const commandRow = (name: string, desc: string, tag: string): string => {
      const body = `  ${name.padEnd(nameWidth)}${dim(desc)}`
      return tag ? `${body}${" ".repeat(Math.max(2, tagCol - desc.length))}(${tag})` : body.trimEnd()
    }
    const row =
      (width: number) =>
      (name: string, desc: string): string =>
        `  ${name.padEnd(width)}${desc ? dim(desc) : ""}`.trimEnd()
    const optionRows = [
      ["-o, --output string", 'Output format ("text", "json") (default from config)'],
      ["--network string", 'Canonical network id, e.g. "tron:mainnet", "tron:nile", "tron:shasta"'],
      ["--account string", "Account label or address to act as (overrides active)"],
      ["--timeout int", "Request timeout in milliseconds"],
      ["-v, --verbose", "Verbose / debug logging"],
      ["-h, --help", "Show help"],
      ["-V, --version", "Print version information and quit"],
    ] as const
    const optionRow = row(Math.max(...optionRows.map(([name]) => name.length)) + 2)

    // Usage first, description after (: 描述统一在 Usage 之后); root Usage is the inline form.
    const lines = [
      `${bold("Usage:")}  wallet-cli [OPTIONS] COMMAND`,
      "",
      `${bold("wallet-cli")} — CLI wallet for TRON.`,
      "Agent-first: deterministic exit codes, JSON output.",
      "",
      bold("Common Commands:"),
    ]
    for (const [name, desc, tag] of common) lines.push(commandRow(name, desc, tag))

    lines.push("", bold("Management Commands:"))
    for (const [name, desc, tag] of management) lines.push(commandRow(name, desc, tag))

    lines.push("", bold("Commands:"))
    for (const [name, desc, tag] of commands) lines.push(commandRow(name, desc, tag))

    lines.push("", bold("Global Options:"))
    for (const [name, desc] of optionRows) lines.push(optionRow(name, desc))
    lines.push("", "Run 'wallet-cli COMMAND --help' for more information on a command.")
    return lines.join("\n")
  }

  /** neutral group (`import --help`): list the group's sub-commands. Derived from the registry. */
  #renderNeutralGroup(head: string): string {
    const cmds = this.#neutralGroupCommands(head)
    const rows = cmds.map((c) => [c.path[1] ?? "", c.summary ?? ""] as const)
    return this.#renderGroup(head, rows, 1000)
  }

  /** logical resource group (`account --help`): default surface, implementations chosen by --network/defaultNetwork. */
  #renderLogicalNs(group: string): string {
    const commands = this.#chainGroupCommands(group)
    const rows = commands.map((c) => [c.path[1] ?? "", c.summary ?? ""] as const)
    return this.#renderGroup(group, rows, 18)
  }

  /** shared group skeleton (群组层): inline Usage → description → verb list → footer. */
  #renderGroup(group: string, rows: ReadonlyArray<readonly [string, string]>, maxWidth: number): string {
    const width = Math.min(maxWidth, Math.max(0, ...rows.map(([verb]) => verb.length)) + 2)
    const lines = [`${bold("Usage:")}  wallet-cli ${group} COMMAND`, ""]
    const desc = GROUP_DESCRIPTIONS[group]
    if (desc) lines.push(desc, "")
    lines.push(bold("Commands:"))
    for (const [verb, summary] of rows) lines.push(`  ${verb.padEnd(width)} ${summary}`.trimEnd())
    lines.push("", `Run 'wallet-cli ${group} COMMAND --help' for more information on a command.`)
    return lines.join("\n")
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
      examples: cmd.examples,
      requires: cmd.requires,
      positionals: cmd.positionals,
      secretsTtyOnly: cmd.secretsTtyOnly,
      interactive: cmd.interactive,
    })
  }

  #renderChainCommand(def: ChainCommandDefinition): string {
    const { spec } = def
    return this.#renderLeaf({
      path: spec.path,
      summary: spec.summary,
      description: spec.description,
      network: spec.network,
      auth: spec.auth,
      wallet: spec.wallet,
      broadcasts: spec.broadcasts,
      fields: introspectFields(mergedFields(def)),
      inputFlags: spec.stdin ? inputFlagsFor(spec) : [],
      examples: spec.examples,
      requires: spec.requires,
      positionals: spec.positionals,
      interactive: spec.interactive,
    })
  }

  /** shared leaf skeleton (叶子层): Usage → description → Requires → Options (incl. stdin channel) → Global options → Examples. */
  #renderLeaf(c: {
    path: string[]
    summary?: string
    description?: string
    network: ChainSpec["network"] | "none"
    auth: CommandDefinition["auth"]
    wallet: CommandDefinition["wallet"]
    broadcasts?: boolean
    fields: FieldInfo[]
    inputFlags: readonly GlobalFlag[]
    examples: CommandDefinition["examples"]
    requires?: string[]
    positionals?: { field: string; placeholder?: string }[]
    secretsTtyOnly?: boolean
    interactive?: boolean
  }): string {
    const positionals = (c.positionals ?? []).map((p) => {
      const field = c.fields.find((f) => f.name === p.field)
      const name = p.placeholder ?? p.field
      const required = field ? !field.optional && !field.hasDefault : false
      return { name, required, description: field?.description ?? "" }
    })
    const usagePositional = positionals.map((p) => (p.required ? ` <${p.name}>` : ` [<${p.name}>]`)).join("")
    const lines = ["Usage:", `  wallet-cli ${c.path.join(" ")}${usagePositional} [options]`]
    // leaf description: prefer the fuller multi-line `description` when a command declares one,
    // else fall back to the one-line `summary` used in the parent group's listing.
    const description = c.description ?? c.summary
    if (description) lines.push("", description)

    if (positionals.length) {
      lines.push("", "Args:")
      const width = Math.min(34, Math.max(...positionals.map((p) => p.name.length)))
      for (const p of positionals) lines.push(`  ${p.name.padEnd(width)}  ${p.description}`.trimEnd())
    }

    const requires: string[] = [...(c.requires ?? [])]
    // A command only prompts when it opts in (`interactive`); everything else fails fast so
    // scripts and agents get a deterministic error instead of a hung prompt. Say which one this
    // is — promising a TTY prompt that never comes sends the reader hunting for a broken terminal.
    if (c.auth === "required") requires.push(
      c.secretsTtyOnly
        ? "the master password — entered interactively in a TTY"
        : c.interactive
          ? "master password — pass --password-stdin for non-interactive use, or enter it interactively in a TTY"
          : "master password — pass --password-stdin; this command never prompts",
    )
    if (c.wallet !== "none") requires.push("an account — defaults to active; override with --account <accountId|label> (or run `wallet-cli use <account>` to change the active account)")
    if (requires.length) {
      lines.push("", "Requires:")
      for (const r of requires) lines.push(`  ${r}`)
    }

    // positional fields are documented under Args, not repeated as --flags. A command's stdin channel
    // (--*-stdin) is a command-specific option too, so it renders inline under Options — not a section
    // of its own. (The machine --json-schema catalog still keeps inputFlags as a distinct key.)
    const posNames = new Set((c.positionals ?? []).map((p) => p.field))
    const flagFields = posNames.size ? c.fields.filter((f) => !posNames.has(f.name)) : c.fields
    const optionRows: Array<{ head: string; desc: string; tag: string }> = [
      ...flagFields.map((f) => ({ head: flagHead(f), desc: f.description ?? "", tag: flagTag(f) })),
      ...c.inputFlags.map((g) => ({ head: globalFlagHead(g), desc: g.description, tag: globalFlagTag(g) })),
    ]
    if (optionRows.length) {
      const width = Math.min(34, Math.max(...optionRows.map((r) => r.head.length)))
      lines.push("", "Options:")
      for (const r of optionRows) {
        lines.push(`  ${r.head.padEnd(width)}  ${r.desc}${r.desc && r.tag ? "  " : ""}${r.tag}`.trimEnd())
      }
    }

    lines.push("", "Global options:")
    // curated per command: --network only when the command selects a network; --password-stdin
    // only when it requires unlock; --account only when the command acts as an account.
    for (const g of globalFlagsForText(c.network, c.auth, c.wallet, c.broadcasts ?? false, c.secretsTtyOnly ?? false)) lines.push(globalFlagLine(g))

    if (c.examples.length) {
      lines.push("", "Examples:")
      for (const e of c.examples) lines.push(`  ${e.cmd}${e.note ? `   # ${e.note}` : ""}`)
    }
    return lines.join("\n")
  }

  /** chain groups = first path segment of every assembled chain command. */
  #chainGroups(): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const c of this.registry.all()) {
      const group = isChainCommand(c) ? c.spec.path[0] : undefined
      if (group && !seen.has(group)) (seen.add(group), out.push(group))
    }
    return out
  }

  #isChainGroup(group: string): boolean {
    return this.#chainGroups().includes(group)
  }

  /** chain group sub-commands, one row per logical chain definition. */
  #chainGroupCommands(group: string): Array<{ path: string[]; summary?: string }> {
    const out: Array<{ path: string[]; summary?: string }> = []
    for (const c of this.registry.all()) {
      if (isChainCommand(c) && c.spec.path[0] === group) {
        out.push({ path: c.spec.path, summary: c.spec.summary })
      }
    }
    return out
  }

  /** neutral groups = heads of neutral commands that have sub-verbs (e.g. import). */
  #neutralGroupCommands(head: string): CommandDefinition[] {
    return this.registry.all().filter((c): c is CommandDefinition =>
      !isChainCommand(c) && c.path[0] === head && c.path.length > 1,
    )
  }

  #isNeutralGroup(head: string): boolean {
    return this.#neutralGroupCommands(head).length > 0
  }

  /** machine-readable catalog of the whole command surface — the agent's single discovery call. */
  #catalog(familyFilter?: ChainFamily): string {
    return buildCatalog(this.registry, this.version, familyFilter)
  }
}

function mergedFields(def: ChainCommandDefinition): ZodObject<ZodRawShape> {
  let shape = { ...def.spec.baseFields.shape }
  for (const b of Object.values(def.families)) if (b?.fields) shape = { ...shape, ...b.fields.shape }
  return z.object(shape)
}

function metaPositionals(tokens: string[]): string[] {
  const valueFlags = new Set(
    GLOBAL_FLAGS
      .filter((flag) => flag.type !== "boolean")
      .flatMap((flag) => [flag.flag, flag.alias].filter((name): name is string => name !== undefined)),
  )
  const positionals: string[] = []
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!
    if (token.startsWith("-")) {
      if (valueFlags.has(token)) i += 1
      continue
    }
    positionals.push(token)
  }
  return positionals
}

/** "--flag <type>" header for a command flag — enum fields list their choices instead of <enum>. */
function flagHead(f: FieldInfo): string {
  const typ = f.choices ? ` <${f.choices.join("|")}>` : f.baseType === "boolean" ? "" : ` <${f.baseType}>`
  return `--${f.kebab}${typ}`
}

/** "[required]" / "[optional, default: X]" / "[optional]" tag derived from the zod schema. */
function flagTag(f: FieldInfo): string {
  if (!f.optional && !f.hasDefault) return "[required]"
  if (f.hasDefault) return `[optional, default: ${formatDefault(f.defaultValue)}]`
  return "[optional]"
}

function formatDefault(v: unknown): string {
  if (typeof v === "string") return v === "" ? '""' : v
  return String(v)
}

// Per-command "Global options" projection: output/timeout/verbose always; --network only when the
// command selects a network; --password-stdin only when it requires unlock; --wait/--wait-timeout
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
    if (g.flag === "--account") return wallet !== "none"
    if (g.flag === "--network") return network !== "none"
    if (g.flag === "--password-stdin") return auth === "required" && !secretsTtyOnly
    if (g.flag === "--wait" || g.flag === "--wait-timeout") return broadcasts
    return true
  })
}

/** one rendered "  --flag <type>   description  [tag]" line, used by the Global options section. */
function globalFlagLine(g: GlobalFlag): string {
  const tag = globalFlagTag(g)
  return `  ${globalFlagHead(g).padEnd(26)} ${g.description}${g.description && tag ? "  " : ""}${tag}`.trimEnd()
}

// Group (群组层) descriptions, keyed by the registry group head. Usually one line; a group whose
// behavior warrants it may span multiple lines (embed "\n"). Only groups that surface a
// `<group> --help` page need an entry; absent → the description line is omitted.
const GROUP_DESCRIPTIONS: Record<string, string> = {
  import: "Import a wallet from an existing secret or device.",
  account: "Query on-chain account state, activate accounts, and set on-chain identity fields.",
  token: "Manage the token address book and query tokens.",
  tx: "Build, send, broadcast, co-sign, and inspect transactions.",
  gasfree: "Gas-free token transfers via the GasFree service (open.gasfree.io).\nRequires API credentials (config gasfreeApiKey / gasfreeApiSecret).",
  contract: "Call, send, deploy, and inspect smart contracts.",
  stake: "Stake / delegate resources & query state (TRON Stake 2.0).",
  vote: "Vote for super representatives (SR).\nVoting accrues rewards — query and claim them with 'wallet-cli reward'.",
  reward: "Query and withdraw voting/block rewards.",
  permission: "View and update account permissions (TRON multi-sign).\nMisconfiguring owner permission can permanently lock the account.",
  chain: "Query on-chain parameters, resource prices, and node status.",
  message: "Sign arbitrary messages.",
  "typed-data": "Sign EIP-712 / TIP-712 structured data.",
  block: "Get a block (latest if omitted).",
  encoding: "Convert and validate addresses and encodings across formats.",
  address: "Generate a random secp256k1 keypair locally without storing it in the wallet.",
  contact: "Manage the local recipient address book.\nNames can be used directly in 'tx send --to' and 'gasfree transfer --to'.",
}

/** "--output, -o <text|json>" style header for text help. */
function globalFlagHead(g: GlobalFlag): string {
  const head = g.alias ? `${g.flag}, ${g.alias}` : g.flag
  const typ = g.type === "boolean" ? "" : ` <${g.values ? g.values.join("|") : g.type}>`
  return `${head}${typ}`
}

function globalFlagTag(g: GlobalFlag): string {
  if (g.defaultValue !== undefined) return `[optional, default: ${formatDefault(g.defaultValue)}]`
  return "[optional]"
}

/** color only when stdout is a TTY and NO_COLOR is unset — piped/redirected help stays plain. */
function colorOn(): boolean {
  return !!process.stdout.isTTY && !process.env.NO_COLOR
}
function bold(s: string): string {
  return colorOn() ? `\x1b[1m${s}\x1b[0m` : s
}
function dim(s: string): string {
  return colorOn() ? `\x1b[2m${s}\x1b[0m` : s
}
