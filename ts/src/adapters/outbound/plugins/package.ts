// A plugin package read from a tarball or a directory, as the plugin-source port returns it.
import { closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { PluginPackage } from "../../../application/ports/plugin-source.js";
import { ExecutionError, UsageError } from "../../../domain/errors/index.js";
import { isPackagePath, type PluginSourceRecord } from "../../../domain/plugins/index.js";
import type { JsonValue } from "../../../domain/types/index.js";
import { MAX_ARCHIVE_BYTES, MAX_UNPACKED_BYTES, readPackageTarball } from "./tar.js";

const MAX_PACKAGE_JSON_BYTES = 1024 * 1024;

function tooLarge(path: string): ExecutionError {
  return new ExecutionError("plugin_invalid", `invalid plugin package: ${path} is too large`);
}

// Reads a regular file of at most `limit` bytes through one handle: the size is checked before the
// buffer is allocated, and a file that grows meanwhile is still refused.
function readBounded(path: string, label: string, limit: number): Uint8Array | undefined {
  const fd = openSync(path, "r");
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) return undefined;
    if (stat.size > limit) throw tooLarge(label);
    const buffer = new Uint8Array(stat.size + 1);
    let length = 0;
    for (let n; (n = readSync(fd, buffer, length, buffer.length - length, null)) > 0;) {
      length += n;
    }
    if (length > stat.size) throw tooLarge(label);
    return buffer.subarray(0, length);
  } finally {
    closeSync(fd);
  }
}

function packageJson(bytes: Uint8Array | undefined): JsonValue {
  if (bytes === undefined) {
    throw new ExecutionError("plugin_invalid", "invalid plugin package: package.json is missing");
  }
  if (bytes.byteLength > MAX_PACKAGE_JSON_BYTES) {
    throw new ExecutionError("plugin_invalid", "invalid plugin package: package.json is too large");
  }
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as JsonValue;
  } catch {
    throw new ExecutionError("plugin_invalid", "invalid plugin package: package.json is not JSON");
  }
}

export function archivePackage(
  archive: Uint8Array,
  origin: { source: PluginSourceRecord; integrity?: string },
): PluginPackage {
  const files = readPackageTarball(archive);
  return {
    packageJson: packageJson(files.get("package.json")),
    file: (path) => (isPackagePath(path) ? files.get(path) : undefined),
    source: origin.source,
    ...(origin.integrity === undefined ? {} : { integrity: origin.integrity }),
  };
}

function missing(path: string): UsageError {
  return new UsageError("file_not_found", `no plugin package at ${path}`);
}

export function readArchiveFile(path: string): PluginPackage {
  let bytes: Uint8Array | undefined;
  try {
    if (!lstatSync(path).isFile()) throw missing(path);
    bytes = readBounded(path, "the archive", MAX_ARCHIVE_BYTES);
    if (bytes === undefined) throw missing(path);
  } catch (error) {
    if (error instanceof ExecutionError || error instanceof UsageError) throw error;
    throw missing(path);
  }
  return archivePackage(bytes, { source: { type: "archive", path } });
}

// A built package directory; files are read only when they stay inside it, links included.
export function readPackageDirectory(path: string): PluginPackage {
  let root: string;
  try {
    if (!lstatSync(path).isDirectory()) throw missing(path);
    root = realpathSync(path);
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw missing(path);
  }
  const read = (relPath: string, limit: number): Uint8Array | undefined => {
    if (!isPackagePath(relPath)) return undefined;
    try {
      const real = realpathSync(join(root, relPath));
      const inside = relative(root, real);
      if (inside === "" || inside.startsWith(`..${sep}`) || inside === "..") return undefined;
      return readBounded(real, relPath, limit);
    } catch (error) {
      if (error instanceof ExecutionError) throw error;
      return undefined;
    }
  };
  // The same bound as a whole unpacked archive.
  const file = (relPath: string) => read(relPath, MAX_UNPACKED_BYTES);
  return {
    packageJson: packageJson(read("package.json", MAX_PACKAGE_JSON_BYTES)),
    file,
    source: { type: "directory", path },
  };
}
