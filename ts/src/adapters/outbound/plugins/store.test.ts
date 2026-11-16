import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginPublication, StoredPlugin } from "../../../application/ports/plugin-store.js";
import { AtomicFileStore } from "../persistence/fs/index.js";
import { FilePluginStore } from "./store.js";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "wcli-plugins-"));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const store = () => new FilePluginStore(home, new AtomicFileStore());

function publication(version: string, entry = `export default "${version}";`): PluginPublication {
  return {
    kind: "publish",
    plugin: {
      name: "demo",
      version,
      apiVersion: 1,
      apiRevision: 1,
      groups: [{ name: "demo", summary: "Demo", families: [] }],
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
});
