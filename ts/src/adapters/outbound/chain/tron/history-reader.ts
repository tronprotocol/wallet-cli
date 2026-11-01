import {
  ChainError,
  CliError,
  ExecutionError,
  TransportError,
} from "../../../../domain/errors/index.js";
import { fromBaseUnits } from "../../../../domain/amounts/index.js";
import { tronHexToBase58 } from "../../../../domain/address/index.js";
import type {
  TronHistoryQuery,
  TronHistoryReader as HistoryPort,
  TronHistoryRecord,
  TronHistoryResult,
} from "../../../../application/ports/chain/tron/tron-history-reader.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";
import {
  FetchHttpTransport,
  HttpTransportError,
  httpTransportFailure,
  networkHttpConfig,
} from "../../http/index.js";
import { FAMILIES } from "../../../../domain/family/index.js";
import {
  DeadlineExpiredError,
  type DispatchCheck,
} from "../../../../application/contracts/deadline.js";
import { withDispatchCheck } from "../../http/dispatch-context.js";

export class TronGridHistoryReader implements HistoryPort {
  async get(
    network: NetworkDescriptor,
    address: string,
    query: TronHistoryQuery,
    check: DispatchCheck,
  ): Promise<TronHistoryResult> {
    const endpoint = network.httpEndpoint;
    if (!endpoint) {
      throw new ExecutionError(
        "history_not_supported",
        "this network has no httpEndpoint configured",
      );
    }
    const resource = query.only === "token" ? "transactions/trc20" : "transactions";
    const path = `/v1/accounts/${encodeURIComponent(address)}/${resource}?limit=${query.limit}&visible=true`;
    let text: string;
    try {
      const transport = new FetchHttpTransport(networkHttpConfig(network));
      text = await withDispatchCheck(check, () => transport.requestText({ method: "GET", path }));
    } catch (error) {
      throw historyTransportError(error);
    }
    const records = historyRecords(text).map((record) => this.normalize(record, address));
    return {
      address,
      only: query.only ?? "all",
      count: records.length,
      records,
    };
  }

  private normalize(raw: unknown, owner: string): TronHistoryRecord {
    const record = raw as any;
    if (record?.raw_data?.contract) {
      const contract = record.raw_data.contract[0] ?? {};
      const value = contract.parameter?.value ?? {};
      const type = String(contract.type ?? "").replace(/Contract$/, "") || "unknown";
      const from = tronHexToBase58(value.owner_address);
      const to = tronHexToBase58(value.to_address ?? value.contract_address);
      const hasTrx = value.amount !== undefined;
      const result = record.ret?.[0]?.contractRet;
      return {
        txId: record.txID,
        time: record.block_timestamp,
        type,
        amount: hasTrx ? fromBaseUnits(String(value.amount), FAMILIES.tron.nativeDecimals) : "",
        symbol: hasTrx ? "TRX" : undefined,
        from,
        to,
        counterparty: from === owner ? to : from,
        status: result === undefined ? "unknown" : result === "SUCCESS" ? "ok" : "failed",
      };
    }
    const token = record?.token_info ?? {};
    const value = String(record?.value ?? "0");
    return {
      txId: record?.transaction_id,
      time: record?.block_timestamp,
      type: record?.type ?? "Transfer",
      amount: token.decimals !== undefined ? fromBaseUnits(value, Number(token.decimals)) : value,
      symbol: token.symbol,
      from: record?.from,
      to: record?.to,
      counterparty: record?.from === owner ? record?.to : record?.from,
      // TRC20 rows are Transfer events, which only successful executions emit.
      status: "ok",
    };
  }
}

// Only a missing endpoint is "not supported"; other failures keep their retryable codes.
function historyTransportError(error: unknown): CliError {
  if (error instanceof DeadlineExpiredError) return error;
  if (!(error instanceof HttpTransportError)) {
    return new TransportError("rpc_error", "TRON account history request failed");
  }
  if (error.kind === "timeout") return new ChainError("timeout", "TRON account history timed out");
  if (error.status === 404) {
    return new ExecutionError(
      "history_not_supported",
      "account history is not supported on this endpoint (HTTP 404)",
    );
  }
  if (error.status === 429) {
    return new ChainError("provider_rate_limited", "TRON account history rate limit exceeded", {
      httpStatus: 429,
    });
  }
  return new TransportError(
    "rpc_error",
    `TRON account history failed: ${httpTransportFailure(error)}`,
  );
}

function historyRecords(text: string): unknown[] {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  // TronGrid lists always carry a data array, empty when there is no history.
  const data = body && typeof body === "object" ? (body as { data?: unknown }).data : null;
  if (!Array.isArray(data)) {
    throw new ChainError("invalid_node_response", "TRON account history response is malformed");
  }
  return data;
}
