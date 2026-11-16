import { asObj, query, sanitizeText } from "../../../../plugin-api/cli.js";
import { CHAIN_FAMILIES, FAMILIES } from "../../../../plugin-api/domain.js";

// Sanitize untrusted text and flatten it to prevent forged terminal rows or cells.
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
export function agentShowText(value: unknown): string {
  const p = asObj(value),
    m = asObj(p.metadata);
  return query([
    ["Agent ID", text(p.agentId)],
    ["Owner", text(p.owner)],
    ["URI", text(p.uri)],
    [
      "Approved",
      CHAIN_FAMILIES.some((family) => FAMILIES[family].zeroAddress === String(p.approved))
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

export function operatorCheckText(value: unknown): string {
  const data = asObj(value);
  return query([
    ["Owner", text(data.owner)],
    ["Operator", text(data.operator)],
    ["Approved for all Agents", data.approved === true ? "Yes" : "No"],
    ["Registry", text(data.registry)],
  ]);
}
