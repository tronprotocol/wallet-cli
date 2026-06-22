/**
 * CliShell (L4) — register the command tree into yargs (tron/evm families + neutral groups),
 * declare global-by-default flags (kubectl-style), turn OFF yargs I/O & exit, and dispatch:
 * resolve command → resolve network (+family check) → zod validate → capability gate → run.
 * (plan §3 L4 / 修正④ / [replaces ArgvLexer/FlagSpecRegistry])
 */
import yargs, { type Argv } from "yargs";
import { z } from "zod";
import type {
  ChainFamily,
  CommandDefinition,
  Globals,
  NetworkDescriptor,
  StreamManager,
} from "../../core/types/index.js";
import { CommandRegistry } from "../../runtime/registry/index.js";
import { CapabilityGate } from "../../runtime/capability/index.js";
import { buildExecutionContext, type RuntimeDeps } from "../../runtime/context/index.js";
import { OutputFormatter } from "../../runtime/output/index.js";
import { ZodYargsAdapter, camelToKebab } from "../../runtime/adapter/index.js";
import { isChainFamily } from "../../core/family/index.js";
import { UsageError, ExecutionError } from "../../core/errors/index.js";

export interface SessionRef {
  current?: { commandId: string; net?: NetworkDescriptor };
}

export interface ShellOptions {
  registry: CommandRegistry;
  globals: Globals;
  deps: RuntimeDeps;
  capGate: CapabilityGate;
  streams: StreamManager;
  formatter: OutputFormatter;
  session: SessionRef;
}

// Only true GLOBAL flags live here; per-command flag arity is derived from each command's
// zod fields via ZodYargsAdapter (single source of truth — no hand-maintained command list).
const GLOBAL_OPTS = {
  output: { type: "string", choices: ["text", "json"], alias: "o" },
  network: { type: "string" },
  account: { type: "string" },
  timeout: { type: "number" },
  quiet: { type: "boolean" },
  verbose: { type: "boolean" },
  "no-device-wait": { type: "boolean" },
  "grpc-endpoint": { type: "string" },
  "rpc-url": { type: "string" },
  // secret/data channels: `--<kind>-stdin` reads fd 0 (at most one secret per run). The
  // `--<kind>-file`/`/dev/fd/N` multi-fd path was removed; commands needing a 2nd secret
  // (import-mnemonic/import-private-key/backup) go interactive. (spec §6 / plan §7.13.1)
  "password-stdin": { type: "boolean" },
  "private-key-stdin": { type: "boolean" }, // TODO:interactive — temporary until prompt layer lands
  "mnemonic-stdin": { type: "boolean" }, // TODO:interactive — temporary until prompt layer lands
  "tx-stdin": { type: "boolean" },
  "message-stdin": { type: "boolean" },
} as const;

export function buildCli(opts: ShellOptions): Argv {
  const cli = yargs()
    .scriptName("wallet-cli")
    .exitProcess(false)
    .help(false)
    .version(false)
    .fail(false) // throw instead of printing → Runner funnels into one envelope
    .strict(false)
    .parserConfiguration({ "camel-case-expansion": true, "dot-notation": false })
    .options(GLOBAL_OPTS as any);

  const fieldsOf = (ns: string) => opts.registry.commandsOf(ns).map((c) => c.fields);

  for (const fam of opts.registry.families()) {
    // optional positionals: a missing resource/action resolves to unknown_command (exit 2)
    // rather than relying on yargs' English "Not enough arguments" message.
    cli.command(
      // positional 變數名用中性的 group/verb,避免與命令 flag(如 `--resource`)撞名 → shadow。
      `${fam} [group] [verb]`,
      `${fam} commands`,
      (y) => ZodYargsAdapter.applyCommands(y, fieldsOf(fam)),
      (argv) => dispatch(opts, fam, argv),
    );
  }
  for (const ns of opts.registry.neutralNamespaces()) {
    cli.command(
      `${ns} [verb]`,
      `${ns} commands`,
      (y) => ZodYargsAdapter.applyCommands(y, fieldsOf(ns)),
      (argv) => dispatch(opts, ns, argv),
    );
  }
  // Catch-all: an unrecognised top-level namespace (e.g. `foobar list`) matches none of the
  // commands above. Without this, yargs (non-strict, no default command) silently exits 0 —
  // bad for an agent CLI. Mirror the unknown-subcommand path → unknown_command (exit 2).
  // Bare invocation (no positionals) is left untouched.
  cli.command(
    "*",
    false,
    (y) => y,
    (argv) => {
      const positionals = (argv._ as (string | number)[]).map(String).filter(Boolean);
      if (positionals.length > 0) {
        throw new UsageError("unknown_command", `unknown command: ${positionals.join(" ")}`);
      }
    },
  );
  return cli;
}

async function dispatch(opts: ShellOptions, ns: string, argv: any): Promise<void> {
  const { registry, globals, deps, capGate, streams, formatter, session } = opts;
  const family = isChainFamily(ns) ? ns : undefined;
  const path = family
    ? [argv.group, argv.verb].filter(Boolean)
    : [argv.verb].filter(Boolean);

  const cmd = registry.resolveConcrete(ns, path);
  if (!cmd) throw new UsageError("unknown_command", `unknown command: ${[ns, ...path].join(" ")}`);
  session.current = { commandId: cmd.id };
  assertKnownFlags(cmd, argv);

  let net: NetworkDescriptor | undefined;
  if (cmd.network !== "none") {
    if (globals.network) {
      net = deps.networkRegistry.resolve(globals.network);
    } else if (cmd.network === "required") {
      throw new UsageError("missing_network", "this command requires --network <id|alias>");
    } else {
      // net=optional: fall back to the family default network (§7.5).
      net = deps.networkRegistry.resolveDefault(family!);
    }
    if (family && net.family !== family) {
      throw new UsageError("network_family_mismatch", `${family} does not support network ${net.id}`);
    }
  }
  session.current = { commandId: cmd.id, net };

  const input = parseInput(cmd, argv);
  capGate.check(cmd, net);

  const ctx = buildExecutionContext(globals, deps);
  // enforce the declared wallet/auth contract up front (deterministic, before run()).
  if (cmd.auth === "required" && !deps.secrets.hasMasterPassword()) {
    throw new ExecutionError("auth_required", "master password required: pass --password-stdin");
  }
  if (cmd.wallet !== "none") void ctx.activeAccount; // resolve account (default active) up front; throws missing_wallet_address if none exists

  const data = await cmd.run(ctx, net, input);
  streams.result(formatter.success(cmd, net, data));
}

const kebabToCamel = (s: string): string => s.replace(/-([a-z0-9])/g, (_m, c) => c.toUpperCase());

/**
 * Reject unknown/misspelled flags (yargs is non-strict so it would otherwise pass them through
 * and zod would silently strip them). Allowed = positionals + globals + THIS command's fields
 * (a sibling command's flag in the same namespace is unknown here). → invalid_option, exit 2.
 */
function assertKnownFlags(cmd: CommandDefinition, argv: any): void {
  const allowed = new Set<string>(["_", "$0", "group", "verb"]);
  const add = (name: string) => {
    allowed.add(name);
    allowed.add(camelToKebab(name));
    allowed.add(kebabToCamel(name));
  };
  for (const k of Object.keys(GLOBAL_OPTS)) add(k);
  add("o"); // --output alias
  for (const k of Object.keys(cmd.fields.shape)) add(k);
  const unknown = Object.keys(argv).filter((k) => !allowed.has(k));
  if (unknown.length > 0) {
    throw new UsageError("invalid_option", `unknown option(s): ${unknown.map((u) => `--${camelToKebab(u)}`).join(", ")}`);
  }
}

function parseInput(cmd: CommandDefinition, argv: any): unknown {
  const result = (cmd.input as z.ZodType).safeParse(argv);
  if (result.success) return result.data;
  const issue = result.error.issues[0]!;
  const key = issue.path[0];
  const field = issue.path.join(".") || "input";
  // structural: a required field absent from argv → missing_option (no message-regex).
  if (issue.code === "invalid_type" && key !== undefined && argv[key] === undefined) {
    throw new UsageError("missing_option", `missing required option --${camelToKebab(String(key))}`);
  }
  throw new UsageError("invalid_value", `invalid --${camelToKebab(field)}: ${issue.message}`);
}
