// Installed plugins under <home>/plugins/<name>/: active.json and immutable versions/<id>/ directories.
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
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

// The file-system calls whose order the store's guarantees depend on; tests observe or fail them.
export interface StoreFileOps {
  open(path: string, flags: number): number;
  fsync(path: string): void;
  rename(from: string, to: string): void;
  unlink(path: string): void;
}

const NODE_FILE_OPS: StoreFileOps = {
  open: (path, flags) => openSync(path, flags),
  fsync: (path) => {
    if (process.platform === "win32") return;
    const fd = openSync(path, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  },
  rename: renameSync,
  unlink: unlinkSync,
};

// Opening a FIFO without a writer would block; the handle's type is checked after the open.
const READ_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

// One snapshot of the active manifest, read through a single handle so a concurrent replacement or
// removal is seen either wholly or not at all. Undefined when there is no manifest to open.
function readActiveText(path: string, ops: StoreFileOps): string | undefined {
  let fd: number;
  try {
    fd = ops.open(path, READ_FLAGS);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_ACTIVE_BYTES) throw new Error(`${ACTIVE} is not a file`);
    const buffer = Buffer.alloc(MAX_ACTIVE_BYTES + 1);
    let length = 0;
    for (let n; (n = readSync(fd, buffer, length, buffer.length - length, null)) > 0;) length += n;
    if (length > MAX_ACTIVE_BYTES) throw new Error(`${ACTIVE} is not a file`);
    return buffer.toString("utf8", 0, length);
  } finally {
    closeSync(fd);
  }
}

// The active manifest as the store wrote it; anything else is reported, never loaded.
function parseActive(text: string, dir: string, name: string): InstalledPlugin {
  const raw = JSON.parse(text) as Record<string, JsonValue>;
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

export class FilePluginStore implements PluginStore {
  readonly #root: string;

  constructor(
    home: string,
    private readonly files: Pick<AtomicFileStore, "withLock">,
    private readonly ops: StoreFileOps = NODE_FILE_OPS,
  ) {
    this.#root = join(home, "plugins");
  }

  list(): StoredPlugin[] {
    if (!existsSync(this.#root)) return [];
    const stored: StoredPlugin[] = [];
    for (const entry of readdirSync(this.#root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !PLUGIN_WORD.test(entry.name)) continue;
      const dir = join(this.#root, entry.name);
      try {
        const text = readActiveText(join(dir, ACTIVE), this.ops);
        if (text === undefined) continue;
        stored.push({ state: "installed", plugin: parseActive(text, dir, entry.name) });
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

  // Commit point: the rename of the new active manifest over the old one. Everything it references
  // is durable before it.
  #publish(name: string, change: PluginPublication): void {
    const dir = join(this.#root, name);
    const versions = join(dir, "versions");
    const id = `${change.plugin.version}-${randomBytes(6).toString("hex")}`;
    const versionDir = join(versions, id);
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
      mkdirSync(versions, { recursive: true, mode: 0o700 });
      // Each link on the path to versions/ is made durable on every publication: a directory left by
      // an earlier failed attempt exists in memory, which does not mean its link reached the disk.
      // An fsync of a directory does not persist its own link in its parent.
      this.ops.fsync(dirname(this.#root));
      this.ops.fsync(this.#root);
      this.ops.fsync(dir);
      mkdirSync(versionDir, { mode: 0o700 });
      created = true;
      const entry = join(versionDir, ENTRY_FILE);
      writeFileSync(entry, change.entry, { mode: 0o600, flag: "wx" });
      this.ops.fsync(entry);
      this.ops.fsync(versionDir);
      this.ops.fsync(versions);
      writeFileSync(staged, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
      this.ops.fsync(staged);
      this.ops.rename(staged, active);
      published = true;
      this.ops.fsync(dir);
    } catch (error) {
      rmSync(staged, { force: true });
      // Only the directory this call created; a complete one may be in use by another process.
      if (created && !published) rmSync(versionDir, { recursive: true, force: true });
      throw published
        ? new ExecutionError(
            "io_error",
            `plugin ${name} ${change.plugin.version} is installed, but the change could not be confirmed on disk`,
            { committed: true, error: String(error) },
          )
        : new ExecutionError(
            "io_error",
            `could not install plugin ${name}; the previous state is unchanged`,
            { committed: false, error: String(error) },
          );
    }
  }

  // Commit point: the deletion of the active manifest. Version directories stay (another process
  // may be about to import one).
  #remove(name: string): void {
    const dir = join(this.#root, name);
    let removed = false;
    try {
      this.ops.unlink(join(dir, ACTIVE));
      removed = true;
      this.ops.fsync(dir);
    } catch (error) {
      throw new ExecutionError(
        "io_error",
        removed
          ? `plugin ${name} is removed, but the removal could not be confirmed on disk`
          : `could not remove plugin ${name}; it is still installed`,
        { committed: removed, error: String(error) },
      );
    }
  }
}
