/**
 * redactErrorMessage — scrub sensitive fragments from a free-text error before it reaches the user
 * layer, while keeping the message readable (revert reasons, node reject text stay intact).
 *
 * Three rules:
 *   1. URLs collapse to `scheme://host` — drops path/query/userinfo/port, the usual API-key hiding spots.
 *   2. The home-dir prefix collapses to `~` — no absolute local paths / usernames.
 *   3. Long hex runs collapse to `[redacted]` — a fuse against private keys / hashes slipping in.
 *
 * Deliberately NOT handled: mnemonics (no reliable signature), control chars (JSON.stringify / the
 * text-mode sanitizeText already cover those downstream).
 */
import { homedir } from "node:os";

// scheme://[userinfo@]host[:port][/path][?query][#frag] — capture scheme + host only.
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
