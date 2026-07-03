/**
 * Layout primitives — structural composition of label/value blocks and tables,
 * plus status glyphs. The "§0.4 字段独占一行" vocabulary; no scalar or domain knowledge.
 */
export type Obj = Record<string, unknown>;
export type Pair = [string, string];

/** aligned `<Label>  <value>` block; empty-valued pairs are dropped. */
export function kv(pairs: Pair[], indent: string): string {
  const rows = pairs.filter(([, v]) => v !== "" && v !== undefined && v !== null);
  const w = rows.reduce((m, [l]) => Math.max(m, l.length), 0);
  return rows.map(([l, v]) => `${indent}${l.padEnd(w)}  ${v}`).join("\n");
}

/** single-object query: fields at column 0, one per line. */
export function query(pairs: Pair[]): string {
  return kv(pairs, "");
}

/** action receipt: status marker + summary, fields indented two spaces. */
export function receipt(marker: string, summary: string, pairs: Pair[]): string {
  const body = kv(pairs, "  ");
  return body ? `${marker} ${summary}\n${body}` : `${marker} ${summary}`;
}

/** identity/status block: plain title line, fields indented two spaces. */
export function titled(title: string, pairs: Pair[]): string {
  const body = kv(pairs, "  ");
  return body ? `${title}\n${body}` : title;
}

export function table(headers: string[], rows: string[][]): string {
  const all = [headers, ...rows];
  const widths = headers.map((_, i) => Math.max(...all.map((row) => String(row[i] ?? "").length)));
  const fmt = (row: string[]) => `| ${row.map((cell, i) => String(cell ?? "").padEnd(widths[i] ?? 0)).join(" | ")} |`;
  return [fmt(headers), fmt(widths.map((w) => "-".repeat(w))), ...rows.map(fmt)].join("\n");
}

export function asObj(v: unknown): Obj {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};
}

export function ok(): string { return "✅"; }
export function fail(): string { return "❌"; }
export function pending(): string { return "⏳"; }
export function warn(): string { return "⚠️"; }
export function unknown(): string { return "❓"; }
