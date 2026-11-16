import { setTimeout as delay } from "node:timers/promises";
import {
  PLUGIN_API_REVISION,
  PLUGIN_API_VERSION,
  type PluginDefinition,
} from "../../plugin-api/index.js";
import type { PluginCommandContext } from "../../plugin-api/cli.js";
import { DEFAULT_X402_FACILITATOR_URL, x402ServiceFactory } from "../x402/api.js";
import { BaiClient } from "./adapters/outbound/bai/client.js";
import { BaiRechargeClient } from "./adapters/outbound/bai/recharge-client.js";
import { BAI_RECHARGE_ADDRESSES } from "./domain/recharge-addresses.js";
import { BaiService } from "./application/use-cases/bai-service.js";
import { BaiWalletBinding } from "./application/use-cases/bai-wallet-binding.js";
import { baiReportDelayMs } from "./application/use-cases/bai-report-delay.js";
import { BAI_CAPABILITIES } from "./application/capabilities.js";
import { BAI_FOLLOW_UPS } from "./adapters/inbound/follow-ups.js";
import { baiCommands, baiRechargeBinding, baiRechargeSpec } from "./adapters/inbound/commands.js";

const bai: PluginDefinition = {
  name: "bai",
  version: "1.0.0",
  apiVersion: PLUGIN_API_VERSION,
  apiRevision: PLUGIN_API_REVISION,
  groups: [
    {
      name: "bai",
      summary: "Query and recharge a B.AI account",
      description: "Query B.AI account credits, usage records, and recharge orders.",
      families: [],
    },
  ],
  register(host) {
    const { services } = host;
    const credentials = { baiApiKey: services.config.credential("baiApiKey") };
    const x402For = x402ServiceFactory(services);
    // B.AI pays through x402; both are built for the command run.
    const serviceFor = (ctx: PluginCommandContext) =>
      new BaiService(
        new BaiClient(credentials),
        () => new Date(),
        x402For(ctx),
        new BaiWalletBinding(services.signing),
        new BaiRechargeClient(credentials),
        { facilitatorUrl: DEFAULT_X402_FACILITATOR_URL, payTo: BAI_RECHARGE_ADDRESSES },
        {
          initialDelayMs: baiReportDelayMs(process.env.WALLET_CLI_BAI_REPORT_DELAY_MS),
          wait: (ms, signal) => delay(ms, undefined, { signal }),
        },
        services.gateways,
        services.accounts,
      );
    host.capabilities(BAI_CAPABILITIES);
    host.followUps(BAI_FOLLOW_UPS);
    host.chainCommand(
      baiRechargeSpec,
      "tron",
      baiRechargeBinding(serviceFor, credentials.baiApiKey),
    );
    host.chainCommand(
      baiRechargeSpec,
      "evm",
      baiRechargeBinding(serviceFor, credentials.baiApiKey),
    );
    for (const command of baiCommands(serviceFor)) host.command(command);
  },
};

export default bai;
