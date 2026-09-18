import { fromBaseUnits } from "../../../../domain/amounts/index.js";
import { structuredText } from "./structured.js";
import wrapAnsi from "wrap-ansi";
import { sanitizeText } from "./scalars.js";
import { asObj, query, table, receipt, ok, warn, type Pair } from "./layout.js";
import { fromX402Network } from "../../../../domain/x402/network-id.js";

// Keep untrusted text on its own line/cell and never emit terminal controls.
function text(value: unknown): string {
  if (value !== null && typeof value === "object") return "";
  return sanitizeText(String(value ?? ""))
    .replace(/\n/g, " ")
    .replace(/\|/g, "\\|");
}
function summary(value: unknown): string {
  return (
    text(value)
      .replace(/(^|\s)#{1,6}\s+/g, "$1")
      .match(/^.*?(?:[.!?](?=\s|$)|[。！？])|^.+$/u)?.[0] ?? ""
  );
}
function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asObj) : [];
}
function network(value: unknown): string {
  const aliases: Record<string, string> = {
    "tron:728126428": "tron",
    "tron:3448148188": "nile",
    "tron:2494104990": "shasta",
    "evm:56": "bsc",
    "evm:97": "bsc-testnet",
    "evm:8453": "base",
    "evm:84532": "base-sepolia",
    "evm:1": "ethereum",
  };
  try {
    const id = fromX402Network(String(value));
    return aliases[`${id.family}:${id.chainId}`] ?? text(value);
  } catch {
    return text(value);
  }
}
function networks(value: unknown): string {
  return Array.isArray(value) ? [...new Set(value.map(network))].join(", ") : "";
}
export function providerListText(value: unknown): string {
  return table(
    ["Provider", "Title", "Type", "Category", "Endpoints", "Networks", "Tags"],
    rows(asObj(value).results).map((p) => [
      text(p.fqn),
      text(p.title ?? p.name),
      text(p.type),
      text(p.category),
      text(p.endpointCount),
      networks(p.chains),
      Array.isArray(p.featuredTags) ? p.featuredTags.map(text).join(", ") : "",
    ]),
  );
}
export function providerShowText(value: unknown): string {
  const p = asObj(value);
  return query([
    ["Provider", text(p.fqn)],
    ["Name", text(p.title ?? p.name)],
    ["Service", text(p.serviceUrl)],
    [
      "Endpoints",
      text(p.endpointCount ?? (Array.isArray(p.endpoints) ? p.endpoints.length : undefined)),
    ],
    [
      "Summary",
      wrapAnsi(
        summary(p.description ?? p.summary),
        Math.max(12, (process.stdout.columns || 80) - 11),
        { hard: true },
      ).replace(/\n/g, "\n           "),
    ],
    ["Type", text(p.type)],
    ["Category", text(p.category)],
    ["Networks", networks(p.chains)],
  ]);
}
export function providerEndpointsText(value: unknown): string {
  return table(
    ["Method", "Path", "Price (USD)", "Networks", "Description"],
    rows(asObj(value).endpoints).map((p) => {
      const routes = rows(p.x402Routes);
      const min = p.minPriceUsd,
        max = p.maxPriceUsd;
      const price =
        !routes.length || min === undefined || max === undefined
          ? "——"
          : min === max
            ? text(min)
            : `${text(min)}–${text(max)}`;
      return [
        text(p.method),
        text(p.path),
        price,
        networks(routes.map((r) => r.network)) || "——",
        summary(p.description),
      ];
    }),
  );
}
export function paymentText(value: unknown): string {
  const p = asObj(value);
  const details = query([
    ["URL", text(p.url)],
    ["Status", text(p.status)],
    ["Settled", p.settled === true ? "Yes" : "No"],
    ["Delivered", p.delivered === true ? "Yes" : "No"],
    ["From", text(asObj(p.payer).address)],
    ["Transaction", text(asObj(p.paymentResponse).transaction)],
    ["Approval", text(asObj(p.approval).txId)],
    ["Output", text(asObj(p.output).path)],
  ]);
  if (p.dryRun === true)
    return `Payment preview — no payment sent\n${details}\nPayment requirements:\n${structuredText(p.selected, "  ")}`;
  if (p.response === undefined) return details;
  const body = typeof p.response === "string" ? p.response : structuredText(p.response);
  return `${details}\n--- response ---\n${sanitizeText(body)}`;
}
export function agentShowText(value: unknown): string {
  const p = asObj(value),
    m = asObj(p.metadata);
  return query([
    ["Agent ID", text(p.agentId)],
    ["Owner", text(p.owner)],
    ["URI", text(p.uri)],
    [
      "Approved",
      ["T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb", "0x0000000000000000000000000000000000000000"].includes(
        String(p.approved),
      )
        ? "None"
        : text(p.approved),
    ],
    ["Registry", text(p.registry)],
    ["Name", text(m.name)],
    ["Description", summary(m.description)],
    ["Image", text(m.image)],
    [
      "Endpoints",
      rows(m.endpoints ?? m.services)
        .map((endpoint) => text(endpoint.type ?? endpoint.name))
        .filter(Boolean)
        .join(", "),
    ],
    [
      "Skills",
      Array.isArray(m.skills)
        ? m.skills
            .filter((skill) => typeof skill === "string")
            .map(text)
            .join(", ")
        : "",
    ],
  ]);
}

function paymentAmountText(value: Record<string, unknown>): string {
  const symbol = text(value.token);
  const raw = value.rawAmount;
  const decimals = value.decimals;
  if (
    typeof raw === "string" &&
    /^\d{1,78}$/.test(raw) &&
    typeof decimals === "number" &&
    Number.isInteger(decimals) &&
    decimals >= 0 &&
    decimals <= 18
  ) {
    return `${fromBaseUnits(raw, decimals)} ${symbol || "tokens"}`;
  }
  if (typeof value.amount === "string") return `${text(value.amount)} ${symbol || "tokens"}`;
  return raw === undefined ? "" : `${text(raw)} base units`;
}

export function roundtripText(value: unknown): string {
  const result = asObj(value),
    serve = asObj(result.serve),
    pay = asObj(result.pay);
  const settled = pay.settled === true,
    delivered = pay.delivered === true;
  const title =
    pay.dryRun === true
      ? "Payment preview — no payment sent"
      : settled
        ? delivered
          ? "Payment settled"
          : "Payment settled; response not delivered"
        : "Payment not settled";
  return receipt(pay.dryRun === true || (settled && delivered) ? ok() : warn(), title, [
    ["Network", network(serve.network)],
    ["Scheme", text(serve.scheme)],
    ["Amount", paymentAmountText(serve)],
    ["Asset", serve.token ? "" : text(serve.asset)],
    ["From", text(asObj(pay.payer).address)],
    ["To", text(serve.payTo)],
    ["Transaction", text(asObj(pay.paymentResponse).transaction)],
    ["Delivery", delivered ? "Delivered" : "Not delivered"],
  ]);
}

export function serveText(value: unknown): string {
  const serve = asObj(value);
  const fields: Pair[] = [
    ["URL", text(serve.payUrl)],
    ["Network", network(serve.network)],
    ["Scheme", text(serve.scheme)],
    ["Amount", paymentAmountText(serve)],
    ["Asset", serve.token ? "" : text(serve.asset)],
    ["Pay to", text(serve.payTo)],
    ["PID", text(serve.pid)],
    ["Log", text(serve.logFile)],
  ];
  return receipt(
    ok(),
    serve.daemon
      ? "Payment endpoint running in background"
      : "Payment endpoint ready (Ctrl+C to stop)",
    fields,
  );
}

export function operatorCheckText(value: unknown): string {
  const data = asObj(value);
  return query([
    ["Owner", text(data.owner)],
    ["Operator", text(data.operator)],
    ["Approved for all Agents", data.approved === true ? "Yes" : "No"],
    ["Registry", text(data.registry)],
  ]);
}

export function catalogUpdateText(value: unknown): string {
  const data = asObj(value);
  return receipt(
    data.updated === true ? ok() : warn(),
    data.updated === true ? "Provider catalog updated" : "Provider catalog update not confirmed",
    [
      ["Providers", text(data.providers)],
      ["Cache", text(data.cache)],
      ["Generated at", text(data.generatedAt)],
    ],
  );
}
