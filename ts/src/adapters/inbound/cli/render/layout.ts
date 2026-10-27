import stringWidth from "string-width";
export type Obj = Record<string, unknown>;
export type Pair = [string, string];

// Empty-valued pairs are omitted.
export function kv(pairs: Pair[], indent: string): string {
  const rows = pairs.filter(([, v]) => v !== "" && v !== undefined && v !== null);
  const w = rows.reduce((m, [l]) => Math.max(m, l.length), 0);
  return rows.map(([l, v]) => `${indent}${l.padEnd(w)}  ${v}`).join("\n");
}

// Fields start at column zero.
export function query(pairs: Pair[]): string {
  return kv(pairs, "");
}

// Status and summary precede fields indented two spaces.
export function receipt(marker: string, summary: string, pairs: Pair[]): string {
  const body = kv(pairs, "  ");
  return body ? `${marker} ${summary}\n${body}` : `${marker} ${summary}`;
}

// Plain title precedes fields indented two spaces.
export function titled(title: string, pairs: Pair[]): string {
  const body = kv(pairs, "  ");
  return body ? `${title}\n${body}` : title;
}

// Use terminal column widths: CJK characters and emoji can occupy multiple columns.
export function table(headers: string[], rows: string[][]): string {
  const all = [headers, ...rows];
  const widths = headers.map((_, i) =>
    Math.max(...all.map((row) => stringWidth(String(row[i] ?? "")))),
  );
  const fmt = (row: string[]) =>
    `| ${row.map((cell, i) => pad(String(cell ?? ""), widths[i] ?? 0)).join(" | ")} |`;
  return [fmt(headers), fmt(widths.map((w) => "-".repeat(w))), ...rows.map(fmt)].join("\n");
}

function pad(cell: string, width: number): string {
  return cell + " ".repeat(Math.max(0, width - stringWidth(cell)));
}

export function asObj(v: unknown): Obj {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
}

export function ok(): string {
  return "✅";
}
export function fail(): string {
  return "❌";
}
export function pending(): string {
  return "⏳";
}
export function warn(): string {
  return "⚠️";
}
export function unknown(): string {
  return "❓";
}
