/**
 * CliShell — register the command tree into yargs (chain families + neutral groups),
 * declare global-by-default flags (kubectl-style), turn OFF yargs I/O & exit, and dispatch:
 * resolve command → resolve network (+family check) → zod validate → capability gate → run.
 */
import yargs, { type Argv } from "yargs";
import { randomBytes } from "node:crypto";
import { type RefinementCtx, type ZodObject, type ZodRawShape, type ZodType } from "zod";
import type {
  AccountDescriptor,
  ChainFamily,
  NetworkDescriptor,
} from "../../../../domain/types/index.js";
import { isChainCommand } from "../contracts/index.js";
import type {
  ChainCommandDefinition,
  ChainSpec,
  CommandDefinition,
  CommandExecutionSpec,
  ExecutionContext,
  Globals,
  SessionRef,
  StreamManager,
} from "../contracts/index.js";
import { CommandRegistry } from "../registry/index.js";
import { CapabilityRegistry } from "../../../../application/services/capability/index.js";
import { barBroadcasts } from "../../../../application/services/broadcast-guard.js";
import { buildExecutionContext, type RuntimeDeps } from "../context/index.js";
import { TargetResolver } from "../../../../application/services/target/index.js";
import { OutputFormatter } from "../output/index.js";
import {
  applyCommands,
  camelToKebab,
  introspectFields,
  enumOptions,
  isAccountRef,
} from "../arity/index.js";
import { UsageError } from "../../../../domain/errors/index.js";
import { commandId } from "../command-id.js";
import { GLOBAL_FLAG_SPECS, globalYargsOptions } from "../globals/index.js";

export interface ShellOptions {
  registry: CommandRegistry;
  globals: Globals;
  deps: RuntimeDeps;
  targetResolver: TargetResolver;
  caps: CapabilityRegistry;
  streams: StreamManager;
  formatter: OutputFormatter;
  session: SessionRef;
}

// Global flag arity is derived from the single GLOBAL_FLAG_SPECS domain table, shared
// with the runner's pre-yargs scan. Per-command flag arity is derived separately from each command's
// zod fields via the arity adapter — no hand-maintained command list.
const GLOBAL_OPTS = globalYargsOptions();

// Interactivity (password/secret prompts, gap-fill, account select, delete confirm) is declared
// per command via `interactive`. Every other command runs as if non-TTY: missing input fails fast
// rather than prompting — safer for scripts/agents.
export function isInteractiveCommand(cmd: Pick<CommandExecutionSpec, "interactive">): boolean {
  return cmd.interactive === true;
}

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

  const all = opts.registry.all();
  // Two kinds: neutral (full path) vs chain (logical path + family binding chosen by --network).
  const neutralByHead = new Map<string, CommandDefinition[]>();
  for (const c of all.filter((c): c is CommandDefinition => !isChainCommand(c))) {
    const head = c.path[0]!;
    const bucket = neutralByHead.get(head) ?? [];
    bucket.push(c);
    neutralByHead.set(head, bucket);
  }

  for (const [head, cmds] of neutralByHead) {
    const hasVerbs = cmds.some((c) => c.path.length > 1);
    if (hasVerbs) {
      // group with sub-verbs (e.g. import mnemonic|private-key|ledger|watch)
      cli.command(
        `${head} [verb] [args..]`,
        `${head} commands`,
        (y) =>
          applyCommands(
            stringGroupTail(y),
            cmds.map((c) => c.fields),
          ),
        (argv) =>
          dispatchNeutral(
            opts,
            [head, typeof argv.verb === "string" ? argv.verb : undefined].filter(
              Boolean,
            ) as string[],
            argv,
          ),
      );
    } else {
      // single-segment leaf (create / list / use / current / rename / derive / delete / backup / networks)
      const cmd = cmds[0]!;
      cli.command(
        cmd.positionals?.length ? `${head} [args..]` : head,
        cmd.summary ?? "",
        (y) => applyCommands(stringGroupTail(y), [cmd.fields]),
        (argv) => dispatchNeutral(opts, [head], argv),
      );
    }
  }

  const assembledChainCommands = all.filter(isChainCommand);
  const chainGroups = [
    ...new Set(assembledChainCommands.map((c) => c.spec.path[0]).filter(Boolean) as string[]),
  ];
  const fieldsOfLogicalGroup = (group: string) => [
    ...assembledChainCommands
      .filter((c) => c.spec.path[0] === group)
      .flatMap((c) => [
        c.spec.baseFields,
        ...Object.values(c.families).flatMap((binding) =>
          binding?.fields ? [binding.fields] : [],
        ),
      ]),
  ];
  for (const group of chainGroups) {
    const assembledLeaves = assembledChainCommands.filter((c) => c.spec.path[0] === group);
    const paths = assembledLeaves.map((c) => c.spec.path);
    if (paths.every((path) => path.length === 1)) {
      // single-segment chain leaf (e.g. `block [<number>]`): no sub-verb; bind its own positional.
      cli.command(
        assembledLeaves[0]?.spec.positionals?.length ? `${group} [args..]` : group,
        assembledLeaves[0]?.spec.summary ?? "",
        (y) => applyCommands(stringGroupTail(y), fieldsOfLogicalGroup(group)),
        (argv) => {
          // a non-numeric positional (e.g. `block get`) is a mistyped subcommand, not a block height:
          // report it as an unknown command rather than a confusing "--number received NaN".
          const pos = (argv as any).args?.[0];
          if (pos !== undefined && !Number.isFinite(Number(pos))) {
            throw new UsageError("unknown_command", `unknown command: ${group} ${pos}`);
          }
          return dispatchLogical(opts, [group], argv);
        },
      );
      continue;
    }
    cli.command(
      `${group} [verb] [args..]`,
      `${group} commands`,
      (y) => applyCommands(stringGroupTail(y), fieldsOfLogicalGroup(group)),
      (argv) =>
        dispatchLogical(
          opts,
          [group, typeof argv.verb === "string" ? argv.verb : undefined].filter(
            Boolean,
          ) as string[],
          argv,
        ),
    );
  }
  // Catch-all: an unrecognised top-level namespace (e.g. `foobar list`) matches none of the
  // commands above. Without this, yargs (non-strict, no default command) silently exits 0 —
  // bad for an agent CLI. Mirror the unknown-subcommand path → unknown_command (exit 2).
  // Bare invocation (no command) is short-circuited to root help upstream in the runner.
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

async function dispatchNeutral(opts: ShellOptions, path: string[], argv: any): Promise<void> {
  const cmd = opts.registry.resolveNeutral(path);
  if (!cmd) throw new UsageError("unknown_command", `unknown command: ${path.join(" ")}`);
  await executeCommand(opts, cmd, argv);
}

async function dispatchLogical(opts: ShellOptions, path: string[], argv: any): Promise<void> {
  const chain = opts.registry.resolveChain(path);
  if (chain) {
    bindGroupedPositionals(chain.spec, argv);
    return executeChainCommand(opts, chain, argv);
  }
  throw new UsageError("unknown_command", `unknown command: ${path.join(" ")}`);
}

/**
 * Type the group tail as strings. Declared fields already get `type: "string"` from applyArity,
 * but `verb`/`args..` are anonymous captures, so yargs would infer their type and hand back a
 * number for anything number-shaped (`0xdeadbeef`, `12345`) — which every positional-bound field,
 * being string-typed in zod, then rejects. Coercing after the fact is not enough: the inference is
 * lossy (`1e5` → 100000, oversized ints → float), so the raw token has to survive parsing.
 */
function stringGroupTail(y: Argv): Argv {
  return y.positional("verb", { type: "string" }).positional("args", { type: "string" });
}

/**
 * A yargs group has one positional layout while each leaf can have a different one.
 * Capture the group tail as args[], then bind it only after resolving the exact leaf.
 */
export function bindGroupedPositionals(
  command: Pick<CommandExecutionSpec, "path" | "positionals">,
  argv: Record<string, any>,
): Record<string, any> {
  if (!("args" in argv)) return argv;
  const bound = { ...argv };
  const raw = bound.args;
  delete bound.args;
  const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const declared = command.positionals ?? [];
  if (values.length > declared.length) {
    throw new UsageError(
      "usage_error",
      `too many positional arguments for ${command.path.join(" ")}: expected ${declared.length}, received ${values.length}`,
    );
  }
  values.forEach((value, index) => {
    const field = declared[index]!.field;
    if (bound[field] !== undefined) {
      throw new UsageError(
        "invalid_option",
        `${field} was provided both positionally and as --${camelToKebab(field)}`,
      );
    }
    bound[field] = value;
  });
  return bound;
}

async function executeChainCommand(
  opts: ShellOptions,
  def: ChainCommandDefinition,
  argv: any,
): Promise<void> {
  const { globals, deps, targetResolver, caps, streams, formatter, session } = opts;
  const { spec } = def;
  const id = commandId({ path: spec.path });
  session.current = { commandId: id };

  const target = targetResolver.resolve(spec, globals);
  const net = requireResolvedNetwork(spec, target.network);
  const binding = def.families[net.family];
  if (!binding) {
    const families = Object.keys(def.families).join(", ");
    throw new UsageError(
      "family_mismatch",
      `command ${spec.path.join(" ")} supports ${families} but selected network ${net.id} is ${net.family}`,
    );
  }
  session.current = { commandId: id, net };

  const effectiveFields = binding.fields
    ? spec.baseFields.extend(binding.fields.shape)
    : spec.baseFields;
  const effectiveInput = composeRefines(effectiveFields, spec.baseRefine, binding.refine);
  const executionSpec = withFields(spec, effectiveFields);
  // order matters: the flag check must see argv before positionals are bound onto their fields
  assertKnownFlags(executionSpec, argv, otherFamilyFlags(def, net.family));
  argv = bindGroupedPositionals(spec, argv);
  deps.prompter.setInteractive(isInteractiveCommand(spec));
  caps.check(spec, net);

  if (spec.passwordMode) {
    const initialized = deps.keystore.isInitialized();
    const mode = spec.passwordMode === "establish" ? (initialized ? "verify" : "set") : "verify";
    await deps.secrets.primePassword({ mode, verify: (pw) => deps.keystore.verifyPassword(pw) });
  }

  await gapFillRequiredFields(executionSpec, argv, deps.prompter, () =>
    deps.keystore.list().map((d) => ({ value: d.accountId, label: accountChoiceLabel(d) })),
  );
  const input = parseInputSchema(effectiveInput, argv);

  const ctx = buildExecutionContext(globals, deps);
  if (spec.wallet !== "none") void ctx.activeAccount;
  // --dry-run is declared on the shared spec but honoured by each family binding independently,
  // so the promise is also enforced here: nothing reaches a Broadcaster for the duration.
  const run = () => binding.run(ctx, net, input);
  const data =
    spec.broadcasts && (input as { dryRun?: unknown }).dryRun === true
      ? await barBroadcasts(`${spec.path.join(" ")} --dry-run`, run)
      : await run();
  streams.result(
    formatter.success(id, net, data, spec.formatText, activeAccountLabel(spec, ctx, deps)),
  );
}

async function executeCommand(
  opts: ShellOptions,
  cmd: CommandDefinition,
  argv: any,
): Promise<void> {
  const { globals, deps, targetResolver, caps, streams, formatter, session } = opts;
  session.current = { commandId: commandId(cmd) };
  // order matters: the flag check must see argv before positionals are bound onto their fields
  assertKnownFlags(cmd, argv);
  argv = bindGroupedPositionals(cmd, argv);

  // Gate all interactive prompts (gap-fill, password, secret, account-select, delete confirm) on a
  // per-command allowlist: only create/import/delete/backup may prompt; everything else fails fast.
  deps.prompter.setInteractive(isInteractiveCommand(cmd));

  const target = targetResolver.resolve(cmd, globals);
  const net = target.network;
  session.current = { commandId: commandId(cmd), net };

  caps.check(cmd, net);

  // secretsTtyOnly (import mnemonic/private-key, change-password): the most sensitive setup ops
  // read every secret interactively only. Reject any stdin password source and require a real TTY
  // BEFORE priming, so no secret is ever taken from a pipe and the error is honest.
  if (cmd.secretsTtyOnly) {
    if (deps.secrets.has("password")) {
      throw new UsageError(
        "invalid_option",
        `${commandId(cmd)} reads the master password interactively only; --password-stdin is not accepted`,
      );
    }
    if (!deps.prompter.isTTY()) {
      throw new UsageError(
        "tty_required",
        `${commandId(cmd)} reads secrets interactively; run in a terminal`,
      );
    }
  }

  // auth: opt-in interactive password priming via passwordMode. Commands without passwordMode
  // (tx/contract/stake/message/derive) demand the password LAZILY — the keystore throws
  // auth_required only when a sign/decrypt actually happens, so read-only paths like
  // `tx send --dry-run` need no unlock. Ledger/watch commands skip this block entirely.
  // Password prompting MUST precede gap-fill so the user always sets/verifies the master
  // password before being asked for any other field (e.g. an optional wallet label).
  if (cmd.passwordMode) {
    const initialized = deps.keystore.isInitialized();
    const mode = cmd.passwordMode === "establish" ? (initialized ? "verify" : "set") : "verify";
    await deps.secrets.primePassword({ mode, verify: (pw) => deps.keystore.verifyPassword(pw) });
  }

  await gapFillRequiredFields(cmd, argv, deps.prompter, () =>
    deps.keystore.list().map((d) => ({ value: d.accountId, label: accountChoiceLabel(d) })),
  );
  const input = parseInput(cmd, argv);

  const ctx = buildExecutionContext(globals, deps);
  if (cmd.wallet !== "none") void ctx.activeAccount; // resolve account (default active) up front; throws missing_wallet_address if none exists

  const data = await cmd.run(ctx, net, input);
  // A mode-switching command may report a more precise semantic id than its path (backup.records).
  const resultId = cmd.commandIdFor?.(input) ?? commandId(cmd);
  session.current = { commandId: resultId, net };
  streams.result(
    formatter.success(resultId, net, data, cmd.formatText, activeAccountLabel(cmd, ctx, deps)),
  );
}

/** Runtime counterpart to CommandDefinition's network-policy discrimination. */
function requireResolvedNetwork(
  cmd: Pick<CommandExecutionSpec, "path">,
  net: NetworkDescriptor | undefined,
): NetworkDescriptor {
  if (net) return net;
  throw new Error(`network resolver returned no network for ${commandId(cmd)}`);
}

/** Central account-label resolution for text receipts: the user's --account label (or active
 *  account's label) so command formatters can show "main" instead of a shortened address.
 *  Best-effort — wallet:"none" commands have no account, and resolution never fails the command. */
function activeAccountLabel(
  cmd: Pick<CommandExecutionSpec, "wallet">,
  ctx: ExecutionContext,
  deps: RuntimeDeps,
): string | undefined {
  if (cmd.wallet === "none") return undefined;
  try {
    return deps.keystore.describe(ctx.activeAccount).label;
  } catch {
    return undefined;
  }
}

/** select label for an account choice: compact controls scan better; receipts carry addresses. */
function accountChoiceLabel(d: AccountDescriptor): string {
  const name = d.label ?? d.accountId;
  const tag = d.active ? " [active]" : "";
  return `${name}${tag}`;
}

/**
 * Fill missing non-secret fields by prompting — only under a TTY (non-TTY leaves argv untouched so
 * parseInput surfaces the usual missing_option). An account-ref field (delete/backup --account)
 * offers an arrow-select of existing accounts (label + addresses); with zero accounts it falls back
 * to free text so the command can surface its own no-wallet error. Other required fields must be
 * answered (enum → arrow select, else free text); OPTIONAL value fields are still offered but Enter
 * skips them, except wallet creation/import labels where Enter accepts the shown random default.
 * Boolean flags are never prompted (their default is false). Fields with a zod default are filled by
 * zod. A command may also declare fields inapplicable to THIS invocation via `skipGapFill` — a mode
 * flag can make an otherwise-promptable field meaningless (`backup --records` exports nothing, so it
 * must not ask which account to export).
 */
export async function gapFillRequiredFields(
  cmd: Pick<CommandExecutionSpec, "fields" | "promptHints"> & {
    skipGapFill?: (argv: any) => string[];
  },
  argv: any,
  prompter: Pick<import("../input/prompt/index.js").Prompter, "isTTY" | "text" | "select">,
  accountChoices?: () => Array<{ value: string; label: string }>,
): Promise<void> {
  if (!prompter.isTTY()) return;
  const skip = new Set(cmd.skipGapFill?.(argv) ?? []);
  for (const f of introspectFields(cmd.fields)) {
    if (f.hasDefault) continue; // zod supplies the value
    if (argv[f.name] !== undefined) continue; // already given on argv
    if (f.baseType === "boolean") continue; // never prompt for flags
    if (skip.has(f.name)) continue; // inapplicable in this invocation's mode
    if (isAccountRef(cmd.fields.shape[f.name])) {
      const choices = accountChoices?.() ?? [];
      if (choices.length > 0) {
        argv[f.name] = await prompter.select({ label: "Select account", choices });
        continue;
      }
      // no accounts yet → fall through to the text path below (command will error on resolve)
    }
    if (f.optional) {
      if (cmd.promptHints?.[f.name] === "skip") continue;
      if (cmd.promptHints?.[f.name] === "default-label") {
        const defaultLabel = randomWalletLabel();
        const v = await prompter.text({
          label: `${humanFieldLabel(f.kebab)} (default: ${defaultLabel})`,
        });
        argv[f.name] = v === "" ? defaultLabel : v;
        continue;
      }
      // offered but skippable: empty (Enter) → leave unset so the command's default applies.
      const v = await prompter.text({
        label: `${humanFieldLabel(f.kebab)} (optional, press Enter to skip)`,
      });
      if (v !== "") argv[f.name] = v;
      continue;
    }
    const options = enumOptions(cmd.fields.shape[f.name] as any);
    argv[f.name] = options
      ? await prompter.select({
          label: humanFieldLabel(f.kebab),
          choices: options.map((o) => ({ value: o, label: o })),
        })
      : await prompter.text({
          label: humanFieldLabel(f.kebab),
          validate: (v: string) => (v.trim() ? null : "required"),
        });
  }
}

const kebabToCamel = (s: string): string => s.replace(/-([a-z0-9])/g, (_m, c) => c.toUpperCase());
const humanFieldLabel = (s: string): string =>
  s
    .split("-")
    .map((p) => (p[0] ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");

function randomWalletLabel(): string {
  return `wallet_${randomBytes(3).toString("hex")}`;
}

/**
 * Reject unknown/misspelled flags (yargs is non-strict so it would otherwise pass them through
 * and zod would silently strip them). Allowed = positionals + globals + THIS command's fields
 * (a sibling command's flag in the same namespace is unknown here). → invalid_option, exit 2.
 */
/** Flags another family of this command declares, so a flag that exists — just not here — can say
 *  so instead of arriving as a bare "unknown option". */
function otherFamilyFlags(
  def: ChainCommandDefinition,
  selected: ChainFamily,
): Map<string, ChainFamily> {
  const out = new Map<string, ChainFamily>();
  for (const [family, binding] of Object.entries(def.families) as [
    ChainFamily,
    ChainCommandDefinition["families"][ChainFamily],
  ][]) {
    if (family === selected) continue;
    for (const name of Object.keys(binding?.fields?.shape ?? {})) {
      out.set(camelToKebab(name), family);
    }
  }
  return out;
}

/**
 * yargs' own keys for a command tail: the group head, the sub-verb, and the captured positionals.
 * They have to stay in assertKnownFlags' allowlist, because yargs really does put them in argv —
 * but argv cannot say whether YARGS put them there or the USER typed `--args`.
 *
 * That ambiguity made them work as undocumented aliases: `chain --verb node` ran chain.node, and
 * `use --args main` bound `main` as a positional. `contract call --args <addr>` was the bad one —
 * it bound into a slot the command does not have, so the call ran with no argument and answered
 * `0`, a wrong result that reads like a real one.
 *
 * No command declares a field by these names (pinned by a meta-test), so a TOKEN spelling one is
 * always user-typed and always wrong. The raw tokens still tell the two apart, so the check
 * belongs there — before yargs folds them together.
 */
export const YARGS_TAIL_KEYS = ["group", "verb", "args", "source"] as const;

export function assertNoTailFlags(tokens: string[]): void {
  const typed = new Set<string>();
  for (const token of tokens) {
    if (token === "--") break; // everything past a bare `--` is a value, not a flag
    const match = /^--([A-Za-z0-9-]+)(?:=|$)/.exec(token);
    if (match && (YARGS_TAIL_KEYS as readonly string[]).includes(match[1]!)) typed.add(match[1]!);
  }
  if (typed.size > 0) {
    throw new UsageError(
      "invalid_option",
      `unknown option(s): ${[...typed].map((name) => `--${name}`).join(", ")}`,
    );
  }
}

function assertKnownFlags(
  cmd: Pick<CommandExecutionSpec, "path" | "fields" | "positionals">,
  argv: any,
  otherFamily: Map<string, ChainFamily> = new Map(),
): void {
  const allowed = new Set<string>(["_", "$0", ...YARGS_TAIL_KEYS]);
  const add = (name: string) => {
    allowed.add(name);
    allowed.add(camelToKebab(name));
    allowed.add(kebabToCamel(name));
  };
  for (const k of Object.keys(GLOBAL_OPTS)) add(k);
  for (const f of GLOBAL_FLAG_SPECS) if (f.alias) allowed.add(f.alias); // -o / -v short aliases
  // The command's OWN path segments are deliberately not allowed. Adding them made `--token` a
  // silently accepted no-op on `token balance`, `--contract` one on `contract deploy`, `--watch`
  // one on `import watch` — a flag the command does not have, ignored instead of refused, which is
  // the failure mode this whole function exists to prevent. yargs delivers the path in `_` (and,
  // for grouped commands, in the `group`/`verb`/`source` keys already allowed above), so nothing
  // needs them here.
  // Positional fields are deliberately absent: they arrive in `args` and are bound to their field
  // AFTER this check, so a field name present here can only be a `--field` the user typed — which
  // this command does not accept (see CommandDefinition.positionals). A positional named after a
  // global (`use [account]`) stays allowed via GLOBAL_OPTS above; supplying both is then caught by
  // bindGroupedPositionals.
  const positional = new Set((cmd.positionals ?? []).map((p) => p.field));
  for (const k of Object.keys(cmd.fields.shape)) if (!positional.has(k)) add(k);
  // dedupe: camel-case-expansion puts `--trace-id` in argv as both trace-id and traceId, and both
  // render to the same flag name.
  const unknown = [
    ...new Set(
      Object.keys(argv)
        .filter((k) => !allowed.has(k))
        .map(camelToKebab),
    ),
  ];
  if (unknown.length > 0) {
    throw new UsageError(
      "invalid_option",
      `unknown option(s): ${unknown
        .map((u) => {
          const family = otherFamily.get(u);
          // "--transaction is a tron option" is the answer; "unknown option --transaction" sends
          // the reader hunting for a typo in a flag that exists.
          return family ? `--${u} (a ${family} option on this command)` : `--${u}`;
        })
        .join(", ")}`,
    );
  }
}

function parseInput(cmd: CommandDefinition, argv: any): unknown {
  return parseInputSchema(cmd.input, argv);
}

function parseInputSchema(schema: ZodType, argv: any): unknown {
  const result = schema.safeParse(argv);
  if (result.success) return result.data;
  const issue = result.error.issues[0]!;
  const key = issue.path[0];
  const field = issue.path.join(".") || "input";
  // structural: a required field absent from argv → missing_option (no message-regex).
  if (issue.code === "invalid_type" && key !== undefined && argv[key] === undefined) {
    throw new UsageError(
      "missing_option",
      `missing required option --${camelToKebab(String(key))}`,
    );
  }
  throw new UsageError("invalid_value", `invalid --${camelToKebab(field)}: ${issue.message}`);
}

function withFields(spec: ChainSpec, fields: ZodObject<ZodRawShape>): CommandExecutionSpec {
  return { ...spec, fields };
}

export function composeRefines(
  fields: ZodObject<ZodRawShape>,
  baseRefine?: (value: any, ctx: RefinementCtx) => void,
  familyRefine?: (value: any, ctx: RefinementCtx) => void,
): ZodType {
  let schema: ZodType = fields;
  if (baseRefine) schema = schema.superRefine(baseRefine);
  if (familyRefine) schema = schema.superRefine(familyRefine);
  return schema;
}
