import yargs, { type Argv } from "yargs";
import { randomBytes } from "node:crypto";
import { type RefinementCtx, type ZodObject, type ZodRawShape, type ZodType } from "zod";
import type {
  AccountDescriptor,
  ChainFamily,
  NetworkDescriptor,
} from "../../../../domain/types/index.js";
import { acceptsWaitFlags, isChainCommand, NO_SUBMIT_MODE_FIELDS } from "../contracts/index.js";
import type {
  ChainCommandDefinition,
  ChainSpec,
  CommandDefinition,
  CommandExecutionSpec,
  ExclusiveGroup,
  ExecutionContext,
  FamilyBinding,
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
import { ERROR_CODES, type ErrorCodeEntry } from "../../../../domain/errors/codes.js";
import { commandId } from "../command-id.js";
import { GLOBAL_FLAG_SPECS, globalYargsOptions } from "../globals/index.js";
import { exclusiveRefine } from "../schemas/exclusive.js";

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

const GLOBAL_OPTS = globalYargsOptions();

export function isInteractiveCommand(cmd: Pick<CommandExecutionSpec, "interactive">): boolean {
  return cmd.interactive === true;
}

export function buildCli(opts: ShellOptions): Argv {
  const cli = yargs()
    .scriptName("wallet-cli")
    .exitProcess(false)
    .help(false)
    .version(false)
    .fail(false) // Route failures through the runner's error envelope.
    .strict(false)
    .parserConfiguration({ "camel-case-expansion": true, "dot-notation": false })
    .options(GLOBAL_OPTS as any);

  const all = opts.registry.all();
  const neutralByHead = new Map<string, CommandDefinition[]>();
  for (const c of all.filter((c): c is CommandDefinition => !isChainCommand(c))) {
    const head = c.path[0]!;
    const bucket = neutralByHead.get(head) ?? [];
    bucket.push(c);
    neutralByHead.set(head, bucket);
  }

  const assembledChainCommands = all.filter(isChainCommand);
  for (const [head, cmds] of neutralByHead) {
    // Mixed groups are registered once below, with both neutral and chain fields.
    if (assembledChainCommands.some((c) => c.spec.path[0] === head)) continue;
    const hasVerbs = cmds.some((c) => c.path.length > 1);
    if (hasVerbs) {
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
      const cmd = cmds[0]!;
      cli.command(
        cmd.positionals?.length ? `${head} [args..]` : head,
        cmd.summary ?? "",
        (y) => applyCommands(stringGroupTail(y), [cmd.fields]),
        (argv) => dispatchNeutral(opts, [head], argv),
      );
    }
  }

  const chainGroups = [
    ...new Set(assembledChainCommands.map((c) => c.spec.path[0]).filter(Boolean) as string[]),
  ];
  const fieldsOfLogicalGroup = (group: string) => [
    ...(neutralByHead.get(group) ?? []).map((c) => c.fields),
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
      cli.command(
        assembledLeaves[0]?.spec.positionals?.length ? `${group} [args..]` : group,
        assembledLeaves[0]?.spec.summary ?? "",
        (y) => applyCommands(stringGroupTail(y), fieldsOfLogicalGroup(group)),
        (argv) => dispatchLogical(opts, [group], argv),
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
  // Non-strict yargs otherwise accepts unknown top-level commands with exit 0.
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
  return dispatchNeutral(opts, path, argv);
}

// Preserve raw tokens: yargs numeric inference loses hex spelling and large-integer precision.
function stringGroupTail(y: Argv): Argv {
  return y.positional("verb", { type: "string" }).positional("args", { type: "string" });
}

// Bind the group's captured args only after resolving the leaf's positional layout.
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

  const { fields: effectiveFields, input: effectiveInput } = chainInputSchema(spec, binding);
  const executionSpec = withFields(spec, effectiveFields);
  // Validate flags before binding positionals so positional-only fields cannot become flags.
  assertKnownFlags(executionSpec, argv, otherFamilyFlags(def, net.family));
  argv = bindGroupedPositionals(spec, argv);
  deps.prompter.setInteractive(isInteractiveCommand(spec));
  caps.check(spec, net);

  if (spec.passwordMode) {
    const initialized = deps.accounts.isInitialized();
    const mode = spec.passwordMode === "establish" ? (initialized ? "verify" : "set") : "verify";
    await deps.secrets.primePassword({ mode, verify: (pw) => deps.accounts.verifyPassword(pw) });
  }

  await gapFillRequiredFields(executionSpec, argv, deps.prompter, () =>
    deps.accounts.list().map((d) => ({ value: d.accountId, label: accountChoiceLabel(d) })),
  );
  const input = parseInputSchema(effectiveInput, argv, spec.positionals);

  const ctx = buildExecutionContext(globals, deps);
  if (spec.wallet !== "none") void ctx.activeAccount;
  const data = await barredDuringDryRun(spec, input, () => binding.run(ctx, net, input));
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
  // Validate flags before binding positionals so positional-only fields cannot become flags.
  assertKnownFlags(cmd, argv);
  argv = bindGroupedPositionals(cmd, argv);

  deps.prompter.setInteractive(isInteractiveCommand(cmd));

  const target = targetResolver.resolve(cmd, globals);
  const net = target.network;
  session.current = { commandId: commandId(cmd), net };

  caps.check(cmd, net);

  // Reject piped passwords and require a TTY before priming secrets.
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

  // Without passwordMode, authentication is lazy so key-free paths need no password.
  // Prime the password before prompting for other fields.
  if (cmd.passwordMode) {
    const initialized = deps.accounts.isInitialized();
    const mode = cmd.passwordMode === "establish" ? (initialized ? "verify" : "set") : "verify";
    await deps.secrets.primePassword({ mode, verify: (pw) => deps.accounts.verifyPassword(pw) });
  }

  await gapFillRequiredFields(cmd, argv, deps.prompter, () =>
    deps.accounts.list().map((d) => ({ value: d.accountId, label: accountChoiceLabel(d) })),
  );
  const input = parseInput(cmd, argv);

  const ctx = buildExecutionContext(globals, deps);
  if (cmd.wallet !== "none") void ctx.activeAccount; // Resolve the account before running the command.

  const data = await barredDuringDryRun(cmd, input, () => cmd.run(ctx, net, input));
  const resultId = cmd.commandIdFor?.(input) ?? commandId(cmd);
  session.current = { commandId: resultId, net };
  streams.result(
    formatter.success(resultId, net, data, cmd.formatText, activeAccountLabel(cmd, ctx, deps)),
  );
}

// Bar broadcasts during dry-run even if a use case ignores the flag.
function barredDuringDryRun<T>(
  cmd: Pick<CommandExecutionSpec, "path">,
  input: unknown,
  run: () => Promise<T>,
): Promise<T> {
  return (input as { dryRun?: unknown }).dryRun === true
    ? barBroadcasts(`${cmd.path.join(" ")} --dry-run`, run)
    : run();
}

function requireResolvedNetwork(
  cmd: Pick<CommandExecutionSpec, "path">,
  net: NetworkDescriptor | undefined,
): NetworkDescriptor {
  if (net) return net;
  throw new Error(`network resolver returned no network for ${commandId(cmd)}`);
}

// Receipt labels are best-effort and must not fail the command.
function activeAccountLabel(
  cmd: Pick<CommandExecutionSpec, "wallet">,
  ctx: ExecutionContext,
  deps: RuntimeDeps,
): string | undefined {
  if (cmd.wallet === "none") return undefined;
  try {
    return deps.accounts.describe(ctx.activeAccount).label;
  } catch {
    return undefined;
  }
}

function accountChoiceLabel(d: AccountDescriptor): string {
  const name = d.label ?? d.accountId;
  const tag = d.active ? " [active]" : "";
  return `${name}${tag}`;
}

// Prompt for missing required and optional fields only in interactive TTY mode.
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
    if (f.hasDefault) continue;
    if (argv[f.name] !== undefined) continue;
    if (f.baseType === "boolean") continue;
    if (skip.has(f.name)) continue;
    if (isAccountRef(cmd.fields.shape[f.name])) {
      const choices = accountChoices?.() ?? [];
      if (choices.length > 0) {
        argv[f.name] = await prompter.select({ label: "Select account", choices });
        continue;
      }
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

// Reject user-typed tail keys before yargs makes them indistinguishable from its own captures.
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
  cmd: Pick<
    CommandExecutionSpec,
    | "path"
    | "fields"
    | "positionals"
    | "broadcasts"
    | "rejectsAccount"
    | "rejectsWait"
    | "rejectsWaitWith"
  >,
  argv: any,
  otherFamily: Map<string, ChainFamily> = new Map(),
): void {
  if (cmd.rejectsAccount !== undefined && argv.account !== undefined) {
    throw new UsageError(
      "invalid_option",
      `${cmd.path.join(" ")} does not accept --account: ${cmd.rejectsAccount}`,
    );
  }
  if (argv.wait !== undefined) assertWaitIntentApplies(cmd, argv);
  if (cmd.path[0] === "x402" && cmd.path[1]?.startsWith("provider-")) {
    if (
      argv.account !== undefined ||
      (cmd.path[1] !== "provider-list" && argv.network !== undefined)
    ) {
      throw new UsageError(
        "invalid_option",
        "provider commands do not accept --account; --network is only a provider-list filter",
      );
    }
  }
  const allowed = new Set<string>(["_", "$0", ...YARGS_TAIL_KEYS]);
  const add = (name: string) => {
    allowed.add(name);
    allowed.add(camelToKebab(name));
    allowed.add(kebabToCamel(name));
  };
  for (const k of Object.keys(GLOBAL_OPTS)) add(k);
  for (const f of GLOBAL_FLAG_SPECS) if (f.alias) allowed.add(f.alias);
  // Command path segments are not flags; yargs captures them in the allowed tail keys.
  // Positionals arrive in args and are bound after this check; their field names are not flags.
  const positional = new Set((cmd.positionals ?? []).map((p) => p.field));
  for (const k of Object.keys(cmd.fields.shape)) if (!positional.has(k)) add(k);
  // yargs emits both camelCase and kebab-case keys for one flag.
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
          return family ? `--${u} (a ${family} option on this command)` : `--${u}`;
        })
        .join(", ")}`,
    );
  }
}

// Refuses an explicit wait intent where no transaction is submitted, before any work starts.
function assertWaitIntentApplies(
  cmd: Pick<CommandExecutionSpec, "path" | "broadcasts" | "rejectsWait" | "rejectsWaitWith">,
  argv: any,
): void {
  const flag = argv.wait ? "--wait" : "--no-wait";
  if (cmd.rejectsWait !== undefined) {
    throw new UsageError(
      "invalid_option",
      `${cmd.path.join(" ")} does not accept ${flag}: ${cmd.rejectsWait}`,
    );
  }
  if (!acceptsWaitFlags(cmd)) {
    throw new UsageError(
      "invalid_option",
      `${cmd.path.join(" ")} does not accept ${flag}: it submits no transaction to wait for`,
    );
  }
  const mode = [...NO_SUBMIT_MODE_FIELDS, cmd.rejectsWaitWith].find(
    (field) => field !== undefined && argv[field] === true,
  );
  if (mode !== undefined) {
    throw new UsageError(
      "invalid_option",
      `${flag} cannot be used with --${camelToKebab(mode)}, which submits no transaction`,
    );
  }
}

function parseInput(cmd: CommandDefinition, argv: any): unknown {
  return parseInputSchema(neutralInputSchema(cmd), argv, cmd.positionals);
}

// The validation schema of a family-neutral command, including its exclusive groups.
export function neutralInputSchema(cmd: CommandDefinition): ZodType {
  const exclusive = exclusiveRefine(cmd.exclusive, cmd.fields);
  return exclusive ? cmd.input.superRefine(exclusive) : cmd.input;
}

// The fields and validation schema of a chain command on one family.
export function chainInputSchema(
  spec: ChainSpec,
  binding: FamilyBinding,
): { fields: ZodObject<ZodRawShape>; input: ZodType } {
  const fields = binding.fields ? spec.baseFields.extend(binding.fields.shape) : spec.baseFields;
  return {
    fields,
    input: composeRefines(fields, spec.baseRefine, binding.refine, spec.exclusive),
  };
}

export function parseInputSchema(
  schema: ZodType,
  argv: any,
  positionals: readonly { field: string; placeholder?: string }[] = [],
): unknown {
  const result = schema.safeParse(argv);
  if (result.success) return result.data;
  const issue = result.error.issues[0]!;
  const key = issue.path[0];
  // A positional is named as its usage line shows it.
  const name = (part: PropertyKey) =>
    positionals.find((p) => p.field === part)?.placeholder ?? String(part);
  const field =
    issue.path.map((part, i) => (i === 0 ? name(part) : String(part))).join(".") || "input";
  if (issue.code === "invalid_type" && key !== undefined && argv[key] === undefined) {
    throw new UsageError("missing_option", `missing required option --${camelToKebab(name(key))}`);
  }
  // Refines may select only registered usage-error codes; other codes fall back to invalid_value.
  const declared = (issue as { params?: { errorCode?: unknown } }).params?.errorCode;
  const declaredCode = typeof declared === "string" ? declared : undefined;
  const table = ERROR_CODES as Record<string, ErrorCodeEntry | undefined>;
  const entry = declaredCode ? table[declaredCode] : undefined;
  const code =
    declaredCode && entry && (entry.exit === 2 || entry.exit === "either")
      ? declaredCode
      : "invalid_value";
  throw new UsageError(code, `invalid --${camelToKebab(field)}: ${issue.message}`);
}

function withFields(spec: ChainSpec, fields: ZodObject<ZodRawShape>): CommandExecutionSpec {
  return { ...spec, fields };
}

export function composeRefines(
  fields: ZodObject<ZodRawShape>,
  baseRefine?: (value: any, ctx: RefinementCtx) => void,
  familyRefine?: (value: any, ctx: RefinementCtx) => void,
  exclusive?: readonly ExclusiveGroup[],
): ZodType {
  let schema: ZodType = fields;
  const exclusiveCheck = exclusiveRefine(exclusive, fields);
  if (exclusiveCheck) schema = schema.superRefine(exclusiveCheck);
  if (baseRefine) schema = schema.superRefine(baseRefine);
  if (familyRefine) schema = schema.superRefine(familyRefine);
  return schema;
}
