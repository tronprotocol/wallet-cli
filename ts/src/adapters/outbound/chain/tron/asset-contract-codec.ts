// TronWeb drops extra AssetIssue tranches and lacks an UnfreezeAsset codec.
import { TronWeb, utils as tronUtils } from "tronweb";
import { ChainError } from "../../../../domain/errors/index.js";
import type { TronTransactionArtifact } from "../../../../domain/types/index.js";

export const OVERRIDDEN_ENCODE_TYPES = Object.freeze([
  "AssetIssueContract",
  "UnfreezeAssetContract",
]);
export const OVERRIDDEN_DECODE_TYPES = Object.freeze(["UnfreezeAssetContract"]);

const CONTRACT_TYPE_ID: Readonly<Record<string, number>> = Object.freeze({
  AssetIssueContract: 6,
  UnfreezeAssetContract: 14,
});

// Reuse TronWeb's envelope and Any instance, replacing only the contract payload and type.
const ENVELOPE_TYPE = "WithdrawBalanceContract";

interface ProtoMessage {
  serializeBinary(): Uint8Array;
}
interface ProtoTransaction {
  serializeBinary(): Uint8Array;
  getRawData(): {
    serializeBinary(): Uint8Array;
    getContractList(): Array<{
      getType(): number;
      setType(value: number): unknown;
      getPermissionId(): number;
      getParameter(): {
        getTypeUrl(): string;
        setTypeUrl(value: string): unknown;
        getValue_asU8(): Uint8Array;
        setValue(value: Uint8Array): unknown;
      };
    }>;
  };
}

function invalid(message: string): never {
  throw new ChainError("invalid_transaction", message);
}

interface UnfreezeAssetMessage extends ProtoMessage {
  setOwnerAddress(value: Uint8Array): unknown;
  getOwnerAddress_asU8(): Uint8Array;
}
interface FrozenSupplyMessage extends ProtoMessage {
  setFrozenAmount(value: number): unknown;
  setFrozenDays(value: number): unknown;
}
interface AssetIssueMessage extends ProtoMessage {
  setOwnerAddress(value: Uint8Array): unknown;
  setName(value: Uint8Array): unknown;
  setAbbr(value: Uint8Array): unknown;
  setDescription(value: Uint8Array): unknown;
  setUrl(value: Uint8Array): unknown;
  setTotalSupply(value: number): unknown;
  setNum(value: number): unknown;
  setTrxNum(value: number): unknown;
  setStartTime(value: number): unknown;
  setEndTime(value: number): unknown;
  setPrecision(value: number): unknown;
  setVoteScore(value: number): unknown;
  setPublicLatestFreeNetTime(value: number): unknown;
  setPublicFreeAssetNetUsage(value: number): unknown;
  setFreeAssetNetLimit(value: number): unknown;
  setPublicFreeAssetNetLimit(value: number): unknown;
  addFrozenSupply(value: FrozenSupplyMessage): unknown;
}
interface TronProto {
  Transaction?: { raw?: { deserializeBinary(bytes: Uint8Array): unknown } };
  UnfreezeAssetContract?: (new () => UnfreezeAssetMessage) & {
    deserializeBinary(bytes: Uint8Array): UnfreezeAssetMessage;
  };
  AssetIssueContract?: (new () => AssetIssueMessage) & {
    FrozenSupply?: new () => FrozenSupplyMessage;
  };
}

function proto(): TronProto {
  const p = (globalThis as typeof globalThis & { TronWebProto?: TronProto }).TronWebProto;
  if (!p?.UnfreezeAssetContract || !p.AssetIssueContract?.FrozenSupply || !p.Transaction?.raw) {
    throw new ChainError(
      "provider_error",
      "the installed TronWeb version does not expose the TRC10 contract protobuf classes",
    );
  }
  return p;
}

// Accept hex or base58 addresses.
function addressBytes(value: unknown): Uint8Array {
  if (typeof value !== "string" || value.length === 0) {
    return invalid("contract owner_address is missing");
  }
  let hex: string;
  try {
    hex = TronWeb.address.toHex(value);
  } catch {
    return invalid("contract owner_address is not a TRON address");
  }
  return Uint8Array.from(tronUtils.code.hexStr2byteArray(hex.replace(/^0x/, "")));
}

// Match TronWeb's hex-or-UTF-8 interpretation: these bytes determine the txID.
function textBytes(value: unknown): Uint8Array {
  if (typeof value !== "string" || value.length === 0) return new Uint8Array();
  const raw = value.replace(/^0x/, "");
  const hex = (tronUtils.isHex(raw) ? raw : TronWeb.toHex(raw)).replace(/^0x/, "");
  return Uint8Array.from(tronUtils.code.hexStr2byteArray(hex));
}

function intField(value: unknown, field: string, fallback?: number): number {
  if (value === undefined || value === null) {
    if (fallback !== undefined) return fallback;
    return invalid(`AssetIssueContract.${field} is required`);
  }
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n)) {
    return invalid(`AssetIssueContract.${field} must be a safe integer`);
  }
  return n;
}

function buildUnfreezeAsset(value: Record<string, unknown>): ProtoMessage {
  const P = proto();
  const message = new P.UnfreezeAssetContract!();
  message.setOwnerAddress(addressBytes(value.owner_address));
  return message;
}

// Preserve TronWeb's optional-field handling while encoding every frozen tranche.
function buildAssetIssue(value: Record<string, unknown>): ProtoMessage {
  const P = proto();
  const AssetIssue = P.AssetIssueContract!;
  const message = new AssetIssue();
  message.setOwnerAddress(addressBytes(value.owner_address));
  if (value.name) message.setName(textBytes(value.name));
  if (value.abbr) message.setAbbr(textBytes(value.abbr));
  message.setTotalSupply(intField(value.total_supply, "total_supply"));
  message.setNum(intField(value.num, "num"));
  message.setEndTime(intField(value.end_time, "end_time"));
  message.setStartTime(intField(value.start_time, "start_time"));
  message.setTrxNum(intField(value.trx_num, "trx_num"));
  message.setVoteScore(intField(value.vote_score, "vote_score", 0));
  if (value.precision) message.setPrecision(intField(value.precision, "precision"));
  if (value.public_latest_free_net_time) {
    message.setPublicLatestFreeNetTime(
      intField(value.public_latest_free_net_time, "public_latest_free_net_time"),
    );
  }
  if (value.description) message.setDescription(textBytes(value.description));
  if (value.url) message.setUrl(textBytes(value.url));
  message.setPublicFreeAssetNetUsage(
    intField(value.public_free_asset_net_usage, "public_free_asset_net_usage", 0),
  );
  message.setFreeAssetNetLimit(intField(value.free_asset_net_limit, "free_asset_net_limit", 0));
  message.setPublicFreeAssetNetLimit(
    intField(value.public_free_asset_net_limit, "public_free_asset_net_limit", 0),
  );

  const supply = value.frozen_supply;
  // TronWeb accepts a list or a single tranche object.
  const tranches =
    supply === undefined || supply === null ? [] : Array.isArray(supply) ? supply : [supply];
  for (const tranche of tranches as Array<Record<string, unknown>>) {
    if (!tranche || typeof tranche !== "object")
      return invalid("AssetIssueContract.frozen_supply entry must be an object");
    const frozen = new AssetIssue.FrozenSupply!();
    frozen.setFrozenAmount(intField(tranche.frozen_amount, "frozen_supply.frozen_amount"));
    frozen.setFrozenDays(intField(tranche.frozen_days, "frozen_supply.frozen_days"));
    message.addFrozenSupply(frozen);
  }
  return message;
}

export function encodeOverriddenContract(
  candidate: Partial<TronTransactionArtifact>,
): ProtoTransaction | undefined {
  const contract = candidate.raw_data?.contract?.[0];
  const type = contract?.type;
  if (typeof type !== "string" || !OVERRIDDEN_ENCODE_TYPES.includes(type)) return undefined;

  const value = (contract?.parameter?.value ?? {}) as Record<string, unknown>;
  const message =
    type === "UnfreezeAssetContract" ? buildUnfreezeAsset(value) : buildAssetIssue(value);

  const envelope = {
    ...candidate,
    raw_data: {
      ...candidate.raw_data!,
      contract: [
        {
          ...contract!,
          parameter: {
            value: { owner_address: value.owner_address },
            type_url: `type.googleapis.com/protocol.${ENVELOPE_TYPE}`,
          },
          type: ENVELOPE_TYPE,
        },
      ],
    },
  };

  let pb: ProtoTransaction;
  try {
    pb = tronUtils.transaction.txJsonToPb(envelope as never) as unknown as ProtoTransaction;
  } catch {
    return invalid("transaction JSON cannot be encoded as TRON protobuf");
  }

  const target = pb.getRawData().getContractList()[0]!;
  const parameter = target.getParameter();
  parameter.setTypeUrl(`type.googleapis.com/protocol.${type}`);
  parameter.setValue(message.serializeBinary());
  target.setType(CONTRACT_TYPE_ID[type]!);
  return pb;
}

export function decodeOverriddenContract(
  contractType: string,
  rawDataHex: string,
): TronTransactionArtifact["raw_data"] | undefined {
  if (!OVERRIDDEN_DECODE_TYPES.includes(contractType)) return undefined;
  const P = proto();

  interface RawProto {
    getContractList(): Array<{
      getType(): number;
      getPermissionId(): number;
      getParameter(): { getTypeUrl(): string; getValue_asU8(): Uint8Array };
    }>;
    getData_asU8(): Uint8Array;
    getFeeLimit(): number;
    getRefBlockBytes_asU8(): Uint8Array;
    getRefBlockHash_asU8(): Uint8Array;
    getExpiration(): number;
    getTimestamp(): number;
    getScripts_asU8(): Uint8Array;
    getAuthsList(): unknown[];
  }
  let raw: RawProto;
  try {
    raw = P.Transaction!.raw!.deserializeBinary(
      Uint8Array.from(tronUtils.code.hexStr2byteArray(rawDataHex)),
    ) as RawProto;
  } catch {
    return invalid(`TRON contract type ${contractType} cannot be decoded losslessly`);
  }

  const contract = raw.getContractList()[0];
  if (!contract || contract.getType() !== CONTRACT_TYPE_ID[contractType]) {
    return invalid(`TRON contract type ${contractType} cannot be decoded losslessly`);
  }
  // Reject auths because re-encoding would drop them.
  if (raw.getAuthsList().length > 0) {
    return invalid(`TRON contract type ${contractType} cannot be decoded losslessly`);
  }

  let message: UnfreezeAssetMessage;
  try {
    message = P.UnfreezeAssetContract!.deserializeBinary(contract.getParameter().getValue_asU8());
  } catch {
    return invalid(`TRON contract type ${contractType} cannot be decoded losslessly`);
  }

  const hex = (bytes: Uint8Array) => tronUtils.bytes.byteArray2hexStr(Array.from(bytes) as never);
  return {
    contract: [
      {
        parameter: {
          value: { owner_address: hex(message.getOwnerAddress_asU8()) },
          type_url: contract.getParameter().getTypeUrl(),
        },
        type: contractType,
        Permission_id: contract.getPermissionId(),
      },
    ],
    data: hex(raw.getData_asU8()),
    fee_limit: raw.getFeeLimit(),
    ref_block_bytes: hex(raw.getRefBlockBytes_asU8()),
    ref_block_hash: hex(raw.getRefBlockHash_asU8()),
    expiration: raw.getExpiration(),
    timestamp: raw.getTimestamp(),
    scripts: hex(raw.getScripts_asU8()),
    auths: [],
  } as unknown as TronTransactionArtifact["raw_data"];
}
