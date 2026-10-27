// Redacts URL credentials, home paths, and 0/0x-prefixed long hex; does not detect mnemonics.
import { homedir } from "node:os";

// Capture only the scheme and host; discard credentials, port, path, query, and fragment.
const URL_RE = /\b([a-z][a-z0-9+.-]*):\/\/(?:[^/@\s]*@)?([^/:\s?#]+)(?::\d+)?(?:[/?#][^\s]*)?/gi;
const HEX_RE = /\b0x?[0-9a-fA-F]{40,}\b/g;

export function redactErrorMessage(raw: string): string {
  if (raw === "") return raw;
  let out = raw.replace(URL_RE, (_m, scheme: string, host: string) => `${scheme}://${host}`);
  const home = homedir();
  if (home && out.includes(home)) out = out.split(home).join("~");
  out = out.replace(HEX_RE, "[redacted]");
  return out;
}
