import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import type { AgentService } from "../../../../application/use-cases/agent-service.js";
import { Schemas, addressFieldsFor } from "../schemas/index.js";
import { governanceTxRefine, tronTxModeFields, txModeFields } from "./shared.js";
import { TextFormatters, renderGenericText } from "../render/index.js";

const agentId = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .describe("agent token id, optionally chain-scoped");
const uri = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => {
    if (/^data:application\/json;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return true;
    try {
      const url = new URL(value);
      return (
        ["https:", "http:", "ipfs:"].includes(url.protocol) &&
        !!url.hostname &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "must be an HTTP(S), IPFS, or base64 JSON data URI without credentials")
  .describe("URI of an agent registration document built and hosted outside wallet-cli");
const address = Schemas.address();

const tronWriteFields = z.object({
  feeLimit: Schemas.positiveIntString()
    .default("100000000")
    .describe("maximum energy fee to burn, in SUN"),
  ...tronTxModeFields,
});

function writeSpec(
  verb: string,
  fields: z.ZodObject<any>,
  positionals: { field: string }[],
  summary: string,
): ChainSpec {
  return {
    path: ["8004", verb],
    network: "optional",
    wallet: "optional",
    auth: "conditional",
    broadcasts: true,
    capability: "erc8004.identity.write",
    positionals,
    summary,
    baseFields: fields.extend(txModeFields),
    baseRefine: governanceTxRefine,
    examples: [],
    formatText: TextFormatters.txReceipt,
  };
}

export const showSpec: ChainSpec = {
  path: ["8004", "show"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "erc8004.identity.read",
  formatText: (data, ctx) => renderGenericText(ctx.command, ctx.net, data),
  positionals: [{ field: "id" }],
  summary: "Load one ERC-8004 Agent directly from the Identity Registry",
  baseFields: z.object({ id: agentId }),
  examples: [
    { cmd: "wallet-cli 8004 show 123 --network nile" },
    { cmd: "wallet-cli 8004 show eip155:97:123 --network bsc-testnet" },
  ],
};

export const registerSpec = writeSpec(
  "register",
  z.object({ uri }),
  [{ field: "uri" }],
  "Register an externally hosted Agent URI",
);
registerSpec.examples = [
  { cmd: "wallet-cli 8004 register ipfs://bafy... --network nile --password-stdin" },
];

export const updateSpec = writeSpec(
  "update",
  z.object({ id: agentId, uri }),
  [{ field: "id" }, { field: "uri" }],
  "Update an Agent registration URI",
);

export const transferSpec = writeSpec(
  "transfer",
  z.object({ id: agentId, newOwner: address.describe("new owner address") }),
  [{ field: "id" }, { field: "newOwner" }],
  "Transfer Agent ownership",
);

const approveFields = z.object({
  id: agentId,
  operator: address.optional().describe("address approved for this Agent"),
  revoke: z.boolean().default(false).describe("clear the current per-Agent approval"),
});
export const approveSpec = writeSpec(
  "approve",
  approveFields,
  [{ field: "id" }, { field: "operator" }],
  "Approve or revoke an operator for one Agent",
);
approveSpec.baseRefine = (value, context) => {
  governanceTxRefine(value, context);
  if (!value.revoke && !value.operator) {
    context.addIssue({
      code: "custom",
      path: ["operator"],
      message: "is required unless --revoke is used",
    });
  }
  if (value.revoke && value.operator) {
    context.addIssue({
      code: "custom",
      path: ["operator"],
      message: "must be omitted with --revoke",
    });
  }
};

export const operatorAddSpec = writeSpec(
  "operator-add",
  z.object({ operator: address.describe("operator address") }),
  [{ field: "operator" }],
  "Give an operator access to all Agents owned by this account",
);

export const operatorRemoveSpec = writeSpec(
  "operator-remove",
  z.object({ operator: address.describe("operator address") }),
  [{ field: "operator" }],
  "Remove an owner-wide Agent operator",
);

export const operatorCheckSpec: ChainSpec = {
  path: ["8004", "operator-check"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "erc8004.identity.read",
  formatText: (data, ctx) => renderGenericText(ctx.command, ctx.net, data),
  positionals: [{ field: "owner" }, { field: "operator" }],
  summary: "Check an owner-wide Agent operator approval",
  baseFields: z.object({
    owner: address.describe("Agent owner address"),
    operator: address.describe("operator address"),
  }),
  examples: [
    { cmd: "wallet-cli 8004 operator-check T... T... --network nile" },
    { cmd: "wallet-cli 8004 operator-check 0x... 0x... --network bsc-testnet" },
  ],
};

function binding(
  family: "evm" | "tron",
  run: FamilyBinding["run"],
  addressFields: string[] = [],
  write = false,
): FamilyBinding {
  return {
    run,
    ...(write && family === "tron" ? { fields: tronWriteFields } : {}),
    ...(addressFields.length ? { refine: addressFieldsFor(family, ...addressFields) } : {}),
  };
}
export function showEvmBinding(service: AgentService): FamilyBinding {
  return binding(
    "evm",
    async (ctx, net, input) => {
      const result = await service.show(net, input.id);
      for (const warning of result.warnings ?? []) ctx.warn(warning);
      return result;
    },
    [],
    false,
  );
}
export function showTronBinding(service: AgentService): FamilyBinding {
  return binding(
    "tron",
    async (ctx, net, input) => {
      const result = await service.show(net, input.id);
      for (const warning of result.warnings ?? []) ctx.warn(warning);
      return result;
    },
    [],
    false,
  );
}
export function registerEvmBinding(service: AgentService): FamilyBinding {
  return binding("evm", async (ctx, net, input) => service.register(ctx, net, input), [], true);
}
export function registerTronBinding(service: AgentService): FamilyBinding {
  return binding("tron", async (ctx, net, input) => service.register(ctx, net, input), [], true);
}
export function updateEvmBinding(service: AgentService): FamilyBinding {
  return binding("evm", async (ctx, net, input) => service.update(ctx, net, input), [], true);
}
export function updateTronBinding(service: AgentService): FamilyBinding {
  return binding("tron", async (ctx, net, input) => service.update(ctx, net, input), [], true);
}
export function transferEvmBinding(service: AgentService): FamilyBinding {
  return binding(
    "evm",
    async (ctx, net, input) => service.transfer(ctx, net, input),
    ["newOwner"],
    true,
  );
}
export function transferTronBinding(service: AgentService): FamilyBinding {
  return binding(
    "tron",
    async (ctx, net, input) => service.transfer(ctx, net, input),
    ["newOwner"],
    true,
  );
}
export function approveEvmBinding(service: AgentService): FamilyBinding {
  return binding(
    "evm",
    async (ctx, net, input) => service.approve(ctx, net, input),
    ["operator"],
    true,
  );
}
export function approveTronBinding(service: AgentService): FamilyBinding {
  return binding(
    "tron",
    async (ctx, net, input) => service.approve(ctx, net, input),
    ["operator"],
    true,
  );
}
export function operatorAddEvmBinding(service: AgentService): FamilyBinding {
  return binding(
    "evm",
    async (ctx, net, input) => service.operatorAdd(ctx, net, input),
    ["operator"],
    true,
  );
}
export function operatorAddTronBinding(service: AgentService): FamilyBinding {
  return binding(
    "tron",
    async (ctx, net, input) => service.operatorAdd(ctx, net, input),
    ["operator"],
    true,
  );
}
export function operatorRemoveEvmBinding(service: AgentService): FamilyBinding {
  return binding(
    "evm",
    async (ctx, net, input) => service.operatorRemove(ctx, net, input),
    ["operator"],
    true,
  );
}
export function operatorRemoveTronBinding(service: AgentService): FamilyBinding {
  return binding(
    "tron",
    async (ctx, net, input) => service.operatorRemove(ctx, net, input),
    ["operator"],
    true,
  );
}
export function operatorCheckEvmBinding(service: AgentService): FamilyBinding {
  return binding(
    "evm",
    async (_ctx, net, input) => service.operatorCheck(net, input.owner, input.operator),
    ["owner", "operator"],
    false,
  );
}
export function operatorCheckTronBinding(service: AgentService): FamilyBinding {
  return binding(
    "tron",
    async (_ctx, net, input) => service.operatorCheck(net, input.owner, input.operator),
    ["owner", "operator"],
    false,
  );
}
