import { ExecutionError } from "../../../../domain/errors/index.js";
import { fromBaseUnits } from "../../../../domain/amounts/index.js";
import { tronHexToBase58 } from "../../../../domain/address/index.js";
import type {
  TronHistoryQuery, TronHistoryReader as HistoryPort, TronHistoryResult, } from "../../../../application/ports/chain/tron-history-reader.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";

export class TronGridHistoryReader implements HistoryPort {
  constructor(private readonly timeoutMs = 60_000) {}

  async get(
    network: NetworkDescriptor,
    address: string,
    query: TronHistoryQuery,
  ): Promise<TronHistoryResult> {
    const endpoint = network.httpEndpoint;
    if (!endpoint) {
      throw new ExecutionError("history_not_supported", "this network has no httpEndpoint configured");
    }
    const resource = query.only === "token" ? "transactions/trc20" : "transactions";
    const url = `${endpoint.replace(/\/$/, "")}/v1/accounts/${address}/${resource}?limit=${query.limit}&visible=true`;
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      throw new ExecutionError(
        "history_not_supported",
        `account history is not supported on this endpoint: ${(error as Error).message}`,
      );
    }
    if (!response.ok) {
      throw new ExecutionError(
        "history_not_supported",
        `account history is not supported on this endpoint (HTTP ${response.status})`,
      );
    }
    const body = await response.json() as { data?: unknown[] };
    const records = (body.data ?? []).map((record) => this.normalize(record, address));
    return {
      address,
      only: query.only ?? "all",
      count: records.length,
      records,
    };
  }

  private normalize(raw: unknown, owner: string): Record<string, unknown> {
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
        amount: hasTrx ? fromBaseUnits(String(value.amount), 6) : "",
        symbol: hasTrx ? "TRX" : undefined,
        from,
        to,
        counterparty: from === owner ? to : from,
        status: result && result !== "SUCCESS" ? "failed" : "ok",
      };
    }
    const token = record?.token_info ?? {};
    const value = String(record?.value ?? "0");
    return {
      txId: record?.transaction_id,
      time: record?.block_timestamp,
      type: record?.type ?? "Transfer",
      amount: token.decimals !== undefined
        ? fromBaseUnits(value, Number(token.decimals))
        : value,
      symbol: token.symbol,
      from: record?.from,
      to: record?.to,
      counterparty: record?.from === owner ? record?.to : record?.from,
      status: "ok",
    };
  }
}

