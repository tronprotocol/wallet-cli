import { z } from "zod";
import type { TronContractMetadata } from "../../../../application/ports/chain/tron-gateway.js";

const ContractEntrySchema = z.looseObject({
  type: z.string().optional().catch(undefined),
  name: z.string().optional().catch(undefined),
});
const AbiSchema = z.union([
  z.array(ContractEntrySchema),
  z.looseObject({ entrys: z.array(ContractEntrySchema).optional().catch(undefined) }),
]);
const ContractResponseSchema = z.preprocess(
  (value) => (value && typeof value === "object" ? value : {}),
  z.looseObject({
    name: z.string().optional().catch(undefined),
    abi: AbiSchema.optional().catch(undefined),
    ABI: AbiSchema.optional().catch(undefined),
  }),
);

export function normalizeContractResponses(contract: unknown, info: unknown): TronContractMetadata {
  const contractView = ContractResponseSchema.parse(contract);
  const infoView = ContractResponseSchema.parse(info);
  const abi = contractView.abi ?? infoView.abi ?? contractView.ABI ?? infoView.ABI;
  const entries = Array.isArray(abi) ? abi : abi?.entrys ?? [];
  const methods = entries
    .filter((entry) => entry.type === "Function" || entry.type === "function")
    .map((entry) => entry.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);
  return { name: contractView.name ?? infoView.name, methods, contract, info: info ?? undefined };
}
