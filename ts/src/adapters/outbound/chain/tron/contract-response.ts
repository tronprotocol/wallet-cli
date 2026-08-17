import { z } from "zod";
import type { TronContractMetadata } from "../../../../application/ports/chain/tron-gateway.js";
import { tronHexToBase58 } from "../../../../domain/address/index.js";

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

/**
 * Whether a `trx.getContract` response describes a deployed contract. TronWeb returns an empty
 * object `{}` for an address with no contract (e.g. a plain account); a real contract carries a
 * `contract_address`/`bytecode` identity. Used to fail `contract info` as not_found rather than
 * normalize the empty response into a valid-but-empty contract.
 */
export function isDeployedContract(contract: unknown): boolean {
  if (!contract || typeof contract !== "object") return false;
  const c = contract as Record<string, unknown>;
  return Boolean(c.contract_address || c.bytecode);
}

export function normalizeContractResponses(contract: unknown, info: unknown): TronContractMetadata {
  const contractView = ContractResponseSchema.parse(contract);
  const infoView = ContractResponseSchema.parse(info);
  const abi = contractView.abi ?? infoView.abi ?? contractView.ABI ?? infoView.ABI;
  const entries = Array.isArray(abi) ? abi : (abi?.entrys ?? []);
  const methods = entries
    .filter((entry) => entry.type === "Function" || entry.type === "function")
    .map((entry) => entry.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);
  const rawContract =
    contract && typeof contract === "object" ? (contract as Record<string, unknown>) : {};
  const origin = rawContract.origin_address ?? rawContract.originAddress;
  return {
    name: contractView.name ?? infoView.name,
    methods,
    originAddress: origin === undefined ? undefined : tronHexToBase58(origin),
    contract,
    info: info ?? undefined,
  };
}
