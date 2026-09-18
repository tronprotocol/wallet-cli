import { formatScalar, sanitizeText } from "./scalars.js";

/** Human-readable fallback for arbitrary provider responses and nested query results. */
export function structuredText(value: unknown, indent = ""): string {
  const scalar = (item: unknown) => {
    if (item === null || item === undefined) return "Not available";
    if (typeof item === "boolean") return item ? "Yes" : "No";
    return sanitizeText(formatScalar(item)).replace(/\n/g, `\n${indent}  `);
  };
  if (Array.isArray(value)) {
    if (!value.length) return `${indent}None`;
    return value
      .map((item, index) =>
        item !== null && typeof item === "object"
          ? `${indent}${index + 1}.\n${structuredText(item, indent + "  ")}`
          : `${indent}- ${scalar(item)}`,
      )
      .join("\n");
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return `${indent}None`;
    return entries
      .map(([key, item]) => {
        const label = sanitizeText(key)
          .replace(/\n/g, " ")
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .replace(/_/g, " ");
        return item !== null && typeof item === "object"
          ? `${indent}${label}:\n${structuredText(item, indent + "  ")}`
          : `${indent}${label}: ${scalar(item)}`;
      })
      .join("\n");
  }
  return `${indent}${scalar(value)}`;
}
