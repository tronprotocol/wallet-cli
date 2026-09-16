import wrapAnsi from "wrap-ansi";
import { sanitizeText } from "./scalars.js";
import { asObj, query, table } from "./layout.js";
import { fromX402Network } from "../../../../domain/x402/network-id.js";

// Keep untrusted text on its own line/cell and never emit terminal controls.
function text(value: unknown): string {
  if (value !== null && typeof value === "object") return "";
  return sanitizeText(String(value ?? ""))
    .replace(/\n/g, " ")
    .replace(/\|/g, "\\|");
}
function summary(value: unknown): string {
  return text(value).match(/^.*?(?:[.!?](?=\s|$)|[。！？])|^.+$/u)?.[0] ?? "";
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
    ["Settled", text(p.settled)],
    ["Delivered", text(p.delivered)],
    ["Output", text(asObj(p.output).path)],
  ]);
  if (p.response === undefined) return details;
  const body = typeof p.response === "string" ? p.response : JSON.stringify(p.response, null, 2);
  return `${details}\n--- response ---\n${sanitizeText(body)}`;
}
export function agentShowText(value: unknown): string {
  const p = asObj(value),
    m = asObj(p.metadata);
  return query([
    ["Agent ID", text(p.agentId)],
    ["Owner", text(p.owner)],
    ["URI", text(p.uri)],
    ["Approved", text(p.approved)],
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
