// A plugin package read from a tarball or a directory, as the plugin-source port returns it.
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { PluginPackage } from "../../../application/ports/plugin-source.js";
import { ExecutionError, UsageError } from "../../../domain/errors/index.js";
import { isPackagePath, type PluginSourceRecord } from "../../../domain/plugins/index.js";
import type { JsonValue } from "../../../domain/types/index.js";
import { MAX_ARCHIVE_BYTES, readPackageTarball } from "./tar.js";

const MAX_PACKAGE_JSON_BYTES = 1024 * 1024;

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
  let bytes: Buffer;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile()) throw missing(path);
    if (stat.size > MAX_ARCHIVE_BYTES) {
      throw new ExecutionError(
        "plugin_invalid",
        "invalid plugin package: the archive is too large",
      );
    }
    bytes = readFileSync(path);
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
  const file = (relPath: string): Uint8Array | undefined => {
    if (!isPackagePath(relPath)) return undefined;
    try {
      const real = realpathSync(join(root, relPath));
      const inside = relative(root, real);
      if (inside === "" || inside.startsWith(`..${sep}`) || inside === "..") return undefined;
      if (!lstatSync(real).isFile()) return undefined;
      return new Uint8Array(readFileSync(real));
    } catch {
      return undefined;
    }
  };
  return {
    packageJson: packageJson(file("package.json")),
    file,
    source: { type: "directory", path },
  };
}
