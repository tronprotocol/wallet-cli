import { z } from "zod";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";
import type { CommandRegistry } from "../registry/index.js";
import type { AgentService } from "../../../../application/use-cases/agent-service.js";
import { Schemas, addressFieldsFor } from "../schemas/index.js";
import { governanceTxRefine, tronTxModeFields, txModeFields } from "./shared.js";
import { TextFormatters } from "../render/index.js";

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
  .regex(/^[A-Za-z][A-Za-z0-9+.-]*:\/\//, "must be an absolute URI such as https:// or ipfs://")
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

const showSpec: ChainSpec = {
  path: ["8004", "show"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "erc8004.identity.read",
  positionals: [{ field: "id" }],
  summary: "Load one ERC-8004 Agent directly from the Identity Registry",
  baseFields: z.object({ id: agentId }),
  examples: [
    { cmd: "wallet-cli 8004 show 123 --network nile" },
    { cmd: "wallet-cli 8004 show eip155:97:123 --network bsc-testnet" },
  ],
};

const registerSpec = writeSpec(
  "register",
  z.object({ uri }),
  [{ field: "uri" }],
  "Register an externally hosted Agent URI",
);
registerSpec.examples = [
  { cmd: "wallet-cli 8004 register ipfs://bafy... --network nile --password-stdin" },
];

const updateSpec = writeSpec(
  "update",
  z.object({ id: agentId, uri }),
  [{ field: "id" }, { field: "uri" }],
  "Update an Agent registration URI",
);

const transferSpec = writeSpec(
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
const approveSpec = writeSpec(
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

const operatorAddSpec = writeSpec(
  "operator-add",
  z.object({ operator: address.describe("operator address") }),
  [{ field: "operator" }],
  "Give an operator access to all Agents owned by this account",
);

const operatorRemoveSpec = writeSpec(
  "operator-remove",
  z.object({ operator: address.describe("operator address") }),
  [{ field: "operator" }],
  "Remove an owner-wide Agent operator",
);

const operatorCheckSpec: ChainSpec = {
  path: ["8004", "operator-check"],
  network: "optional",
  wallet: "none",
  auth: "none",
  capability: "erc8004.identity.read",
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

function addBoth(
  registry: CommandRegistry,
  spec: ChainSpec,
  run: FamilyBinding["run"],
  addressFields: string[] = [],
  write = false,
): void {
  for (const family of ["evm", "tron"] as const) {
    registry.addChain(spec, family, {
      run,
      ...(write && family === "tron" ? { fields: tronWriteFields } : {}),
      ...(addressFields.length ? { refine: addressFieldsFor(family, ...addressFields) } : {}),
    });
  }
}

export function registerAgentCommands(registry: CommandRegistry, service: AgentService): void {
  addBoth(registry, showSpec, async (_ctx, net, input) => service.show(net, input.id));
  addBoth(
    registry,
    registerSpec,
    async (ctx, net, input) => service.register(ctx, net, input),
    [],
    true,
  );
  addBoth(
    registry,
    updateSpec,
    async (ctx, net, input) => service.update(ctx, net, input),
    [],
    true,
  );
  addBoth(
    registry,
    transferSpec,
    async (ctx, net, input) => service.transfer(ctx, net, input),
    ["newOwner"],
    true,
  );
  addBoth(
    registry,
    approveSpec,
    async (ctx, net, input) => service.approve(ctx, net, input),
    ["operator"],
    true,
  );
  addBoth(
    registry,
    operatorAddSpec,
    async (ctx, net, input) => service.operatorAdd(ctx, net, input),
    ["operator"],
    true,
  );
  addBoth(
    registry,
    operatorRemoveSpec,
    async (ctx, net, input) => service.operatorRemove(ctx, net, input),
    ["operator"],
    true,
  );
  addBoth(
    registry,
    operatorCheckSpec,
    async (_ctx, net, input) => service.operatorCheck(net, input.owner, input.operator),
    ["owner", "operator"],
  );
}
