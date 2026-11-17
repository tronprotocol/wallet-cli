// Preserve the facilitator's path prefix.
export function facilitatorUrl(base: string, path: string): URL {
  return new URL(path.replace(/^\/+/, ""), `${base.replace(/\/+$/, "")}/`);
}
