// Builds what a plugin registers against, checks everything it declares, and publishes it in one step.
import type { ChainFamily, Config, NetworkDescriptor } from "../../domain/types/index.js";
import { networkBlock } from "../../domain/types/index.js";
import type { ErrorCodeEntry, ErrorCodeTable } from "../../domain/errors/codes.js";
import { UsageError } from "../../domain/errors/index.js";
import { FAMILIES } from "../../domain/family/index.js";
import type { BroadcastGuard } from "../../application/contracts/broadcast-guard.js";
import type { WallClock } from "../../application/contracts/wall-clock.js";
import type { DispatchCheck, ExecutionDeadline } from "../../application/contracts/deadline.js";
import type { ChainGatewayProvider } from "../../application/ports/chain/gateway-provider.js";
import type { NetworkRegistry } from "../../application/ports/network-registry.js";
import type { AccountStore } from "../../application/ports/account-store.js";
import type {
  CapabilityRegistry,
  CapabilitySupport,
} from "../../application/services/capability/index.js";
import type { PluginSigning } from "../../application/services/plugins/plugin-signing.js";
import type { RecipientResolver } from "../../application/services/recipient-resolver.js";
import type { ProcessLifetime } from "../process-lifetime.js";
import type {
  ChainSpec,
  CommandDefinition,
  ExecutionContext,
  FamilyBinding,
} from "../../adapters/inbound/cli/contracts/index.js";
import { SECRET_KINDS } from "../../adapters/inbound/cli/contracts/index.js";
import { CommandRegistry, type HelpGroup } from "../../adapters/inbound/cli/registry/index.js";
import type { FollowUpTable } from "../../adapters/inbound/cli/output/errors.js";
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
import type {
  PluginEvmGateway,
  PluginGateways,
  PluginSigningService,
  PluginSignRequest,
  PluginTokens,
  PluginTronCalls,
  PluginTronGateway,
} from "../../plugin-api/host-services.js";
import {
  parsePluginCredentials,
  type PluginCredentialManifest,
} from "../../domain/plugins/index.js";
import type { JsonValue } from "../../domain/types/index.js";
import type { TransactionScope } from "../../application/contracts/execution-scope.js";
import type { TronContractService } from "../../application/use-cases/tron/contract-service.js";
import type { EvmContractService } from "../../application/use-cases/evm/contract-service.js";

const PLUGIN_NAME = /^[a-z0-9][a-z0-9-]*$/;
// Words the core keeps for itself even before it registers a command under them.
export const RESERVED_WORDS: ReadonlySet<string> = new Set(["plugin", "help"]);

// An object with exactly these members: no prototype, frozen, every value a closure or plain data.
export function facade<T extends object>(members: T): T {
  return Object.freeze(Object.create(null, Object.getOwnPropertyDescriptors(members))) as T;
}

export interface HostServiceDependencies {
  readonly signing: PluginSigning;
  readonly tronCalls: PluginTronCalls;
  readonly tokens: PluginTokens;
  readonly aliases: Readonly<Record<string, string>>;
  readonly networks: Pick<NetworkRegistry, "resolve">;
  readonly lifetime: Pick<ProcessLifetime, "keepAlive">;
  readonly accounts: Pick<AccountStore, "resolveAccount">;
  readonly gateways: ChainGatewayProvider;
  readonly contracts: {
    readonly tron: Pick<TronContractService, "call" | "send">;
    readonly evm: Pick<EvmContractService, "call" | "send">;
  };
  readonly recipients: Pick<RecipientResolver, "resolve">;
  readonly config: Pick<Config, "credentials">;
  readonly broadcastGuard: BroadcastGuard;
  readonly clock: WallClock;
}

export function hostServices(deps: HostServiceDependencies): HostServices {
  const { signing, gateways, contracts, recipients, config, broadcastGuard, clock } = deps;
  const { tronCalls, tokens } = deps;
  const aliases = Object.freeze({ ...deps.aliases });
  return facade<HostServices>({
    signing: facade({
      assertCanSign: (account, family) => signing.assertCanSign(account, family),
      prepare: (account, family) => signing.prepare(account, family),
      signerAddress: (account, family) => signing.signerAddress(account, family),
      sign: ((scope: TransactionScope, request: PluginSignRequest<never>) =>
        signing.sign(scope, request)) as PluginSigningService["sign"],
    }),
    gateways: facade({
      get: ((network: NetworkDescriptor, family: ChainFamily, check: DispatchCheck) => {
        if (family === "evm") {
          const evm = gateways.get(network, "evm", check);
          return facade({
            getTransactionReceipt: (hash: string) => evm.getTransactionReceipt(hash),
            getErc20Balance: (contract: string, owner: string) =>
              evm.getErc20Balance(contract, owner),
          } satisfies PluginEvmGateway);
        }
        const gateway = gateways.get(network, "tron", check);
        return facade({
          getTrc20Balance: (contract: string, address: string) =>
            gateway.getTrc20Balance(contract, address),
          getTokenInfo: (contract: string) => gateway.getTokenInfo(contract),
          getAccount: (address: string) => gateway.getAccount(address),
          getTransactionInfoById: (txid: string) => gateway.getTransactionInfoById(txid),
          receivedAmount: (txid: string, token: string, recipient: string) =>
            gateway.receivedAmount(txid, token, recipient),
          triggerConstantContract: (
            contract: string,
            method: string,
            parameters: Parameters<PluginTronGateway["triggerConstantContract"]>[2],
            owner?: string,
          ) => gateway.triggerConstantContract(contract, method, parameters, owner),
        } satisfies PluginTronGateway);
      }) as PluginGateways["get"],
      client: (network, check) => {
        const client = gateways.client(network, check);
        return facade({ getNativeBalance: (address: string) => client.getNativeBalance(address) });
      },
    }),
    contracts: facade({
      tron: facade({
        call: (deadline, network, contract, method, parameters) =>
          contracts.tron.call(deadline, network, contract, method, parameters),
        send: (scope, network, input) => contracts.tron.send(scope, network, input),
      }),
      evm: facade({
        call: (deadline, network, contract, method, params) =>
          contracts.evm.call(deadline, network, contract, method, params),
        send: (scope, network, input) => contracts.evm.send(scope, network, input),
      }),
    }),
    tronCalls: facade({
      run: (scope, network, payload, options) => tronCalls.run(scope, network, payload, options),
    }),
    tokens: facade({
      official: (networkId) => tokens.official(networkId),
      effective: (networkId, account) => tokens.effective(networkId, account),
    }),
    networks: facade({
      aliases: () => aliases,
      resolve: (id) => deps.networks.resolve(id),
    }),
    recipients: facade({ resolve: (family, input) => recipients.resolve(family, input) }),
    config: facade({
      networkBlock: (network, name) => networkBlock(network, name),
      // Each plugin receives this behind its own check of the keys it declared.
      credential: (key) => config.credentials.get(key),
    }),
    broadcastGuard: facade({ assertAllowed: () => broadcastGuard.assertAllowed() }),
    clock: facade({ now: () => clock() }),
    lifetime: facade({ keepAlive: () => deps.lifetime.keepAlive() }),
    // Only whether the selector resolves; the wallet record stays in the core.
    accounts: facade({
      checkAccount: (account, family) => {
        deps.accounts.resolveAccount(account, family);
      },
    }),
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
    readStdinBytes: async (input?: string) => {
      const claimed = SECRET_KINDS.find((kind) => ctx.secrets.has(kind));
      if (claimed !== undefined) {
        const flag = `--${camelToKebab(claimed)}-stdin`;
        throw new UsageError(
          "invalid_option",
          input === undefined
            ? `stdin is already used by ${flag}`
            : `${input} cannot share stdin with ${flag}`,
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
  readonly errorCodes: ErrorCodeTable;
  readonly followUps: FollowUpTable;
  // Every configured network; a plugin's predicates are evaluated on each before it is published.
  readonly networks: readonly NetworkDescriptor[];
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

// Publishes all of a plugin's declarations, or none of them. `credentials` is the validated list of
// an installed plugin's manifest; without it, the definition's own list is read once.
export function registerPlugin(
  plugin: PluginDefinition,
  targets: PluginTargets,
  credentials?: readonly PluginCredentialManifest[],
): PluginRegistration {
  try {
    const staged = stage(plugin, targets, credentials);
    const predicates = evaluatePredicates(staged.predicates, targets.networks);
    // The only step that can refuse; it checks the whole batch before it changes anything.
    targets.commands.addAll(staged);
    targets.errorCodes.declare(Object.fromEntries(staged.codes));
    targets.capabilities.addPredicates(predicates);
    targets.followUps.register(Object.fromEntries(staged.followUps));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

// Runs each predicate on every configured network now, so a throwing predicate fails its plugin
// instead of composition; the registry then reads the recorded results.
function evaluatePredicates(
  predicates: ReadonlyMap<string, CapabilityPredicate>,
  networks: readonly NetworkDescriptor[],
): Record<string, CapabilityPredicate> {
  const out: Record<string, CapabilityPredicate> = {};
  for (const [key, predicate] of predicates) {
    const results = new Map<string, CapabilitySupport>();
    for (const network of networks) {
      try {
        results.set(network.id, predicate(network));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`capability ${key} failed on ${network.id}: ${reason}`, { cause: error });
      }
    }
    out[key] = (network) =>
      results.has(network.id) ? results.get(network.id)! : predicate(network);
  }
  return out;
}

// A copy of a declaration's plain data (arrays and plain objects, recursively), frozen, so the
// plugin cannot change what the host checked. Schemas, functions and other objects are kept as is.
function snapshot<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((item) => snapshot(item))) as T;
  if (typeof value !== "object" || value === null) return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(value))
    copy[key] = snapshot((value as Record<string, unknown>)[key]);
  return Object.freeze(copy) as T;
}

function stage(
  plugin: PluginDefinition,
  targets: PluginTargets,
  credentials: readonly PluginCredentialManifest[] | undefined,
): StagedPlugin {
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
  for (const declared of snapshot([...plugin.groups])) {
    const word = declared.name;
    if (
      typeof word !== "string" ||
      !PLUGIN_NAME.test(word) ||
      taken.has(word) ||
      RESERVED_WORDS.has(word) ||
      Object.hasOwn(FAMILIES, word) ||
      groups.some((g) => g.name === word)
    ) {
      throw new Error(`plugin ${name} cannot use the command group "${String(word)}"`);
    }
    groups.push({
      name: word,
      summary: declared.summary,
      ...(declared.description === undefined ? {} : { description: declared.description }),
      families: declared.families,
    });
  }
  const ownsPath = (path: readonly string[]) => {
    if (!Array.isArray(path) || !groups.some((g) => g.name === path[0])) {
      throw new Error(`plugin ${name} declares ${String(path)} outside its groups`);
    }
  };
  // `in` also finds a field the declaration inherits.
  const noWalletFields = (definition: object, path: readonly string[]) => {
    const field = WALLET_MANAGEMENT_FIELDS.find((f) => f in definition);
    if (field) throw new Error(`plugin command ${path.join(" ")} sets ${field}`);
  };
  const declaredKeys = new Set(
    (
      credentials ?? parsePluginCredentials(snapshot(plugin.credentials) as JsonValue | undefined)
    ).map((c) => c.key),
  );
  const services = facade<HostServices>({
    ...targets.services,
    config: facade({
      networkBlock: (network: NetworkDescriptor, block: string) =>
        targets.services.config.networkBlock(network, block),
      credential: (key: string) => {
        if (!declaredKeys.has(key)) {
          throw new Error(`plugin ${name} did not declare the credential ${String(key)}`);
        }
        return targets.services.config.credential(key);
      },
    }),
  });
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
  // One snapshot per declared spec, so families bound to one spec share it.
  const specs = new Map<object, ChainSpec>();
  let open = true;
  let refused: unknown;
  // Every declaration checks its whole input before it stages any of it. A refusal fails the
  // registration even when the plugin catches the exception.
  const declare =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A): void => {
      if (!open) throw new Error(`plugin ${name} declared after its registration ended`);
      try {
        fn(...args);
      } catch (error) {
        refused ??= error;
        throw error;
      }
    };
  const host: PluginHost = facade<PluginHost>({
    apiVersion: PLUGIN_API_VERSION,
    services,
    command: declare((definition) => {
      noWalletFields(definition, definition.path);
      const command: CommandDefinition = snapshot({ ...definition, run: run(definition.run) });
      ownsPath(command.path);
      scratch.add(command);
      staged.commands.push(command);
    }),
    chainCommand: declare((declared, family, binding) => {
      if (!Object.hasOwn(FAMILIES, family)) throw new Error(`unknown family ${family}`);
      let spec = specs.get(declared);
      if (spec === undefined) {
        noWalletFields(declared, declared.path);
        spec = snapshot({ ...declared }) as ChainSpec;
        ownsPath(spec.path);
      }
      const coreBinding: FamilyBinding = snapshot({ ...binding, run: run(binding.run) });
      scratch.addChain(spec, family, coreBinding);
      specs.set(declared, spec);
      staged.chains.push({ spec, family, binding: coreBinding });
    }),
    errorCodes: declare((codes) => {
      const accepted = new Map<string, ErrorCodeEntry>();
      for (const [code, declared] of Object.entries(codes)) {
        const entry = { exit: declared.exit, retry: declared.retry, meaning: declared.meaning };
        const existing =
          accepted.get(code) ?? staged.codes.get(code) ?? targets.errorCodes.entry(code);
        if (existing !== undefined && !sameEntry(existing, entry)) {
          throw new Error(`plugin ${name} redefines the error code ${code}`);
        }
        accepted.set(code, entry);
      }
      for (const [code, entry] of accepted) staged.codes.set(code, entry);
    }),
    capabilities: declare((predicates) => {
      const accepted = new Map<string, CapabilityPredicate>();
      for (const [key, predicate] of Object.entries(predicates)) {
        if (!capabilityPrefixes.some((prefix) => key.startsWith(prefix))) {
          throw new Error(`plugin ${name} cannot declare the capability ${key}`);
        }
        if (typeof predicate !== "function") {
          throw new Error(`plugin ${name} declares the capability ${key} without a predicate`);
        }
        if (staged.predicates.has(key) || targets.capabilities.hasPredicate(key)) {
          throw new Error(`plugin ${name} redefines the capability ${key}`);
        }
        accepted.set(key, predicate);
      }
      for (const [key, predicate] of accepted) staged.predicates.set(key, predicate);
    }),
    followUps: declare((steps) => {
      const accepted = new Map<string, (subject?: string) => string>();
      for (const [step, spell] of Object.entries(steps)) {
        const existing =
          accepted.get(step) ?? staged.followUps.get(step) ?? targets.followUps.spelling(step);
        if (existing !== undefined && existing !== spell) {
          throw new Error(`plugin ${name} redefines the follow-up ${step}`);
        }
        accepted.set(step, spell);
      }
      for (const [step, spell] of accepted) staged.followUps.set(step, spell);
    }),
  });
  try {
    plugin.register(host);
  } finally {
    open = false;
  }
  if (refused !== undefined) throw refused;
  return staged;
}

function sameEntry(a: ErrorCodeEntry, b: ErrorCodeEntry): boolean {
  return a.exit === b.exit && a.retry === b.retry && a.meaning === b.meaning;
}
