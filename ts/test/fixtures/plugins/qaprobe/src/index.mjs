// @ts-check
/* global QAPROBE_VARIANT, QAPROBE_VERSION */
// The QA probe plugin: built only against @tron-walletcli/plugin-sdk and bundled to one module.
// QAPROBE_VARIANT and QAPROBE_VERSION are replaced at build time; see test/plugins/qaprobe.ts.
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
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

const FAMILIES = /** @type {const} */ (["tron", "evm"]);

// Test controls, set by the test that runs the CLI: the SHA-256 digests of the canary secrets the
// test put in the wallet, and the file where the controlled node and this plugin record what they
// observed during the last transfer.
/** @type {{ privateKey?: string[], mnemonic?: string[], password?: string[] }} */
const canaries = JSON.parse(process.env.QAPROBE_CANARIES ?? "{}");
const observations = process.env.QAPROBE_OBSERVATIONS;

const sha256 = (/** @type {string} */ text) => createHash("sha256").update(text).digest("hex");

// Walks every value reachable from the roots (own and inherited properties, map and set entries)
// and reports, per canary, whether any string or byte array equals one of its secrets.
/** @param {unknown[]} roots */
function secretsReachable(roots) {
  /** @type {Record<string, boolean>} */
  const found = { privateKey: false, mnemonic: false, password: false };
  /** @param {string} text */
  const check = (text) => {
    const forms = [text, text.toLowerCase(), text.replace(/^0x/i, "").toLowerCase()].map(sha256);
    for (const [kind, digests] of Object.entries(canaries)) {
      if (forms.some((d) => digests.includes(d))) found[kind] = true;
    }
  };
  const seen = new Set();
  const queue = [...roots];
  let visited = 0;
  while (queue.length > 0) {
    const value = queue.pop();
    if (typeof value === "string") {
      check(value);
      continue;
    }
    if (value instanceof Uint8Array) {
      check(Buffer.from(value).toString("hex"));
      continue;
    }
    if ((typeof value !== "object" && typeof value !== "function") || value === null) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    if (++visited > 500_000) throw new Error("too many reachable values to inspect");
    if (Array.isArray(value) && value.every((v) => typeof v === "string")) check(value.join(" "));
    if (value instanceof Map) for (const [k, v] of value) queue.push(k, v);
    if (value instanceof Set) for (const v of value) queue.push(v);
    for (
      let o = value;
      o !== null && o !== Object.prototype && o !== Function.prototype;
      o = Object.getPrototypeOf(o)
    ) {
      for (const key of Reflect.ownKeys(o)) {
        try {
          queue.push(/** @type {Record<PropertyKey, unknown>} */ (value)[key]);
        } catch {
          // A getter that throws holds nothing reachable.
        }
      }
    }
  }
  return found;
}

// Signatures and submissions the controlled fixture observed during the last transfer.
function observed() {
  let signatures = 0;
  let submissions = 0;
  let text = "";
  try {
    text = observations ? readFileSync(observations, "utf8") : "";
  } catch {
    // no transfer yet
  }
  for (const line of text.split("\n").filter(Boolean)) {
    const event = JSON.parse(line);
    signatures += event.signatures;
    if (event.event === "submit") submissions += 1;
  }
  return { signatures, submissions };
}

/** @param {any} result */
function recordResult(result) {
  if (!observations || result?.mode !== "sign-only") return;
  const signed = result.signed;
  const signatures = Array.isArray(signed?.signature) ? signed.signature.length : signed ? 1 : 0;
  writeFileSync(observations, `${JSON.stringify({ event: "result", signatures })}\n`, {
    flag: "a",
  });
}

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
  contract: z.string().min(1).describe("token contract"),
  to: z.string().min(1).describe("recipient address"),
  amount: z.string().regex(/^\d+$/).describe("amount in the token's base units"),
  ...txModeFields,
});

const inspectFields = z.object({
  sign: z.boolean().default(false).describe("request an authorized test signature first"),
});

/** @param {any} ctx @param {"tron" | "evm"} family */
function accountAddress(ctx, family) {
  try {
    return ctx.resolveAddress(family);
  } catch {
    return undefined;
  }
}

/** @type {import("@tron-walletcli/plugin-sdk").PluginDefinition} */
const plugin = {
  name,
  version: VERSION,
  apiVersion: PLUGIN_API_VERSION + (VARIANT === "api-version" ? 1 : 0),
  apiRevision: PLUGIN_API_REVISION + (VARIANT === "api-revision" ? 1 : 0),
  groups: [{ name: group, summary: "QA probe commands", families: [...FAMILIES] }],
  register(host) {
    const services = host.services;
    host.errorCodes({
      qaprobe_refused: { exit: 2, retry: "never", meaning: "the QA probe refused the value" },
    });
    host.followUps({ "qaprobe-read": (subject) => `qaprobe read --value ${subject ?? "ok"}` });
    host.capabilities({ "qaprobe.read": () => "supported" });
    const readSpec = {
      path: [group, "read"],
      network: "optional",
      wallet: "optional",
      auth: "none",
      capability: "qaprobe.read",
      summary: "Echo a value with the selected network and account, or read a token name",
      baseFields: readFields,
      examples: [{ cmd: "wallet-cli qaprobe read --value hello" }],
      formatText: (/** @type {any} */ data) =>
        [`value: ${data.value}`, `network: ${data.network}`, `address: ${data.address ?? "-"}`]
          .concat(data.token === undefined ? [] : [`token: ${data.token}`])
          .join("\n"),
    };
    for (const family of FAMILIES) {
      host.chainCommand(/** @type {any} */ (readSpec), family, {
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
            ? await services.contracts[family].call(ctx.deadline, net, input.contract, "name()", [])
            : undefined;
          const address = accountAddress(ctx, family);
          return {
            value: input.value ?? "ok",
            network: net.id,
            ...(address === undefined ? {} : { address }),
            ...(token ? { token: token.result } : {}),
            // Text-only data under the reserved key, which the envelope never publishes.
            view: { echoed: true },
          };
        },
      });
    }
    if (VARIANT === "register-failure") {
      try {
        host.capabilities({ "elsewhere.read": () => "supported" });
      } catch {
        // The refusal must fail the registration even though it is caught here.
      }
    }
    const signSpec = {
      path: [group, "sign"],
      network: "optional",
      wallet: "optional",
      auth: "required",
      summary: "Sign a message through the host signing service",
      baseFields: signFields,
      examples: [{ cmd: "wallet-cli qaprobe sign --message hello" }],
    };
    for (const family of FAMILIES) {
      host.chainCommand(/** @type {any} */ (signSpec), family, {
        async run(ctx, net, input) {
          const signature = await services.signing.sign(ctx, {
            network: net,
            family,
            payload: { kind: "message", message: input.message },
          });
          return {
            address: services.signing.signerAddress(ctx.activeAccount, family),
            message: input.message,
            signature,
          };
        },
      });
    }
    const transferSpec = {
      path: [group, "transfer"],
      network: "optional",
      wallet: "optional",
      auth: "conditional",
      broadcasts: true,
      summary: "Send a token transfer through the host contract service",
      baseFields: transferFields,
      exclusive: [txModeExclusive],
      examples: [{ cmd: "wallet-cli qaprobe transfer --contract T... --to T... --amount 1" }],
    };
    /** @type {Record<"tron" | "evm", (ctx: any, net: any, input: any) => Promise<any>>} */
    const send = {
      tron: (ctx, net, input) =>
        services.contracts.tron.send(ctx, net, {
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
        }),
      evm: (ctx, net, input) =>
        services.contracts.evm.send(ctx, net, {
          contract: input.contract,
          method: "transfer(address,uint256)",
          params: [
            { type: "address", value: input.to },
            { type: "uint256", value: input.amount },
          ],
          dryRun: input.dryRun,
          signOnly: input.signOnly,
          buildOnly: input.buildOnly,
        }),
    };
    for (const family of FAMILIES) {
      host.chainCommand(/** @type {any} */ (transferSpec), family, {
        ...(family === "tron" ? { fields: z.object(tronTxModeFields) } : {}),
        async run(ctx, net, input) {
          if (observations) writeFileSync(observations, "");
          const result = await send[family](ctx, net, input);
          recordResult(result);
          return result;
        },
      });
    }
    const inspectSpec = {
      path: [group, "inspect"],
      network: "optional",
      wallet: "optional",
      auth: "conditional",
      summary: "Show what the plugin can reach and what the last transfer did",
      baseFields: inspectFields,
      examples: [{ cmd: "wallet-cli qaprobe inspect --sign" }],
    };
    for (const family of FAMILIES) {
      host.chainCommand(/** @type {any} */ (inspectSpec), family, {
        async run(ctx, net, input) {
          const signature = input.sign
            ? await services.signing.sign(ctx, {
                network: net,
                family,
                payload: { kind: "message", message: "qaprobe inspect" },
              })
            : undefined;
          return {
            imports,
            context: Object.keys(ctx).sort(),
            services: Object.keys(services).sort(),
            signing: Object.keys(services.signing).sort(),
            host: Object.keys(host).sort(),
            secretsReachable: secretsReachable([ctx, net, services, host]),
            observed: observed(),
            ...(signature === undefined ? {} : { signature }),
          };
        },
      });
    }
  },
};

export default plugin;
