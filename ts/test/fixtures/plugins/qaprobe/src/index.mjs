// @ts-check
/* global QAPROBE_VARIANT, QAPROBE_VERSION */
// The QA probe plugin: built only against @tron-walletcli/plugin-sdk and bundled to one module.
// QAPROBE_VARIANT and QAPROBE_VERSION are replaced at build time; see test/plugins/qaprobe.ts.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PLUGIN_API_REVISION, PLUGIN_API_VERSION } from "@tron-walletcli/plugin-sdk";
import { sleepWithin } from "@tron-walletcli/plugin-sdk/application";
import { tronTxModeFields, txModeExclusive, txModeFields, z } from "@tron-walletcli/plugin-sdk/cli";
import { ChainError, errorMessage, followUp, sunAmount } from "@tron-walletcli/plugin-sdk/domain";

/** @type {string} */
const VARIANT = QAPROBE_VARIANT;
/** @type {string} */
const VERSION = QAPROBE_VERSION;

// Counts how often this installed file was imported, so tests can see which commands import it.
const counter = join(
  tmpdir(),
  `qaprobe-imports-${createHash("sha256")
    .update(import.meta.url)
    .digest("hex")
    .slice(0, 16)}`,
);
let imports = 1;
try {
  imports += Number(readFileSync(counter, "utf8")) || 0;
} catch {
  // first import
}
writeFileSync(counter, String(imports));

if (VARIANT === "import-failure") throw new Error("qaprobe failed while it was imported");

const name = VARIANT === "conflict" ? "qaprobe-twin" : "qaprobe";
const group = "qaprobe";

const readFields = z.object({
  value: z
    .string()
    .optional()
    .describe("value to echo; failure fails, slow waits for the deadline"),
  contract: z.string().optional().describe("TRC20 contract whose name() the probe reads"),
});

const signFields = z.object({
  message: z.string().min(1).describe("message to sign as `message sign` signs it"),
});

const transferFields = z.object({
  contract: z.string().min(1).describe("TRC20 contract"),
  to: z.string().min(1).describe("recipient address"),
  amount: z.string().regex(/^\d+$/).describe("amount in the token's base units"),
  ...txModeFields,
  ...tronTxModeFields,
});

const empty = z.object({});

/** @type {import("@tron-walletcli/plugin-sdk").PluginDefinition} */
const plugin = {
  name,
  version: VERSION,
  apiVersion: PLUGIN_API_VERSION + (VARIANT === "api-version" ? 1 : 0),
  apiRevision: PLUGIN_API_REVISION + (VARIANT === "api-revision" ? 1 : 0),
  groups: [{ name: group, summary: "QA probe commands", families: ["tron"] }],
  register(host) {
    const services = host.services;
    host.errorCodes({
      qaprobe_refused: { exit: 2, retry: "never", meaning: "the QA probe refused the value" },
    });
    host.followUps({ "qaprobe-read": (subject) => `qaprobe read --value ${subject ?? "ok"}` });
    host.capabilities({
      "qaprobe.read": (network) => (network.family === "tron" ? "supported" : "unsupported"),
    });
    host.chainCommand(
      {
        path: [group, "read"],
        network: "optional",
        wallet: "none",
        auth: "none",
        capability: "qaprobe.read",
        summary: "Echo a value, or read a TRC20 name",
        baseFields: readFields,
        examples: [{ cmd: "wallet-cli qaprobe read --value hello" }],
        formatText: (data) => `value: ${data.value}`,
      },
      "tron",
      {
        async run(ctx, net, input) {
          if (input.value === "failure") {
            throw new ChainError(
              "qaprobe_refused",
              errorMessage`the probe refuses this value; try ${followUp("qaprobe-read", "ok")}`,
            );
          }
          if (input.value === "slow" && !(await sleepWithin(ctx.deadline, 600_000))) {
            ctx.deadline.assertActive();
          }
          const token = input.contract
            ? await services.contracts.tron.call(ctx.deadline, net, input.contract, "name()", [])
            : undefined;
          return {
            value: input.value ?? "ok",
            network: net.id,
            ...(token ? { token: token.result } : {}),
          };
        },
      },
    );
    if (VARIANT === "register-failure") {
      try {
        host.capabilities({ "elsewhere.read": () => "supported" });
      } catch {
        // The refusal must fail the registration even though it is caught here.
      }
    }
    host.chainCommand(
      {
        path: [group, "sign"],
        network: "optional",
        wallet: "optional",
        auth: "required",
        summary: "Sign a message through the host signing service",
        baseFields: signFields,
        examples: [{ cmd: "wallet-cli qaprobe sign --message hello" }],
      },
      "tron",
      {
        async run(ctx, net, input) {
          const signature = await services.signing.sign(ctx, {
            network: net,
            family: "tron",
            payload: { kind: "message", message: input.message },
          });
          return {
            address: services.signing.signerAddress(ctx.activeAccount, "tron"),
            message: input.message,
            signature,
          };
        },
      },
    );
    host.chainCommand(
      {
        path: [group, "transfer"],
        network: "optional",
        wallet: "optional",
        auth: "required",
        broadcasts: true,
        summary: "Send a TRC20 transfer through the host contract service",
        baseFields: transferFields,
        exclusive: [txModeExclusive],
        examples: [{ cmd: "wallet-cli qaprobe transfer --contract T... --to T... --amount 1" }],
      },
      "tron",
      {
        async run(ctx, net, input) {
          return services.contracts.tron.send(ctx, net, {
            contract: input.contract,
            method: "transfer(address,uint256)",
            parameters: [
              { type: "address", value: input.to },
              { type: "uint256", value: input.amount },
            ],
            callValueSun: sunAmount(0n),
            feeLimit: sunAmount(100_000_000n),
            dryRun: input.dryRun,
            signOnly: input.signOnly,
            buildOnly: input.buildOnly,
            permissionId: input.permissionId,
            ...(input.expiration === undefined ? {} : { expiration: input.expiration }),
          });
        },
      },
    );
    host.chainCommand(
      {
        path: [group, "inspect"],
        network: "optional",
        wallet: "none",
        auth: "none",
        summary: "Show what the plugin can reach",
        baseFields: empty,
        examples: [{ cmd: "wallet-cli qaprobe inspect" }],
      },
      "tron",
      {
        async run(ctx) {
          return {
            imports,
            context: Object.keys(ctx).sort(),
            services: Object.keys(services).sort(),
            signing: Object.keys(services.signing).sort(),
            host: Object.keys(host).sort(),
          };
        },
      },
    );
  },
};

export default plugin;
