import { parse as parseLosslessJson } from "lossless-json";
import type { Types } from "tronweb";
import type { BroadcastResult } from "../../../../domain/types/index.js";
import type {
  TronBlock,
  TronNodeInfo,
  TronPricePoint,
  TronProposal,
  TronRawBlock,
  TronWitness,
} from "../../../../application/ports/chain/tron/tron-gateway.js";
import { ChainError } from "../../../../domain/errors/index.js";
import { redactErrorMessage } from "../../../../domain/errors/redact.js";
import { tronHexToBase58 } from "../../../../domain/address/index.js";
import { normalizeTxHash } from "../../../../domain/family/index.js";
import { classifyNodeRejection, isOutcomeUnknownBroadcastCode } from "./node-errors.js";
import {
  decodeTronMessage,
  normalizeLosslessValue,
  optionalNumber,
  quantityString,
  safeNodeInteger,
} from "./node-values.js";

function decodeAsciiHex(value: unknown): string | undefined {
  const raw = String(value ?? "");
  const hex = raw.replace(/^0x/, "");
  if (!hex || !/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return raw || undefined;
  try {
    const text = Buffer.from(hex, "hex").toString("utf8").replace(/\0+$/, "");
    return text || undefined;
  } catch {
    return raw || undefined;
  }
}

export function normalizeWitness(value: unknown): TronWitness | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const address = tronHexToBase58(raw.address);
  if (!address) return null;
  return {
    address,
    voteCount: quantityString(raw.voteCount ?? raw.vote_count),
    url: decodeAsciiHex(raw.url),
    totalProduced: optionalNumber(raw.totalProduced),
    totalMissed: optionalNumber(raw.totalMissed),
    latestBlockNum: optionalNumber(raw.latestBlockNum),
    latestSlotNum: optionalNumber(raw.latestSlotNum),
    isJobs: typeof raw.isJobs === "boolean" ? raw.isJobs : undefined,
  };
}

// Accept node arrays of {key, value} and maps keyed by parameter ID.
function normalizeProposalParameters(value: unknown): Record<string, string> {
  if (Array.isArray(value)) {
    const entries = value.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const { key, value: parameterValue } = entry as { key?: unknown; value?: unknown };
      if (
        key === undefined ||
        key === null ||
        parameterValue === undefined ||
        parameterValue === null
      )
        return [];
      return [[String(key), String(parameterValue)] as const];
    });
    return Object.fromEntries(entries);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined && entry !== null)
        .map(([key, entry]) => [key, String(entry)]),
    );
  }
  return {};
}

export function normalizeProposal(value: unknown): TronProposal | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = Number(raw.proposal_id ?? raw.proposalId);
  if (!Number.isSafeInteger(id) || id < 0) return null;
  const proposerAddress = tronHexToBase58(raw.proposer_address ?? raw.proposerAddress);
  if (!proposerAddress) return null;
  const parameters = normalizeProposalParameters(raw.parameters);
  const stateValue = raw.state;
  const states = ["PENDING", "DISAPPROVED", "APPROVED", "CANCELED"] as const;
  const state =
    typeof stateValue === "string" &&
    states.includes(stateValue.toUpperCase() as (typeof states)[number])
      ? (stateValue.toUpperCase() as (typeof states)[number])
      : (states[Number(stateValue)] ?? "PENDING");
  return {
    id,
    proposerAddress,
    parameters,
    expirationTime: Number(raw.expiration_time ?? raw.expirationTime ?? 0),
    createTime: Number(raw.create_time ?? raw.createTime ?? 0),
    approvals: (Array.isArray(raw.approvals) ? raw.approvals : [])
      .map(tronHexToBase58)
      .filter(Boolean),
    state,
  };
}

// Preserve unsafe block integers as exact decimal strings.
export function parseTronBlockResponse(text: string): Types.Block {
  return normalizeLosslessValue(parseLosslessJson(text)) as Types.Block;
}

// Nodes return {} for a height they do not hold.
export function tronBlock(block: Types.Block): TronBlock | null {
  if (!block || typeof block !== "object" || !("blockID" in block)) return null;
  const header = block.block_header?.raw_data;
  // Protobuf JSON omits zero values; only the genesis block has height and timestamp 0.
  return {
    number: safeNodeInteger(header?.number ?? 0, "block number"),
    timestampMs: safeNodeInteger(header?.timestamp ?? 0, "block timestamp"),
    transactionCount: Array.isArray(block.transactions) ? block.transactions.length : 0,
    raw: block as unknown as TronRawBlock,
  };
}

// Node format: comma-separated "sinceMs:price" pairs, oldest first.
export function parsePriceTimeline(raw: unknown, resource: string): TronPricePoint[] {
  const segments = typeof raw === "string" && raw !== "" ? raw.split(",") : [];
  const points = segments.map((segment) => {
    const match = /^(\d+):(\d+)$/.exec(segment);
    return { sinceMs: Number(match?.[1]), sunPerUnit: Number(match?.[2]) };
  });
  const valid = points.every(
    (point) => Number.isSafeInteger(point.sinceMs) && Number.isSafeInteger(point.sunPerUnit),
  );
  if (points.length === 0 || !valid) {
    throw new ChainError(
      "invalid_node_response",
      `the node returned a malformed ${resource} price timeline`,
    );
  }
  return points;
}

interface NodeInfoResponse {
  solidityBlock?: unknown;
  currentConnectCount?: unknown;
  activeConnectCount?: unknown;
  configNodeInfo?: { codeVersion?: unknown; p2pVersion?: unknown };
}

export function tronNodeInfo(info: NodeInfoResponse): TronNodeInfo {
  // solidityBlock reads "Num:<height>,ID:<block id>".
  const solid = /Num:(\d+)/.exec(typeof info.solidityBlock === "string" ? info.solidityBlock : "");
  const solidBlockNumber = solid ? Number(solid[1]) : undefined;
  const connected = info.currentConnectCount;
  const active = info.activeConnectCount;
  const text = (value: unknown) => (typeof value === "string" && value !== "" ? value : undefined);
  const codeVersion = text(info.configNodeInfo?.codeVersion);
  const p2pVersion = text(info.configNodeInfo?.p2pVersion);
  return {
    ...(solidBlockNumber !== undefined && Number.isSafeInteger(solidBlockNumber)
      ? { solidBlockNumber }
      : {}),
    ...(Number.isSafeInteger(connected) && Number.isSafeInteger(active)
      ? { peers: { connected: connected as number, active: active as number } }
      : {}),
    ...(codeVersion === undefined ? {} : { codeVersion }),
    ...(p2pVersion === undefined ? {} : { p2pVersion }),
  };
}

// sentTxId is the id of the transaction this call sent.
export function broadcastResult(response: unknown, sentTxId: string | undefined): BroadcastResult {
  if (response === null || typeof response !== "object" || Array.isArray(response)) {
    throw new ChainError("invalid_node_response", "TRON broadcast returned a malformed response");
  }
  const res = response as {
    result?: unknown;
    message?: unknown;
    code?: unknown;
    txid?: unknown;
    transaction?: { txID?: unknown } | null;
  };
  // Node rejections can omit result entirely; only explicit true means acceptance.
  if (res.result !== true) {
    const nodeCode = typeof res.code === "string" ? res.code : undefined;
    const reason =
      (typeof res.message === "string" ? decodeTronMessage(res.message) : undefined) || nodeCode;
    if (!reason) {
      throw new ChainError(
        "invalid_node_response",
        "TRON broadcast returned neither acceptance nor a rejection reason",
      );
    }
    const known = classifyNodeRejection(reason, nodeCode);
    // A duplicate counts as accepted only when the node names the transaction this call sent.
    if (!known && nodeCode === "DUP_TRANSACTION_ERROR" && sentTxId !== undefined) {
      const reported = typeof res.txid === "string" ? res.txid : res.transaction?.txID;
      if (typeof reported === "string" && sameTxId(reported, sentTxId)) {
        return { txId: sentTxId, alreadyKnown: true };
      }
    }
    if (!known && isOutcomeUnknownBroadcastCode(nodeCode)) {
      throw new ChainError(
        "rpc_error",
        `TRON broadcast outcome unknown (${nodeCode}): ${redactErrorMessage(reason)}`,
        { nodeCode, nodeMessage: redactErrorMessage(reason) },
      );
    }
    throw new ChainError(
      known?.code ?? "transaction_rejected",
      known?.message
        ? `${known.message}: ${redactErrorMessage(reason)}`
        : `TRON broadcast rejected: ${redactErrorMessage(reason)}`,
      { nodeCode, nodeMessage: redactErrorMessage(reason) },
    );
  }
  const txId = res.txid ?? res.transaction?.txID;
  return { txId: typeof txId === "string" ? txId : undefined };
}

function sameTxId(a: string, b: string): boolean {
  const left = normalizeTxHash("tron", a);
  return left !== undefined && left === normalizeTxHash("tron", b);
}
