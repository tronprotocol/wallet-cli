import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  fsyncSync,
  openSync,
  closeSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { runBounded } from "../../../../test/plugins/run-bounded.js";
import { join } from "node:path";
import type { PluginPublication, StoredPlugin } from "../../../application/ports/plugin-store.js";
import { AtomicFileStore } from "../persistence/fs/index.js";
import { FilePluginStore, type StoreFileOps } from "./store.js";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "wcli-plugins-"));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const store = () => new FilePluginStore(home, new AtomicFileStore());

const realOps: StoreFileOps = {
  open: (path, flags) => openSync(path, flags),
  fsync: (path) => {
    const fd = openSync(path, "r");
    fsyncSync(fd);
    closeSync(fd);
  },
  rename: renameSync,
  unlink: unlinkSync,
};

// Records every ordered call, relative to the home, and lets a test fail or interleave one.
function observed(hook: (op: string, path: string) => void = () => {}) {
  const calls: string[] = [];
  const rel = (path: string) => path.slice(home.length + 1).replace(/[0-9a-f]{12}/, "<id>");
  const log = (op: string, path: string) => {
    calls.push(
      `${op} ${rel(path).replace(/active\.json\.\d+\.[0-9a-f]+\.tmp$/, "active.json.tmp")}`,
    );
    hook(op, path);
  };
  const ops: StoreFileOps = {
    open: (path, flags) => {
      hook("open", path);
      return realOps.open(path, flags);
    },
    fsync: (path) => {
      log("fsync", path);
      realOps.fsync(path);
    },
    rename: (from, to) => {
      log("rename", from);
      realOps.rename(from, to);
    },
    unlink: (path) => {
      log("unlink", path);
      realOps.unlink(path);
    },
  };
  return { calls, store: new FilePluginStore(home, new AtomicFileStore(), ops) };
}

function publication(version: string, entry = `export default "${version}";`): PluginPublication {
  return {
    kind: "publish",
    plugin: {
      name: "demo",
      version,
      apiVersion: 1,
      apiRevision: 1,
      groups: [{ name: "demo", summary: "Demo", families: [] }],
      credentials: [{ key: "demoApiKey", summary: "Demo API key" }],
      source: { type: "directory", path: "/src/demo" },
      entrySha256: version,
      installedAt: "2026-11-17T00:00:00.000Z",
    },
    entry: Buffer.from(entry),
  };
}

const installed = (list: StoredPlugin[]) =>
  list.flatMap((s) => (s.state === "installed" ? [s.plugin] : []));

describe("FilePluginStore", () => {
  it("publishes by replacing active.json, which points to an immutable version directory", () => {
    const s = store();
    s.update("demo", () => ({ change: publication("1.0.0"), result: undefined }));
    const [plugin] = installed(s.list());
    expect(plugin).toMatchObject({ name: "demo", version: "1.0.0" });
    expect(readFileSync(plugin!.entryPath, "utf8")).toBe('export default "1.0.0";');
    expect(plugin!.entryPath.startsWith(join(home, "plugins/demo/versions/1.0.0-"))).toBe(true);
    expect(readdirSync(join(home, "plugins/demo")).sort()).toEqual(["active.json", "versions"]);
  });

  it("keeps the previous state and removes only its own directory when the commit point fails", () => {
    const s = store();
    s.update("demo", () => ({ change: publication("1.0.0"), result: undefined }));
    const before = readFileSync(join(home, "plugins/demo/active.json"), "utf8");
    const versions = readdirSync(join(home, "plugins/demo/versions"));
    // A non-empty directory at active.json makes the rename onto it fail.
    expect(() =>
      s.update("demo", () => {
        rmSync(join(home, "plugins/demo/active.json"));
        mkdirSync(join(home, "plugins/demo/active.json"));
        writeFileSync(join(home, "plugins/demo/active.json/keep"), "");
        return { change: publication("2.0.0"), result: undefined };
      }),
    ).toThrow(
      expect.objectContaining({
        code: "io_error",
        message: expect.stringContaining("previous state is unchanged"),
      }),
    );
    expect(readdirSync(join(home, "plugins/demo/versions"))).toEqual(versions);
    rmSync(join(home, "plugins/demo/active.json"), { recursive: true });
    writeFileSync(join(home, "plugins/demo/active.json"), before);
    expect(installed(s.list())[0]?.version).toBe("1.0.0");
  });

  it("stores the declared credentials in active.json and reads them back", () => {
    const s = store();
    s.update("demo", () => ({ change: publication("1.0.0"), result: undefined }));
    expect(installed(s.list())[0]?.credentials).toEqual([
      { key: "demoApiKey", summary: "Demo API key" },
    ]);
  });

  it("reads an active.json without credentials as declaring none", () => {
    const s = store();
    s.update("demo", () => ({ change: publication("1.0.0"), result: undefined }));
    const path = join(home, "plugins/demo/active.json");
    const { credentials: _dropped, ...rest } = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, JSON.stringify(rest));
    expect(installed(s.list())[0]?.credentials).toEqual([]);
  });

  it.each([
    ["a core configuration key", [{ key: "timeoutMs", summary: "S" }]],
    ["a malformed list", { key: "demoApiKey" }],
  ])("reports an active.json whose credentials hold %s as unreadable", (_label, credentials) => {
    const s = store();
    s.update("demo", () => ({ change: publication("1.0.0"), result: undefined }));
    const path = join(home, "plugins/demo/active.json");
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), credentials }));
    expect(s.list()).toEqual([{ state: "unreadable", name: "demo", reason: expect.any(String) }]);
  });

  it("does not list a directory without active.json, and reports an unreadable one", () => {
    mkdirSync(join(home, "plugins/half/versions/x"), { recursive: true });
    mkdirSync(join(home, "plugins/bad"), { recursive: true });
    writeFileSync(join(home, "plugins/bad/active.json"), "{not json");
    expect(store().list()).toEqual([
      { state: "unreadable", name: "bad", reason: expect.any(String) },
    ]);
  });

  it("refuses an active manifest that points outside its versions directory", () => {
    const s = store();
    s.update("demo", () => ({ change: publication("1.0.0"), result: undefined }));
    const path = join(home, "plugins/demo/active.json");
    const active = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, JSON.stringify({ ...active, entry: "../../evil.mjs" }));
    expect(s.list()).toEqual([{ state: "unreadable", name: "demo", reason: expect.any(String) }]);
  });

  it("leaves the version a reader already holds in place across update and remove", () => {
    const s = store();
    s.update("demo", () => ({ change: publication("1.0.0"), result: undefined }));
    const held = installed(s.list())[0]!.entryPath;
    s.update("demo", () => ({ change: publication("2.0.0"), result: undefined }));
    expect(installed(s.list())[0]?.version).toBe("2.0.0");
    expect(readFileSync(held, "utf8")).toBe('export default "1.0.0";');
    s.update("demo", () => ({ change: { kind: "remove" }, result: undefined }));
    expect(s.list()).toEqual([]);
    expect(existsSync(held)).toBe(true);
    expect(readdirSync(join(home, "plugins/demo/versions"))).toHaveLength(2);
  });

  it("decides on the installed set it reads under the lock", () => {
    const s = store();
    let seen: StoredPlugin[] = [];
    s.update("demo", () => ({ change: publication("1.0.0"), result: undefined }));
    s.update("other", (set) => {
      seen = [...set];
      return { change: { kind: "none" }, result: undefined };
    });
    expect(installed(seen).map((p) => p.name)).toEqual(["demo"]);
    expect(existsSync(join(home, "plugins.lock"))).toBe(false);
  });

  it("makes every directory link and the version directory durable before each commit point", () => {
    const links = [
      "fsync ", // <home>: holds plugins/
      "fsync plugins", // holds demo/
      "fsync plugins/demo", // holds versions/
    ];
    const publishes = (version: string) => [
      ...links,
      `fsync plugins/demo/versions/${version}-<id>/index.mjs`,
      `fsync plugins/demo/versions/${version}-<id>`,
      "fsync plugins/demo/versions",
      "fsync plugins/demo/active.json.tmp",
      "rename plugins/demo/active.json.tmp",
      "fsync plugins/demo",
    ];
    const first = observed();
    first.store.update("demo", () => ({ change: publication("1.0.0"), result: undefined }));
    expect(first.calls).toEqual(publishes("1.0.0"));
    const second = observed();
    second.store.update("demo", () => ({ change: publication("2.0.0"), result: undefined }));
    expect(second.calls).toEqual(publishes("2.0.0"));
  });

  it("syncs the directory links again on a retry after the first parent sync failed", () => {
    mkdirSync(join(home, "plugins"));
    let failed = false;
    const failing = observed((op, path) => {
      if (op === "fsync" && path === join(home, "plugins") && !failed) {
        failed = true;
        throw new Error("EIO");
      }
    });
    expect(() =>
      failing.store.update("demo", () => ({ change: publication("1.0.0"), result: undefined })),
    ).toThrow(expect.objectContaining({ message: expect.stringContaining("unchanged") }));
    // The failed attempt left plugins/demo/versions in place.
    expect(existsSync(join(home, "plugins/demo/versions"))).toBe(true);
    expect(store().list()).toEqual([]);
    const retry = observed();
    retry.store.update("demo", () => ({ change: publication("1.0.0"), result: undefined }));
    const rename = retry.calls.indexOf("rename plugins/demo/active.json.tmp");
    expect(retry.calls.indexOf("fsync plugins")).toBeGreaterThan(-1);
    expect(retry.calls.indexOf("fsync plugins")).toBeLessThan(rename);
    expect(retry.calls.indexOf("fsync plugins/demo")).toBeLessThan(rename);
    expect(installed(store().list())[0]?.version).toBe("1.0.0");
  });

  it("treats an active manifest removed before it is opened as not installed", () => {
    store().update("demo", () => ({ change: publication("1.0.0"), result: undefined }));
    const active = join(home, "plugins/demo/active.json");
    const racing = observed((op, path) => {
      if (op === "open" && path === active) rmSync(active);
    });
    expect(racing.store.list()).toEqual([]);
  });

  it("reads the manifest it opened even when it is removed during the read", () => {
    store().update("demo", () => ({ change: publication("1.0.0"), result: undefined }));
    const active = join(home, "plugins/demo/active.json");
    let opened = false;
    const ops: StoreFileOps = {
      ...realOps,
      open: (path, flags) => {
        const fd = realOps.open(path, flags);
        if (path === active && !opened) {
          opened = true;
          rmSync(active);
        }
        return fd;
      },
    };
    const listed = new FilePluginStore(home, new AtomicFileStore(), ops).list();
    expect(installed(listed).map((p) => p.version)).toEqual(["1.0.0"]);
    expect(store().list()).toEqual([]);
  });

  it("reports an active manifest that cannot be opened for another reason as unreadable", () => {
    mkdirSync(join(home, "plugins/demo"), { recursive: true });
    const failing = new FilePluginStore(home, new AtomicFileStore(), {
      ...realOps,
      open: () => {
        throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      },
    });
    expect(failing.list()).toEqual([
      { state: "unreadable", name: "demo", reason: expect.stringContaining("EACCES") },
    ]);
  });

  it("reports a failure after the manifest rename as installed, and the next read sees it", () => {
    store().update("demo", () => ({ change: publication("1.0.0"), result: undefined }));
    let renamed = false;
    const failing = observed((op) => {
      if (op === "rename") renamed = true;
      else if (renamed && op === "fsync") throw new Error("EIO");
    });
    expect(() =>
      failing.store.update("demo", () => ({ change: publication("2.0.0"), result: undefined })),
    ).toThrow(
      expect.objectContaining({
        code: "io_error",
        message: expect.stringContaining("demo 2.0.0 is installed"),
        details: expect.objectContaining({ committed: true }),
      }),
    );
    expect(installed(store().list())[0]?.version).toBe("2.0.0");
  });

  it("reports a failure after the unlink as removed, and the next read sees no plugin", () => {
    store().update("demo", () => ({ change: publication("1.0.0"), result: undefined }));
    let unlinked = false;
    const failing = observed((op) => {
      if (op === "unlink") unlinked = true;
      else if (unlinked && op === "fsync") throw new Error("EIO");
    });
    expect(() =>
      failing.store.update("demo", () => ({ change: { kind: "remove" }, result: undefined })),
    ).toThrow(
      expect.objectContaining({
        code: "io_error",
        message: expect.stringContaining("demo is removed"),
        details: expect.objectContaining({ committed: true }),
      }),
    );
    expect(store().list()).toEqual([]);
  });

  it("reports a failure before the unlink as still installed", () => {
    store().update("demo", () => ({ change: publication("1.0.0"), result: undefined }));
    const failing = observed((op) => {
      if (op === "unlink") throw new Error("EBUSY");
    });
    expect(() =>
      failing.store.update("demo", () => ({ change: { kind: "remove" }, result: undefined })),
    ).toThrow(
      expect.objectContaining({
        message: expect.stringContaining("still installed"),
        details: expect.objectContaining({ committed: false }),
      }),
    );
    expect(installed(store().list())).toHaveLength(1);
  });

  it.skipIf(process.platform === "win32")(
    "lists a FIFO active manifest as unreadable without blocking on it",
    () => {
      mkdirSync(join(home, "plugins/demo"), { recursive: true });
      execFileSync("mkfifo", [join(home, "plugins/demo/active.json")]);
      const r = runBounded(`
        import { FilePluginStore } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, "store.ts")).href)};
        import { AtomicFileStore } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, "../persistence/fs/index.ts")).href)};
        console.log(JSON.stringify(new FilePluginStore(${JSON.stringify(home)}, new AtomicFileStore()).list()));
      `);
      expect(r.signal, r.stderr).toBeNull();
      expect(JSON.parse(r.stdout)).toEqual([
        { state: "unreadable", name: "demo", reason: "active.json is not a file" },
      ]);
    },
  );
});
