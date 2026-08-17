/** Exact protobuf support for ProposalCreateContract's map<int64,int64>.
 *
 * google-protobuf generated this map as Map<number, number>, so TronWeb rounds values above
 * Number.MAX_SAFE_INTEGER before serialization. Java wallet-cli accepts the full positive int64
 * range. We let TronWeb encode the transaction envelope, then replace the Any payload with a
 * minimal, exact proposal message encoded from decimal strings. */
import { TronWeb, utils as tronUtils } from "tronweb";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils.js";

const INT64_MIN = -(1n << 63n);
const INT64_MAX = (1n << 63n) - 1n;

interface ProposalParameter {
  key: string | number;
  value: string | number;
}

type Json = Record<string, unknown>;

export function proposalCreateTxJsonToPbExact(transaction: unknown): any {
  const source = transaction as { raw_data?: { contract?: Json[] }; visible?: boolean };
  if (!Array.isArray(source?.raw_data?.contract))
    throw new Error("missing proposal transaction contracts");
  const clone = JSON.parse(JSON.stringify(transaction)) as typeof source;
  const clonedContracts = clone.raw_data!.contract!;

  const exactPayloads = new Map<number, Uint8Array>();
  source.raw_data.contract.forEach((contract, index) => {
    if (contract.type !== "ProposalCreateContract") return;
    const parameter = asObject(contract.parameter);
    const value = asObject(parameter.value);
    const entries = proposalEntries(value.parameters);
    exactPayloads.set(index, encodeProposalCreate(String(value.owner_address ?? ""), entries));

    // Feed only safe placeholders into TronWeb. The resulting Any bytes are replaced below;
    // every outer field (TAPOS, timestamp, expiration, permission id) remains SDK-encoded.
    const clonedParameter = asObject(clonedContracts[index]!.parameter);
    const clonedValue = asObject(clonedParameter.value);
    clonedValue.parameters = entries.map(({ key }) => ({ key: Number(key), value: 0 }));
  });

  const protobuf = tronUtils.transaction.txJsonToPb(clone as any);
  const contracts = protobuf.getRawData().getContractList();
  for (const [index, payload] of exactPayloads) {
    contracts[index].getParameter().setValue(payload);
  }
  return protobuf;
}

export function proposalCreateTxCheckExact(transaction: unknown): boolean {
  const expected = String((transaction as { raw_data_hex?: unknown })?.raw_data_hex ?? "")
    .replace(/^0x/, "")
    .toLowerCase();
  return (
    expected.length > 0 &&
    tronUtils.transaction
      .txPbToRawDataHex(proposalCreateTxJsonToPbExact(transaction))
      .toLowerCase() === expected
  );
}

/** Exact UpdateEnergyLimitContract int64 encoder; TronWeb's builder both narrows to number and
 * applies an obsolete 10M policy cap that is not part of the Java protocol builder. */
export function updateEnergyLimitTxJsonToPbExact(transaction: unknown): any {
  const source = transaction as { raw_data?: { contract?: Json[] } };
  if (!Array.isArray(source?.raw_data?.contract))
    throw new Error("missing energy-limit transaction contracts");
  const clone = JSON.parse(JSON.stringify(transaction)) as typeof source;
  const exactPayloads = new Map<number, Uint8Array>();
  source.raw_data.contract.forEach((contract, index) => {
    if (contract.type !== "UpdateEnergyLimitContract") return;
    const value = asObject(asObject(contract.parameter).value);
    exactPayloads.set(
      index,
      encodeUpdateEnergyLimit(
        String(value.owner_address ?? ""),
        String(value.contract_address ?? ""),
        decimal(value.origin_energy_limit, "origin energy limit"),
      ),
    );
    const clonedValue = asObject(asObject(clone.raw_data!.contract![index]!.parameter).value);
    clonedValue.origin_energy_limit = 0;
  });
  const protobuf = tronUtils.transaction.txJsonToPb(clone as any);
  const contracts = protobuf.getRawData().getContractList();
  for (const [index, payload] of exactPayloads) contracts[index].getParameter().setValue(payload);
  return protobuf;
}

export function updateEnergyLimitTxCheckExact(transaction: unknown): boolean {
  const expected = String((transaction as { raw_data_hex?: unknown })?.raw_data_hex ?? "")
    .replace(/^0x/, "")
    .toLowerCase();
  return (
    expected.length > 0 &&
    tronUtils.transaction
      .txPbToRawDataHex(updateEnergyLimitTxJsonToPbExact(transaction))
      .toLowerCase() === expected
  );
}

function proposalEntries(value: unknown): ProposalParameter[] {
  if (Array.isArray(value)) {
    return value.map((entry) => {
      const object = asObject(entry);
      return {
        key: decimal(object.key, "parameter id"),
        value: decimal(object.value, "parameter value"),
      };
    });
  }
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, entry]) => ({
      key: decimal(key, "parameter id"),
      value: decimal(entry, "parameter value"),
    }));
  }
  throw new Error("proposal parameters must be an array or map");
}

function encodeProposalCreate(ownerAddress: string, parameters: ProposalParameter[]): Uint8Array {
  const fields: Uint8Array[] = [lengthDelimited(1, addressBytes(ownerAddress))];

  // jspb.Map serializes one value per key in key order; duplicate assignments use the last value.
  const selected = new Map<bigint, bigint>();
  for (const parameter of parameters) {
    selected.set(int64(parameter.key, "parameter id"), int64(parameter.value, "parameter value"));
  }
  const sorted = [...selected.entries()].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  for (const [key, value] of sorted) {
    const entry = concatBytes(tag(1, 0), varint64(key), tag(2, 0), varint64(value));
    fields.push(lengthDelimited(2, entry));
  }
  return concatBytes(...fields);
}

function encodeUpdateEnergyLimit(owner: string, contract: string, energy: string): Uint8Array {
  return concatBytes(
    lengthDelimited(1, addressBytes(owner)),
    lengthDelimited(2, addressBytes(contract)),
    tag(3, 0),
    varint64(int64(energy, "origin energy limit")),
  );
}

function addressBytes(address: string): Uint8Array {
  const hex = TronWeb.address.toHex(address).replace(/^0x/, "");
  if (!/^41[0-9a-fA-F]{40}$/.test(hex)) throw new Error("invalid TRON address");
  return hexToBytes(hex);
}

function lengthDelimited(field: number, value: Uint8Array): Uint8Array {
  return concatBytes(tag(field, 2), unsignedVarint(BigInt(value.length)), value);
}

function tag(field: number, wireType: number): Uint8Array {
  return unsignedVarint(BigInt((field << 3) | wireType));
}

function varint64(value: bigint): Uint8Array {
  return unsignedVarint(BigInt.asUintN(64, value));
}

function unsignedVarint(input: bigint): Uint8Array {
  let value = input;
  const bytes: number[] = [];
  do {
    let byte = Number(value & 0x7fn);
    value >>= 7n;
    if (value !== 0n) byte |= 0x80;
    bytes.push(byte);
  } while (value !== 0n);
  return Uint8Array.from(bytes);
}

function int64(value: string | number, label: string): bigint {
  const parsed = BigInt(value);
  if (parsed < INT64_MIN || parsed > INT64_MAX) throw new Error(`${label} is outside int64`);
  return parsed;
}

function decimal(value: unknown, label: string): string {
  const raw = String(value ?? "");
  if (!/^-?\d+$/.test(raw)) throw new Error(`${label} must be a decimal integer`);
  return raw;
}

function asObject(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("malformed proposal transaction");
  return value as Json;
}

/** Test/debug helper: exact encoded ProposalCreateContract Any payload as hex. */
export function proposalCreatePayloadHex(owner: string, parameters: ProposalParameter[]): string {
  return bytesToHex(encodeProposalCreate(owner, parameters));
}
