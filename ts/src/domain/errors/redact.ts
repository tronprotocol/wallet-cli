// Redacts URL credentials, home paths, 0x-prefixed long hex, and bare key-length hex; does not detect mnemonics.

// Capture only the scheme and host; discard credentials, port, path, query, and fragment.
const URL_RE = /\b([a-z][a-z0-9+.-]*):\/\/(?:[^/@\s]*@)?([^/:\s?#]+)(?::\d+)?(?:[/?#][^\s]*)?/gi;
const HEX_RE = /\b(?:0[xX][0-9a-fA-F]{40,}|[0-9a-fA-F]{64,})\b/g;

let homeDirectory = "";

// The directory replaced with "~"; bootstrap sets it to the user's home before anything runs.
export function setRedactedHomeDirectory(path: string): void {
  homeDirectory = path;
}

export function redactErrorMessage(raw: string): string {
  if (raw === "") return raw;
  let out = raw.replace(URL_RE, (_m, scheme: string, host: string) => `${scheme}://${host}`);
  const home = homeDirectory;
  if (home && out.includes(home)) out = out.split(home).join("~");
  out = out.replace(HEX_RE, "[redacted]");
  return out;
}
