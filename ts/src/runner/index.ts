/**
 * Runner (L5, entry) — intercept meta flags (short-circuit HelpService); otherwise compose
 * the app, build yargs, parseAsync, and funnel any typed error into exactly one terminal
 * output + a 0/1/2 exit code. yargs only parses + dispatches; it never writes or exits. (plan §3 L5)
 */
import { hideBin } from "yargs/helpers";
import type { ExitCode, Globals, NetworkDescriptor, OutputMode } from "../types/index.js";
import { normalizeError } from "../errors/index.js";
import { ConfigLoader, NetworkRegistry } from "../config/index.js";
import { AtomicFileStore } from "../fs/index.js";
import { StreamManager } from "../stream/index.js";
import { SecretResolver, type SecretFlags } from "../secret/index.js";
import { Keystore } from "../keystore/index.js";
import { Ledger } from "../ledger/index.js";
import { SignerResolver } from "../signer/index.js";
import { TxPipeline } from "../pipeline/index.js";
import { CapabilityRegistry } from "../chain/index.js";
import { CapabilityGate } from "../capability/index.js";
import { CommandRegistry } from "../registry/index.js";
import { createOutputFormatter } from "../output/index.js";
import { HelpService, hasMeta } from "../help/index.js";
import { buildCli, type SessionRef } from "../cli/index.js";
import { EvmRpcClient, TronRpcClient } from "../rpc/index.js";
import type { ChainModule } from "../types/index.js";
import { registerNeutralCommands } from "../modules/neutral.js";
import { TronModule } from "../modules/tron.js";
import { EvmModule } from "../modules/evm.js";

export const VERSION = "0.1.0";

interface ParsedGlobals {
  output?: OutputMode;
  network?: string;
  account?: string;
  wallet?: string;
  timeout?: number;
  quiet: boolean;
  verbose: boolean;
  noDeviceWait: boolean;
  grpcEndpoint?: string;
  rpcUrl?: string;
  secretFlags: SecretFlags;
}

const VALUE_FLAGS: Record<string, keyof ParsedGlobals> = {
  "--output": "output", "-o": "output",
  "--network": "network", "--account": "account", "--wallet": "wallet",
  "--timeout": "timeout", "--grpc-endpoint": "grpcEndpoint", "--rpc-url": "rpcUrl",
};

export function parseGlobals(tokens: string[]): ParsedGlobals {
  const g: ParsedGlobals = { quiet: false, verbose: false, noDeviceWait: false, secretFlags: {} };
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
    switch (tok) {
      case "--quiet": g.quiet = true; break;
      case "--verbose": g.verbose = true; break;
      case "--no-device-wait": g.noDeviceWait = true; break;
      case "--password-stdin": g.secretFlags.passwordStdin = true; break;
      case "--private-key-stdin": g.secretFlags.privateKeyStdin = true; break;
      case "--mnemonic-stdin": g.secretFlags.mnemonicStdin = true; break;
      case "--tx-stdin": g.secretFlags.txStdin = true; break;
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
  for (const n of Object.values(config.networks)) capabilityRegistry.register(n.id, n.capabilities);

  const rpcFactory = (d: NetworkDescriptor) =>
    d.family === "tron"
      ? new TronRpcClient(d.rpcUrl ?? httpFromGrpc(d.grpcEndpoint))
      : new EvmRpcClient(d.rpcUrl ?? "");
  const networkRegistry = new NetworkRegistry(config, rpcFactory, {
    rpcUrl: g.rpcUrl,
    grpcEndpoint: g.grpcEndpoint,
  });
  const secrets = new SecretResolver(streams, g.secretFlags);
  const keystore = new Keystore(root, store, () => secrets.masterPassword());
  const ledger = new Ledger();
  const signerResolver = new SignerResolver(keystore, ledger);
  const txPipeline = new TxPipeline(signerResolver);
  const services = { keystore, ledger, signerResolver, txPipeline, capabilityRegistry };

  const registry = new CommandRegistry();
  registerNeutralCommands(registry, services);
  const chainModules: ChainModule[] = [new TronModule(services), new EvmModule(services)];
  for (const m of chainModules) m.registerCommands(registry);

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
    wallet: g.wallet,
    timeoutMs: g.timeout,
    quiet: g.quiet,
    verbose: g.verbose,
    noDeviceWait: g.noDeviceWait,
    grpcEndpoint: g.grpcEndpoint,
    rpcUrl: g.rpcUrl,
  };
  const deps = { config, networkRegistry, streams, secrets, keystore, formatter };
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
