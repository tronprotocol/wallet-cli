/**
 * Runner (L5, entry) — intercept meta flags (short-circuit HelpService); otherwise compose
 * the app, build yargs, parseAsync, and funnel any typed error into exactly one terminal
 * output + a 0/1/2 exit code. yargs only parses + dispatches; it never writes or exits. (plan §3 L5)
 */
import { hideBin } from "yargs/helpers";
import type { ChainFamily, ExitCode, Globals, NetworkDescriptor, OutputMode } from "../../core/types/index.js";
import type { FamilyAdapter, SignStrategy } from "../../core/family/index.js";
import { CHAIN_FAMILIES } from "../../core/family/index.js";
import { normalizeError } from "../../core/errors/index.js";
import { ConfigLoader, NetworkRegistry } from "../../infra/config/index.js";
import { AtomicFileStore } from "../../core/fs/index.js";
import { StreamManager } from "../../core/stream/index.js";
import { SecretResolver, type SecretPaths } from "../../infra/secret/index.js";
import { createPrompter } from "../../infra/prompt/index.js";
import { Keystore } from "../../infra/keystore/index.js";
import { Ledger } from "../../infra/ledger/index.js";
import { TokenBook } from "../../infra/tokenbook/index.js";
import { createPriceProvider } from "../../infra/price/index.js";
import { SignerResolver } from "../../runtime/signer/index.js";
import { TxPipeline } from "../../runtime/pipeline/index.js";
import { CapabilityRegistry } from "../../runtime/chain/index.js";
import { CapabilityGate } from "../../runtime/capability/index.js";
import { CommandRegistry } from "../../runtime/registry/index.js";
import { createOutputFormatter } from "../../runtime/output/index.js";
import { HelpService, hasMeta } from "../../cli/help/index.js";
import { buildCli, type SessionRef } from "../../cli/shell/index.js";
import { EvmRpcClient, TronRpcClient } from "../../infra/rpc/index.js";
import { evmSignStrategy, tronSignStrategy } from "../../runtime/signer/strategies.js";
import type { ChainModule } from "../../core/types/index.js";
import { registerWalletCommands } from "../../commands/wallet.js";
import { registerConfigCommands } from "../../commands/config.js";
import { registerChainCommands } from "../../commands/chain.js";
import { TronModule } from "../../commands/tron/index.js";
import { EvmModule } from "../../commands/evm/index.js";

export const VERSION = "0.1.0";

/** human summaries for network-specific capability traits (non command-backed). */
const TRAIT_SUMMARIES: Record<string, string> = {
  "fee.eip1559": "EIP-1559 fee market",
};

interface ParsedGlobals {
  output?: OutputMode;
  network?: string;
  account?: string;
  timeout?: number;
  quiet: boolean;
  verbose: boolean;
  noDeviceWait: boolean;
  grpcEndpoint?: string;
  rpcUrl?: string;
  secretPaths: SecretPaths;
}

const VALUE_FLAGS: Record<string, keyof ParsedGlobals> = {
  "--output": "output", "-o": "output",
  "--network": "network", "--account": "account",
  "--timeout": "timeout", "--grpc-endpoint": "grpcEndpoint", "--rpc-url": "rpcUrl",
};

/** `--<kind>-stdin` reads fd 0 (secretPaths value "-"). The `--<kind>-file`/`/dev/fd/N` multi-fd
 *  path was removed; commands needing a 2nd secret go interactive (spec §6 / plan §7.13.1). */
const SECRET_STDIN_FLAGS: Record<string, keyof SecretPaths> = {
  "--password-stdin": "password",
  "--private-key-stdin": "privateKey",
  "--mnemonic-stdin": "mnemonic",
  "--tx-stdin": "tx",
  "--message-stdin": "message",
};

export function parseGlobals(tokens: string[]): ParsedGlobals {
  const g: ParsedGlobals = { quiet: false, verbose: false, noDeviceWait: false, secretPaths: {} };
  for (let i = 0; i < tokens.length; i++) {
    let tok = tokens[i]!;
    let inlineVal: string | undefined;
    const eq = tok.indexOf("=");
    if (tok.startsWith("--") && eq !== -1) {
      inlineVal = tok.slice(eq + 1);
      tok = tok.slice(0, eq);
    }
    const valueKey = VALUE_FLAGS[tok];
    if (valueKey) {
      const v = inlineVal ?? tokens[++i];
      if (v === undefined) continue;
      if (valueKey === "timeout") {
        const n = Number(v);
        g.timeout = Number.isFinite(n) && n >= 0 ? n : undefined; // invalid → fall back to config default
      } else if (valueKey === "output") {
        if (v === "json" || v === "text") g.output = v; // invalid → undefined; yargs choices reports it
      } else (g as any)[valueKey] = v;
      continue;
    }
    const stdinKind = SECRET_STDIN_FLAGS[tok];
    if (stdinKind) {
      g.secretPaths[stdinKind] = "-";
      continue;
    }
    switch (tok) {
      case "--quiet": g.quiet = true; break;
      case "--verbose": g.verbose = true; break;
      case "--no-device-wait": g.noDeviceWait = true; break;
    }
  }
  return g;
}

function httpFromGrpc(grpc?: string): string {
  if (!grpc) return "";
  return `https://${grpc.replace(/^grpc\./, "api.").replace(/:\d+$/, "")}`;
}

export async function main(argv: string[]): Promise<ExitCode> {
  const startedAt = Date.now();
  const tokens = hideBin(argv);

  const config = ConfigLoader.load();
  const g = parseGlobals(tokens);
  const output: OutputMode = g.output ?? config.defaultOutput;
  const streams = new StreamManager(output, g.quiet, g.verbose);
  const formatter = createOutputFormatter(output, streams, startedAt);

  // ── compose (all side-effect-free until a command runs) ──
  const root = ConfigLoader.resolveRoot();
  const store = new AtomicFileStore();
  const capabilityRegistry = new CapabilityRegistry();

  // Composition root: the single place that knows concrete per-family classes. Each FamilyAdapter
  // bundles a family's behaviour (rpc construction + sign strategy); lower layers receive only the
  // injected slices they need (plan §7.12.1). Adding a chain = one more entry here + one in FAMILIES.
  const ADAPTERS: Record<ChainFamily, FamilyAdapter> = {
    tron: {
      family: "tron",
      makeRpc: (d) => new TronRpcClient(d.rpcUrl ?? httpFromGrpc(d.grpcEndpoint)),
      sign: tronSignStrategy,
    },
    evm: {
      family: "evm",
      makeRpc: (d) => new EvmRpcClient(d.rpcUrl ?? ""),
      sign: evmSignStrategy,
    },
  };
  const rpcFactory = (d: NetworkDescriptor) => ADAPTERS[d.family].makeRpc(d);
  const signStrategies = Object.fromEntries(
    CHAIN_FAMILIES.map((f) => [f, ADAPTERS[f].sign]),
  ) as Record<ChainFamily, SignStrategy>;
  const networkRegistry = new NetworkRegistry(config, rpcFactory, {
    rpcUrl: g.rpcUrl,
    grpcEndpoint: g.grpcEndpoint,
  });
  const prompter = createPrompter();
  const secrets = new SecretResolver(streams, g.secretPaths, prompter);
  const keystore = new Keystore(root, store, () => secrets.masterPassword());
  const ledger = new Ledger();
  const tokenBook = new TokenBook(root, store);
  const priceProvider = createPriceProvider(config.price);
  const signerResolver = new SignerResolver(keystore, ledger, signStrategies);
  const txPipeline = new TxPipeline(signerResolver);
  const services = { keystore, ledger, tokenBook, priceProvider, signerResolver, txPipeline, capabilityRegistry };

  const registry = new CommandRegistry();
  registerWalletCommands(registry, services);
  registerConfigCommands(registry);
  registerChainCommands(registry);
  const chainModules: ChainModule[] = [new TronModule(services), new EvmModule(services)];
  for (const m of chainModules) m.registerCommands(registry);

  // Single source of truth for capabilities: command-backed caps come from each module's
  // descriptors; network-specific traits (e.g. fee.eip1559) come from the NetworkDescriptor.
  const capsByFamily = new Map(chainModules.map((m) => [m.family, m.capabilities()]));
  for (const n of Object.values(config.networks)) {
    const cmdCaps = capsByFamily.get(n.family) ?? [];
    const traits = n.capabilities.map((key) => ({ key, summary: TRAIT_SUMMARIES[key] ?? key }));
    capabilityRegistry.register(n.id, [...cmdCaps, ...traits]);
  }

  // ── meta short-circuit (keeps JSON stdout clean) ──
  if (hasMeta(tokens)) {
    const help = new HelpService(registry, streams, VERSION);
    try {
      return help.handleMeta(tokens);
    } catch (e) {
      const err = normalizeError(e);
      if (err.code === "internal_error") streams.diagnostic("debug", `internal error: ${String(e)}`);
      formatter.error(err);
      return err.exitCode();
    }
  }

  const globals: Globals = {
    output,
    network: g.network,
    account: g.account,
    timeoutMs: g.timeout,
    quiet: g.quiet,
    verbose: g.verbose,
    noDeviceWait: g.noDeviceWait,
    grpcEndpoint: g.grpcEndpoint,
    rpcUrl: g.rpcUrl,
  };
  const deps = { config, networkRegistry, streams, secrets, keystore, prompter, formatter };
  const session: SessionRef = {};
  const cli = buildCli({
    registry,
    globals,
    deps,
    capGate: new CapabilityGate(capabilityRegistry),
    streams,
    formatter,
    session,
  });

  try {
    await cli.parseAsync(tokens);
    return 0;
  } catch (e) {
    const err = normalizeError(e);
    if (err.code === "internal_error") streams.diagnostic("debug", `internal error: ${String(e)}`);
    formatter.error(err, { commandId: session.current?.commandId, net: session.current?.net });
    return err.exitCode();
  }
}
