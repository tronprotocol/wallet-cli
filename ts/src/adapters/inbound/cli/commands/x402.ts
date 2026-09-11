import { z } from "zod";
import type { CommandDefinition } from "../contracts/index.js";
import type { CommandRegistry } from "../registry/index.js";
import type { X402Service } from "../../../../application/use-cases/x402-service.js";
import { readFile } from "node:fs/promises";
import { UsageError } from "../../../../domain/errors/index.js";

const url = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//.test(value), "must use http:// or https://");
const fqn = z.string().trim().min(1).max(128).describe("provider fully-qualified name");

const payFields = z.object({
  url: url.describe("x402-protected endpoint URL"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  header: z.array(z.string()).default([]).describe('repeatable HTTP header in "Name: value" form'),
  body: z.string().max(1_048_576).optional().describe("HTTP request body"),
  bodyFile: z.string().trim().min(1).optional().describe("request body file; - reads stdin"),
  out: z.string().trim().min(1).optional().describe("write response bytes to a new file"),
  token: z.string().trim().min(1).optional().describe("only accept this token symbol"),
  asset: z.string().trim().min(1).optional().describe("only accept this asset address"),
  decimals: z.coerce
    .number()
    .int()
    .min(0)
    .max(255)
    .optional()
    .describe("decimals for an explicit asset"),
  scheme: z.enum(["exact", "exact_gasfree"]).optional(),
  maxAmount: z
    .string()
    .regex(/^\d+(?:\.\d+)?$/)
    .optional()
    .describe("maximum payment in whole tokens; strongly recommended"),
  maxRawAmount: z.string().regex(/^\d+$/).optional().describe("maximum payment in smallest units"),
  dryRun: z.boolean().default(false).describe("inspect the payment challenge without signing"),
  maxGasfreeFee: z
    .string()
    .regex(/^\d+(?:\.\d+)?$/)
    .optional()
    .describe("maximum GasFree relay fee in whole tokens"),
  maxGasfreeFeeRaw: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .describe("maximum GasFree relay fee in smallest units"),
});
const payInput = payFields.superRefine((value, context) => {
  if (value.maxAmount && value.maxRawAmount) {
    context.addIssue({
      code: "custom",
      path: ["maxAmount"],
      message: "cannot be combined with --max-raw-amount",
    });
  }
  if (value.body && value.bodyFile) {
    context.addIssue({
      code: "custom",
      path: ["body"],
      message: "cannot be combined with --body-file",
    });
  }
  if (value.maxGasfreeFee && value.maxGasfreeFeeRaw) {
    context.addIssue({
      code: "custom",
      path: ["maxGasfreeFee"],
      message: "cannot be combined with --max-gasfree-fee-raw",
    });
  }
  if (value.decimals !== undefined && !value.asset) {
    context.addIssue({ code: "custom", path: ["decimals"], message: "requires --asset" });
  }
});

const payCommand: CommandDefinition = {
  path: ["x402", "pay"],
  network: "optional",
  wallet: "optional",
  auth: "conditional",
  broadcasts: true,
  capability: "x402.pay",
  positionals: [{ field: "url" }],
  summary: "Request an endpoint and pay an x402 challenge",
  description:
    "Call an HTTP endpoint and authorize a supported x402 payment with the selected wallet account.",
  fields: payFields,
  input: payInput,
  exclusive: [
    { label: "payment limit", flags: ["max-amount", "max-raw-amount"], select: "at-most-one" },
    {
      label: "GasFree fee limit",
      flags: ["max-gasfree-fee", "max-gasfree-fee-raw"],
      select: "at-most-one",
    },
  ],
  examples: [
    { cmd: "wallet-cli x402 pay https://service.example/resource --network bsc --password-stdin" },
    {
      cmd: "wallet-cli x402 pay https://service.example/task --method POST --body '{}' --network tron",
    },
  ],
  run: async () => ({}),
};

const listFields = z.object({
  limit: z.coerce.number().int().positive().max(1000).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  type: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  capability: z.string().trim().min(1).optional(),
  network: z.string().trim().min(1).optional().describe("CAIP-2 network id"),
  includeBlocked: z.boolean().default(false).describe("include providers marked as blocked"),
});

const serveFields = z.object({
  payTo: z.string().trim().min(1).describe("recipient address on the selected network"),
  amount: z
    .string()
    .regex(/^\d+(?:\.\d+)?$/)
    .default("0.0001")
    .describe("human-readable token amount"),
  token: z.string().trim().min(1).default("USDT").describe("payment token symbol"),
  scheme: z.enum(["exact", "exact_gasfree"]).default("exact"),
  host: z.enum(["127.0.0.1", "::1"]).default("127.0.0.1").describe("loopback bind address"),
  port: z.coerce.number().int().min(1).max(65535).default(4020),
  facilitatorUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith("https://"), "must use HTTPS")
    .default("https://facilitator.bankofai.io"),
});

export function registerX402Commands(registry: CommandRegistry, service: X402Service): void {
  registry.add({
    ...payCommand,
    run: async (ctx, network, input) => {
      if (!network) throw new Error("x402 pay requires a resolved network");
      const body = await requestBody(ctx, input.body, input.bodyFile);
      return service.pay(ctx, network, {
        url: input.url,
        method: input.method,
        headers: input.header,
        ...(body === undefined ? {} : { body }),
        ...(input.token === undefined ? {} : { token: input.token }),
        ...(input.asset === undefined ? {} : { asset: input.asset }),
        ...(input.decimals === undefined ? {} : { decimals: input.decimals }),
        ...(input.scheme === undefined ? {} : { scheme: input.scheme }),
        ...(input.maxAmount === undefined ? {} : { maxAmount: input.maxAmount }),
        ...(input.maxRawAmount === undefined ? {} : { maxRawAmount: input.maxRawAmount }),
        dryRun: input.dryRun,
        ...(input.out === undefined ? {} : { out: input.out }),
        ...(input.maxGasfreeFee === undefined ? {} : { maxGasfreeFee: input.maxGasfreeFee }),
        ...(input.maxGasfreeFeeRaw === undefined
          ? {}
          : { maxGasfreeFeeRaw: input.maxGasfreeFeeRaw }),
      });
    },
  });

  registry.add({
    path: ["x402", "serve"],
    network: "optional",
    wallet: "none",
    auth: "none",
    broadcasts: false,
    capability: "x402.serve",
    summary: "Run a local x402-protected endpoint",
    fields: serveFields,
    input: serveFields,
    examples: [
      { cmd: "wallet-cli x402 serve --pay-to T... --amount 1 --token USDT --network tron" },
    ],
    run: async (_ctx, network, input) => {
      if (!network) throw new Error("x402 serve requires a resolved network");
      return service.serve(network, input);
    },
  } satisfies CommandDefinition);

  registry.add({
    path: ["x402", "roundtrip"],
    network: "optional",
    wallet: "optional",
    auth: "conditional",
    broadcasts: true,
    capability: "x402.pay",
    summary: "Start a local paywall, pay it, and exit",
    fields: serveFields,
    input: serveFields,
    examples: [{ cmd: "wallet-cli x402 roundtrip --pay-to T... --network tron --password-stdin" }],
    run: async (ctx, network, input) => {
      if (!network) throw new Error("x402 roundtrip requires a resolved network");
      return service.roundtrip(ctx, network, input);
    },
  } satisfies CommandDefinition);

  registry.add({
    path: ["x402", "provider-list"],
    network: "none",
    wallet: "none",
    auth: "none",
    summary: "List x402 catalog providers",
    fields: listFields,
    input: listFields,
    examples: [
      { cmd: "wallet-cli x402 provider-list" },
      { cmd: "wallet-cli x402 provider-list --network tron:728126428 --capability recharge" },
    ],
    run: async (_ctx, _network, input) => service.providerList(input),
  } satisfies CommandDefinition);

  for (const [verb, summary, run] of [
    ["provider-show", "Show one x402 provider", (name: string) => service.providerShow(name)],
    [
      "provider-endpoints",
      "List one x402 provider's endpoints",
      (name: string) => service.providerEndpoints(name),
    ],
  ] as const) {
    const fields = z.object({ provider: fqn });
    registry.add({
      path: ["x402", verb],
      network: "none",
      wallet: "none",
      auth: "none",
      positionals: [{ field: "provider" }],
      summary,
      fields,
      input: fields,
      examples: [{ cmd: `wallet-cli x402 ${verb} bai/recharge` }],
      run: async (_ctx, _network, input) => run(input.provider),
    } satisfies CommandDefinition);
  }

  const empty = z.object({});
  registry.add({
    path: ["x402", "provider-update"],
    network: "none",
    wallet: "none",
    auth: "none",
    summary: "Refresh the local x402 provider catalog cache",
    fields: empty,
    input: empty,
    examples: [{ cmd: "wallet-cli x402 provider-update" }],
    run: async () => service.providerUpdate(),
  } satisfies CommandDefinition);
}

async function requestBody(
  ctx: Parameters<CommandDefinition["run"]>[0],
  inline?: string,
  path?: string,
): Promise<string | undefined> {
  if (!path) return inline;
  if (path === "-") {
    if (ctx.secrets.has("password")) {
      throw new UsageError(
        "invalid_option",
        "--body-file - cannot share stdin with --password-stdin",
      );
    }
    return checkedBody(ctx.streams.readStdinOnce(), "stdin");
  }
  try {
    return checkedBody(await readFile(path, "utf8"), path);
  } catch (error) {
    if (error instanceof UsageError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new UsageError("file_not_found", `request body file not found: ${path}`);
    }
    throw new UsageError("invalid_value", `cannot read request body file: ${path}`);
  }
}

function checkedBody(body: string, source: string): string {
  if (Buffer.byteLength(body) > 1_048_576) {
    throw new UsageError("invalid_value", `request body from ${source} exceeds 1 MiB`);
  }
  return body;
}
