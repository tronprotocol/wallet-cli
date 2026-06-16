/**
 * Shared chain-command factories (L4) — ONLY for commands whose intent AND input shape are
 * identical across families (rule of three; plan §3 L4). Divergent commands (e.g. send-native,
 * with chain-specific amount units + build/estimate) live explicitly in each chain module.
 */
import { z } from "zod";
import type { ChainFamily, CommandDefinition } from "../types/index.js";
import { Schemas } from "../contract/index.js";
import type { Services } from "./services.js";

const unitOf = (f: ChainFamily) => (f === "tron" ? "sun" : "wei");
const sampleNet = (f: ChainFamily) => (f === "tron" ? "nile" : "base");

/** account balance — read native balance of the active (or given) address. */
export function balanceCommand(family: ChainFamily): CommandDefinition {
  const fields = z.object({
    address: Schemas.addressFor(family).optional().describe("target address (default: active account)"),
  });
  return {
    id: `${family}.account.balance`,
    path: ["account", "balance"],
    family,
    network: "required",
    wallet: "optional",
    auth: "none",
    capability: "account.balance.native",
    summary: `get native ${unitOf(family)} balance`,
    fields,
    input: fields,
    examples: [{ cmd: `wallet-cli ${family} account balance --network ${sampleNet(family)}` }],
    run: async (ctx, net, input) => {
      const address = input.address ?? ctx.resolveAddress(family);
      const balance = await net!.rpc!.getNativeBalance(address);
      return { address, balance, unit: unitOf(family) };
    },
  };
}

/** message sign — direct SignerResolver path (no node, no TxPipeline). */
export function messageSignCommand(family: ChainFamily, services: Services): CommandDefinition {
  const fields = z.object({ message: z.string().min(1).describe("message to sign") });
  return {
    id: `${family}.message.sign`,
    path: ["message", "sign"],
    family,
    network: "none",
    wallet: "required",
    auth: "required",
    capability: "message.sign",
    summary: "sign an arbitrary message",
    fields,
    input: fields,
    examples: [{ cmd: `wallet-cli ${family} message sign --message "hello"` }],
    run: async (ctx, _net, input) => {
      const signer = services.signerResolver.resolve(ctx.activeAccount, family);
      const signature = await signer.signMessage(input.message, {});
      return { address: signer.address, message: input.message, signature };
    },
  };
}
