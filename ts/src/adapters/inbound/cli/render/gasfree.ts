import type {
  GasFreeInfoView,
  GasFreeTraceView,
  GasFreeTransferView,
} from "../../../../domain/types/index.js";
import { fromBaseUnits } from "../../../../domain/amounts/index.js";
import {
  fail,
  ok,
  pending,
  query,
  receipt,
  table,
} from "./layout.js";

function amount(value: string, decimals: number, symbol: string): string {
  return `${fromBaseUnits(value, decimals)} ${symbol}`;
}

export const GasFreeFormatters = {
  gasFreeInfo: (value: GasFreeInfoView): string => [
    query([
      ["Owner", value.ownerAddress],
      ["GasFree address", value.gasFreeAddress],
      ["Status", value.active ? "active" : "not activated"],
      ["Nonce", value.nonce],
    ]),
    table(
      ["Token", "Balance", "Activation fee", "Transfer fee"],
      value.tokens.map((token) => [
        token.symbol,
        amount(token.balance, token.decimals, token.symbol),
        amount(token.activateFee, token.decimals, token.symbol),
        amount(token.transferFee, token.decimals, token.symbol),
      ]),
    ),
  ].join("\n\n"),

  gasFreeTransfer: (value: GasFreeTransferView): string => {
    const marker =
      value.stage === "confirmed"
        ? ok()
        : value.stage === "failed"
          ? fail()
          : pending();
    const title =
      value.stage === "dry-run"
        ? `Dry run — GasFree transfer ${amount(value.amount, value.decimals, value.token)} (not submitted)`
        : value.stage === "confirmed"
          ? `Sent ${amount(value.amount, value.decimals, value.token)} via GasFree`
          : value.stage === "failed"
            ? "GasFree transfer failed"
            : `Submitted to GasFree — send ${amount(value.amount, value.decimals, value.token)}`;
    const result = receipt(marker, title, [
      ["Trace ID", value.traceId ?? ""],
      ["TxID", value.txId ?? ""],
      ["From", value.from],
      ["To", value.toContact ? `${value.toContact} (${value.to})` : value.to],
      [
        "Service fee",
        amount(value.serviceFee, value.decimals, value.token),
      ],
      [
        "Activation fee",
        amount(value.activateFee, value.decimals, value.token),
      ],
      [
        "Authorized max fee",
        amount(value.authorizedMaxFee, value.decimals, value.token),
      ],
      ["Total", amount(value.totalDeducted, value.decimals, value.token)],
      [
        "Status",
        value.state?.toLowerCase()
        ?? (value.stage === "dry-run" ? "not submitted" : "accepted"),
      ],
      ["Reason", value.failureReason ?? ""],
    ]);
    return value.stage === "submitted" && value.traceId
      ? `${result}\n! Track it: wallet-cli gasfree trace ${value.traceId}`
      : result;
  },

  gasFreeTrace: (value: GasFreeTraceView): string => query([
    ["Trace ID", value.traceId],
    ["Status", value.state.toLowerCase()],
    ["TxID", value.txId ?? ""],
    ["Token", value.token],
    ["Amount", amount(value.amount, value.decimals, value.token)],
    ["Service fee", amount(value.serviceFee, value.decimals, value.token)],
    [
      "Activation fee",
      amount(value.activateFee, value.decimals, value.token),
    ],
    ["Total", amount(value.totalDeducted, value.decimals, value.token)],
    ["To", value.to],
    ["Reason", value.failureReason ?? ""],
  ]),
};
