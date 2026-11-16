// Installed plugins under <home>/plugins/<name>/: active.json and immutable versions/<id>/ directories.
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type {
  InstalledPlugin,
  PluginPublication,
  PluginStore,
  PluginStoreChange,
  StoredPlugin,
} from "../../../application/ports/plugin-store.js";
import { ExecutionError } from "../../../domain/errors/index.js";
import {
  isPackagePath,
  parsePluginManifest,
  PLUGIN_WORD,
  type PluginSourceRecord,
} from "../../../domain/plugins/index.js";
import type { JsonValue } from "../../../domain/types/index.js";
import type { AtomicFileStore } from "../persistence/fs/index.js";

const ACTIVE = "active.json";
const ENTRY_FILE = "index.mjs";
const MAX_ACTIVE_BYTES = 1024 * 1024;

interface ActiveManifest extends Omit<InstalledPlugin, "entryPath"> {
  readonly schema: 1;
  // Relative to the plugin directory.
  readonly entry: string;
}

function isSource(value: unknown): value is PluginSourceRecord {
  const v = value as Record<string, unknown> | null;
  if (typeof v !== "object" || v === null) return false;
  if (v.type === "registry") return typeof v.spec === "string" && typeof v.registry === "string";
  return (v.type === "directory" || v.type === "archive") && typeof v.path === "string";
}

// The active manifest as the store wrote it; anything else is reported, never loaded.
function readActive(dir: string, name: string): InstalledPlugin {
  const path = join(dir, ACTIVE);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > MAX_ACTIVE_BYTES) throw new Error(`${ACTIVE} is not a file`);
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, JsonValue>;
  if (raw.schema !== 1) throw new Error(`${ACTIVE} has an unknown schema`);
  const manifest = parsePluginManifest({
    version: raw.version ?? null,
    walletCli: {
      plugin: {
        name: raw.name ?? null,
        apiVersion: raw.apiVersion ?? null,
        apiRevision: raw.apiRevision ?? null,
        entry: raw.entry ?? null,
        groups: raw.groups ?? null,
      },
    },
  });
  if (manifest.name !== name) throw new Error(`${ACTIVE} names plugin ${manifest.name}`);
  if (!manifest.entry.startsWith("versions/") || !isPackagePath(manifest.entry)) {
    throw new Error(`${ACTIVE} points outside its versions directory`);
  }
  if (!isSource(raw.source) || typeof raw.installedAt !== "string") {
    throw new Error(`${ACTIVE} has no install record`);
  }
  return {
    name: manifest.name,
    version: manifest.version,
    apiVersion: manifest.apiVersion,
    apiRevision: manifest.apiRevision,
    groups: manifest.groups,
    entryPath: join(dir, manifest.entry),
    source: raw.source,
    ...(typeof raw.integrity === "string" ? { integrity: raw.integrity } : {}),
    entrySha256: typeof raw.entrySha256 === "string" ? raw.entrySha256 : "",
    installedAt: raw.installedAt,
  };
}

function fsyncPath(path: string): void {
  if (process.platform === "win32") return;
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export class FilePluginStore implements PluginStore {
  readonly #root: string;

  constructor(
    home: string,
    private readonly files: Pick<AtomicFileStore, "withLock">,
  ) {
    this.#root = join(home, "plugins");
  }

  list(): StoredPlugin[] {
    if (!existsSync(this.#root)) return [];
    const stored: StoredPlugin[] = [];
    for (const entry of readdirSync(this.#root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !PLUGIN_WORD.test(entry.name)) continue;
      const dir = join(this.#root, entry.name);
      if (!existsSync(join(dir, ACTIVE))) continue;
      try {
        stored.push({ state: "installed", plugin: readActive(dir, entry.name) });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        stored.push({ state: "unreadable", name: entry.name, reason });
      }
    }
    return stored;
  }

  update<R>(
    name: string,
    decide: (installed: readonly StoredPlugin[]) => { change: PluginStoreChange; result: R },
  ): R {
    if (!PLUGIN_WORD.test(name)) throw new Error(`invalid plugin name ${name}`);
    mkdirSync(this.#root, { recursive: true, mode: 0o700 });
    // `<home>/plugins.lock`.
    return this.files.withLock(this.#root, () => {
      const { change, result } = decide(this.list());
      if (change.kind === "publish") this.#publish(name, change);
      if (change.kind === "remove") this.#remove(name);
      return result;
    });
  }

  // Commit point: the rename of the new active manifest over the old one.
  #publish(name: string, change: PluginPublication): void {
    const dir = join(this.#root, name);
    const id = `${change.plugin.version}-${randomBytes(6).toString("hex")}`;
    const versionDir = join(dir, "versions", id);
    const manifest: ActiveManifest = {
      schema: 1,
      ...change.plugin,
      entry: `versions/${id}/${ENTRY_FILE}`,
    };
    const active = join(dir, ACTIVE);
    const staged = `${active}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    let created = false;
    let published = false;
    try {
      mkdirSync(join(dir, "versions"), { recursive: true, mode: 0o700 });
      mkdirSync(versionDir, { mode: 0o700 });
      created = true;
      const entry = join(versionDir, ENTRY_FILE);
      writeFileSync(entry, change.entry, { mode: 0o600, flag: "wx" });
      fsyncPath(entry);
      fsyncPath(versionDir);
      writeFileSync(staged, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
      fsyncPath(staged);
      renameSync(staged, active);
      published = true;
      fsyncPath(dir);
    } catch (error) {
      rmSync(staged, { force: true });
      // Only the directory this call created; a complete one may be in use by another process.
      if (created && !published) rmSync(versionDir, { recursive: true, force: true });
      throw new ExecutionError(
        "io_error",
        published
          ? `plugin ${name} ${change.plugin.version} is installed, but writing it to disk could not be confirmed`
          : `could not install plugin ${name}; the previous state is unchanged`,
        { error: String(error) },
      );
    }
  }

  // Commit point: the deletion of the active manifest. Version directories stay (another process
  // may be about to import one).
  #remove(name: string): void {
    const dir = join(this.#root, name);
    try {
      unlinkSync(join(dir, ACTIVE));
      fsyncPath(dir);
    } catch (error) {
      throw new ExecutionError("io_error", `could not remove plugin ${name}`, {
        error: String(error),
      });
    }
  }
}
