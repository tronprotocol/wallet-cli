// Builds what a plugin registers against, checks everything it declares, and publishes it in one step.
import type { ChainFamily, Config, NetworkDescriptor } from "../../domain/types/index.js";
import { networkBlock } from "../../domain/types/index.js";
import {
  errorCodeEntry,
  declareErrorCodes,
  type ErrorCodeEntry,
} from "../../domain/errors/codes.js";
import { UsageError } from "../../domain/errors/index.js";
import { FAMILIES } from "../../domain/family/index.js";
import type { BroadcastGuard } from "../../application/contracts/broadcast-guard.js";
import type { WallClock } from "../../application/contracts/wall-clock.js";
import type { ExecutionDeadline } from "../../application/contracts/deadline.js";
import type { ChainGatewayProvider } from "../../application/ports/chain/gateway-provider.js";
import type { CapabilityRegistry } from "../../application/services/capability/index.js";
import type { PluginSigning } from "../../application/services/plugins/plugin-signing.js";
import type { RecipientResolver } from "../../application/services/recipient-resolver.js";
import type {
  ChainSpec,
  CommandDefinition,
  ExecutionContext,
  FamilyBinding,
} from "../../adapters/inbound/cli/contracts/index.js";
import { SECRET_KINDS } from "../../adapters/inbound/cli/contracts/index.js";
import { CommandRegistry, type HelpGroup } from "../../adapters/inbound/cli/registry/index.js";
import { followUpSpelling, registerFollowUps } from "../../adapters/inbound/cli/output/errors.js";
import { camelToKebab } from "../../adapters/inbound/cli/arity/index.js";
import {
  PLUGIN_API_REVISION,
  PLUGIN_API_VERSION,
  type CapabilityPredicate,
  type HostServices,
  type PluginDefinition,
  type PluginHost,
} from "../../plugin-api/index.js";
import { WALLET_MANAGEMENT_FIELDS, type PluginCommandContext } from "../../plugin-api/command.js";
import type { ServiceCredentialKey } from "../../plugin-api/host-services.js";

const PLUGIN_NAME = /^[a-z0-9][a-z0-9-]*$/;
// Words the core keeps for itself even before it registers a command under them.
const RESERVED_WORDS: ReadonlySet<string> = new Set(["plugin", "help"]);
const SERVICE_CREDENTIAL_KEYS: readonly ServiceCredentialKey[] = [
  "gasfreeApiKey",
  "gasfreeApiSecret",
  "baiApiKey",
];

// An object with exactly these members: no prototype, frozen, every value a closure or plain data.
export function facade<T extends object>(members: T): T {
  return Object.freeze(Object.create(null, Object.getOwnPropertyDescriptors(members))) as T;
}

export interface HostServiceDependencies {
  readonly signing: PluginSigning;
  readonly gateways: ChainGatewayProvider;
  readonly recipients: Pick<RecipientResolver, "resolve">;
  readonly config: Pick<Config, ServiceCredentialKey>;
  readonly broadcastGuard: BroadcastGuard;
  readonly clock: WallClock;
}

export function hostServices(deps: HostServiceDependencies): HostServices {
  const { signing, gateways, recipients, config, broadcastGuard, clock } = deps;
  return facade<HostServices>({
    signing: facade({
      assertCanSign: (account, family) => signing.assertCanSign(account, family),
      signerAddress: (account, family) => signing.signerAddress(account, family),
      sign: (scope, request) => signing.sign(scope, request),
    }),
    gateways: facade({
      get: (network: NetworkDescriptor, family: "tron", check) => {
        const gateway = gateways.get(network, family, check);
        return facade({
          getTrc20Balance: (contract: string, address: string) =>
            gateway.getTrc20Balance(contract, address),
          getTokenInfo: (contract: string) => gateway.getTokenInfo(contract),
        });
      },
    }),
    recipients: facade({ resolve: (family, input) => recipients.resolve(family, input) }),
    config: facade({
      networkBlock: (network, name) => networkBlock(network, name),
      credential: (key) => (SERVICE_CREDENTIAL_KEYS.includes(key) ? config[key] : undefined),
    }),
    broadcastGuard: facade({ assertAllowed: () => broadcastGuard.assertAllowed() }),
    clock: facade({ now: () => clock() }),
  });
}

function deadlineFacade(deadline: ExecutionDeadline): ExecutionDeadline {
  return facade<ExecutionDeadline>({
    get signal() {
      return deadline.signal;
    },
    remainingMs: () => deadline.remainingMs(),
    expired: () => deadline.expired(),
    assertActive: () => deadline.assertActive(),
  });
}

export function pluginCommandContext(
  ctx: ExecutionContext,
  timeoutMs: number,
): PluginCommandContext {
  return facade<PluginCommandContext>({
    deadline: deadlineFacade(ctx.deadline),
    get activeAccount() {
      return ctx.activeAccount;
    },
    resolveAddress: (family) => ctx.resolveAddress(family),
    wait: ctx.wait,
    emit: (event) => ctx.emit(event),
    warn: (message) => ctx.warn(message),
    output: ctx.output,
    timeoutMs,
    // Refused before reading, so a secret on stdin is never handed to the plugin.
    readStdinBytes: async () => {
      const claimed = SECRET_KINDS.find((kind) => ctx.secrets.has(kind));
      if (claimed !== undefined) {
        throw new UsageError(
          "invalid_option",
          `stdin is already used by --${camelToKebab(claimed)}-stdin`,
        );
      }
      return ctx.streams.readStdinBytesOnce(ctx.deadline.signal);
    },
    log: facade({
      line: (text: string) => ctx.streams.errorLine(text),
      diagnostic: (level: "info" | "debug" | "warn", text: string) =>
        ctx.streams.diagnostic(level, text),
    }),
  });
}

export interface PluginTargets {
  readonly commands: CommandRegistry;
  readonly capabilities: Pick<CapabilityRegistry, "hasPredicate" | "addPredicates">;
  readonly services: HostServices;
  // The command's resolved time limit, handed to plugin commands; 0 means none.
  readonly timeoutMs: number;
}

export type PluginRegistration =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

interface StagedPlugin {
  readonly groups: HelpGroup[];
  readonly commands: CommandDefinition[];
  readonly chains: { spec: ChainSpec; family: ChainFamily; binding: FamilyBinding }[];
  readonly codes: Map<string, ErrorCodeEntry>;
  readonly predicates: Map<string, CapabilityPredicate>;
  readonly followUps: Map<string, (subject?: string) => string>;
}

// Publishes all of a plugin's declarations, or none of them.
export function registerPlugin(
  plugin: PluginDefinition,
  targets: PluginTargets,
): PluginRegistration {
  let staged: StagedPlugin;
  try {
    staged = stage(plugin, targets);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  for (const group of staged.groups) targets.commands.addGroup(group);
  for (const command of staged.commands) targets.commands.add(command);
  for (const { spec, family, binding } of staged.chains) {
    targets.commands.addChain(spec, family, binding);
  }
  declareErrorCodes(Object.fromEntries(staged.codes));
  targets.capabilities.addPredicates(Object.fromEntries(staged.predicates));
  registerFollowUps(Object.fromEntries(staged.followUps));
  return { ok: true };
}

function stage(plugin: PluginDefinition, targets: PluginTargets): StagedPlugin {
  const name = String(plugin.name);
  if (!PLUGIN_NAME.test(name)) throw new Error(`plugin name ${JSON.stringify(name)} is not valid`);
  if (plugin.apiVersion !== PLUGIN_API_VERSION) {
    throw new Error(`plugin ${name} is built for plugin API ${plugin.apiVersion}`);
  }
  if (!(plugin.apiRevision <= PLUGIN_API_REVISION)) {
    throw new Error(`plugin ${name} needs plugin API revision ${plugin.apiRevision}`);
  }
  const taken = targets.commands.topLevelWords();
  const groups: HelpGroup[] = [];
  for (const group of plugin.groups) {
    const word = group.name;
    if (
      !PLUGIN_NAME.test(word) ||
      taken.has(word) ||
      RESERVED_WORDS.has(word) ||
      Object.hasOwn(FAMILIES, word) ||
      groups.some((g) => g.name === word)
    ) {
      throw new Error(`plugin ${name} cannot use the command group "${word}"`);
    }
    groups.push({
      name: word,
      summary: group.summary,
      ...(group.description === undefined ? {} : { description: group.description }),
      families: [...group.families],
    });
  }
  const ownsPath = (path: readonly string[]) => {
    if (!groups.some((g) => g.name === path[0])) {
      throw new Error(`plugin ${name} declares ${path.join(" ")} outside its groups`);
    }
  };
  const noWalletFields = (definition: object, path: readonly string[]) => {
    const field = WALLET_MANAGEMENT_FIELDS.find((f) => Object.hasOwn(definition, f));
    if (field) throw new Error(`plugin command ${path.join(" ")} sets ${field}`);
  };
  const capabilityPrefixes = [name, ...groups.map((g) => g.name)].map((p) => `${p}.`);
  const run =
    <I, O>(handler: (ctx: PluginCommandContext, net: any, input: I) => Promise<O>) =>
    (ctx: ExecutionContext, net: any, input: I) =>
      handler(pluginCommandContext(ctx, targets.timeoutMs), net, input);

  // Rejects duplicate paths within the plugin before anything is published.
  const scratch = new CommandRegistry();
  const staged: StagedPlugin = {
    groups,
    commands: [],
    chains: [],
    codes: new Map(),
    predicates: new Map(),
    followUps: new Map(),
  };
  let open = true;
  const declaring = () => {
    if (!open) throw new Error(`plugin ${name} declared after its registration ended`);
  };
  const host: PluginHost = facade<PluginHost>({
    apiVersion: PLUGIN_API_VERSION,
    services: targets.services,
    command(definition) {
      declaring();
      ownsPath(definition.path);
      noWalletFields(definition, definition.path);
      const command: CommandDefinition = { ...definition, run: run(definition.run) };
      scratch.add(command);
      staged.commands.push(command);
    },
    chainCommand(spec, family, binding) {
      declaring();
      ownsPath(spec.path);
      noWalletFields(spec, spec.path);
      if (!Object.hasOwn(FAMILIES, family)) throw new Error(`unknown family ${family}`);
      const coreBinding: FamilyBinding = { ...binding, run: run(binding.run) };
      scratch.addChain(spec, family, coreBinding);
      staged.chains.push({ spec, family, binding: coreBinding });
    },
    errorCodes(codes) {
      declaring();
      for (const [code, entry] of Object.entries(codes)) {
        const existing = staged.codes.get(code) ?? errorCodeEntry(code);
        if (existing !== undefined && !sameEntry(existing, entry)) {
          throw new Error(`plugin ${name} redefines the error code ${code}`);
        }
        staged.codes.set(code, { exit: entry.exit, retry: entry.retry, meaning: entry.meaning });
      }
    },
    capabilities(predicates) {
      declaring();
      for (const [key, predicate] of Object.entries(predicates)) {
        if (!capabilityPrefixes.some((prefix) => key.startsWith(prefix))) {
          throw new Error(`plugin ${name} cannot declare the capability ${key}`);
        }
        if (staged.predicates.has(key) || targets.capabilities.hasPredicate(key)) {
          throw new Error(`plugin ${name} redefines the capability ${key}`);
        }
        staged.predicates.set(key, predicate);
      }
    },
    followUps(steps) {
      declaring();
      for (const [step, spell] of Object.entries(steps)) {
        const existing = staged.followUps.get(step) ?? followUpSpelling(step);
        if (existing !== undefined && existing !== spell) {
          throw new Error(`plugin ${name} redefines the follow-up ${step}`);
        }
        staged.followUps.set(step, spell);
      }
    },
  });
  try {
    plugin.register(host);
  } finally {
    open = false;
  }
  return staged;
}

function sameEntry(a: ErrorCodeEntry, b: ErrorCodeEntry): boolean {
  return a.exit === b.exit && a.retry === b.retry && a.meaning === b.meaning;
}
