// Reads an npm package tarball (gzip + ustar/pax) in memory, without writing anything to disk.
import { gunzipSync } from "node:zlib";
import { ExecutionError } from "../../../domain/errors/index.js";
import { isPackagePath } from "../../../domain/plugins/index.js";

export const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
export const MAX_UNPACKED_BYTES = 64 * 1024 * 1024;
export const MAX_ENTRIES = 10_000;

const BLOCK = 512;

function unsafe(message: string): ExecutionError {
  return new ExecutionError("plugin_invalid", `invalid plugin package: ${message}`);
}

function field(header: Uint8Array, offset: number, length: number): string {
  const bytes = header.subarray(offset, offset + length);
  const end = bytes.indexOf(0);
  return Buffer.from(end === -1 ? bytes : bytes.subarray(0, end)).toString("utf8");
}

function size(header: Uint8Array): number {
  // Base-256 sizes mark files of 8 GiB and more, far above the limits.
  if ((header[124]! & 0x80) !== 0) throw unsafe("an archive entry is too large");
  const text = field(header, 124, 12).trim();
  if (!/^[0-7]*$/.test(text)) throw unsafe("an archive header is corrupt");
  return text === "" ? 0 : parseInt(text, 8);
}

function checksumMatches(header: Uint8Array): boolean {
  const stored = field(header, 148, 8).trim();
  if (!/^[0-7]+$/.test(stored)) return false;
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : header[i]!;
  return sum === parseInt(stored, 8);
}

// `path` records of a pax extended header.
function paxPath(body: Uint8Array): string | undefined {
  const text = Buffer.from(body).toString("utf8");
  let path: string | undefined;
  for (let at = 0; at < text.length;) {
    const space = text.indexOf(" ", at);
    const length = parseInt(text.slice(at, space), 10);
    if (space === -1 || !Number.isSafeInteger(length) || length <= 0) {
      throw unsafe("a pax header is corrupt");
    }
    const record = text.slice(space + 1, at + length - 1);
    const eq = record.indexOf("=");
    if (record.slice(0, eq) === "path") path = record.slice(eq + 1);
    at += length;
  }
  return path;
}

// npm packs every file under one top-level directory, normally `package/`; it is removed here.
function packagePath(raw: string): string {
  const slash = raw.indexOf("/");
  const inside = slash === -1 ? "" : raw.slice(slash + 1).replace(/\/+$/, "");
  if (raw.startsWith("/") || !isPackagePath(inside)) {
    throw unsafe(`archive entry "${raw}" leaves the package root`);
  }
  return inside;
}

// Regular files by their path inside the package. Links, devices, absolute paths and paths that
// leave the package root are refused, and the sizes are bounded before and after decompression.
export function readPackageTarball(archive: Uint8Array): Map<string, Uint8Array> {
  if (archive.byteLength > MAX_ARCHIVE_BYTES) throw unsafe("the archive is too large");
  let tar: Buffer;
  try {
    tar = gunzipSync(archive, { maxOutputLength: MAX_UNPACKED_BYTES });
  } catch (error) {
    const tooLarge = (error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE";
    throw unsafe(tooLarge ? "the unpacked archive is too large" : "the archive is not gzip data");
  }
  const files = new Map<string, Uint8Array>();
  let longName: string | undefined;
  let entries = 0;
  for (let offset = 0; offset + BLOCK <= tar.length;) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    if (!checksumMatches(header)) throw unsafe("an archive header is corrupt");
    if (++entries > MAX_ENTRIES) throw unsafe("the archive has too many entries");
    const length = size(header);
    const bodyStart = offset + BLOCK;
    const bodyEnd = bodyStart + length;
    if (bodyEnd > tar.length) throw unsafe("the archive is truncated");
    const body = tar.subarray(bodyStart, bodyEnd);
    offset = bodyStart + Math.ceil(length / BLOCK) * BLOCK;
    const type = String.fromCharCode(header[156]!);
    if (type === "x") {
      longName = paxPath(body) ?? longName;
      continue;
    }
    if (type === "L") {
      longName = field(body, 0, body.length);
      continue;
    }
    if (type === "g") continue;
    const prefix = field(header, 345, 155);
    const name =
      longName ?? (prefix ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100));
    longName = undefined;
    if (type === "5") {
      packagePath(`${name.replace(/\/+$/, "")}/x`);
      continue;
    }
    if (type !== "0" && type !== "\0" && type !== "7") {
      throw unsafe(`archive entry "${name}" is a link or special file`);
    }
    const path = packagePath(name);
    if (files.has(path)) throw unsafe(`archive entry "${path}" appears twice`);
    files.set(path, new Uint8Array(body));
  }
  return files;
}
