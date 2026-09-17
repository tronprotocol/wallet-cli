/** Append an endpoint without discarding a facilitator deployment's path prefix. */
export function facilitatorUrl(base: string, path: string): URL {
  return new URL(path.replace(/^\/+/, ""), `${base.replace(/\/+$/, "")}/`);
}
