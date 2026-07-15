import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AtomicFileStore } from "./index.js";

const EIO = () => Object.assign(new Error("EIO"), { code: "EIO" });

describe("AtomicFileStore.writeJsonAll", () => {
  it("writes every file and leaves no temp/backup residue on success", () => {
    const root = mkdtempSync(join(tmpdir(), "fs-"));
    const a = join(root, "a.json");
    const b = join(root, "b.json");
    writeFileSync(a, '"old-A"\n');

    const store = new AtomicFileStore();
    store.writeJsonAll([
      { path: a, value: "new-A" },
      { path: b, value: "new-B" }, // b did not exist before
    ]);

    expect(JSON.parse(readFileSync(a, "utf8"))).toBe("new-A");
    expect(JSON.parse(readFileSync(b, "utf8"))).toBe("new-B");
    // no leftover .tmp / .bak files
    expect(readdirSync(root).filter((f) => f.endsWith(".tmp") || f.includes(".bak"))).toEqual([]);
  });

  it("restores every already-committed file when a later rename fails mid-commit", () => {
    const root = mkdtempSync(join(tmpdir(), "fs-"));
    const a = join(root, "a.json");
    const b = join(root, "b.json");
    writeFileSync(a, '"old-A"\n');
    writeFileSync(b, '"old-B"\n');

    const store = new AtomicFileStore();
    let installs = 0;
    store.commitRename = (from: string, to: string) => {
      // installs move a staged temp into place; fail the 2nd so A commits, then B fails
      if (from.includes(".tmp")) {
        installs++;
        if (installs === 2) throw EIO();
      }
      renameSync(from, to);
    };

    expect(() =>
      store.writeJsonAll([
        { path: a, value: "new-A" },
        { path: b, value: "new-B" },
      ]),
    ).toThrow();

    // both files must be back on their OLD contents, and no residue left behind
    expect(JSON.parse(readFileSync(a, "utf8"))).toBe("old-A");
    expect(JSON.parse(readFileSync(b, "utf8"))).toBe("old-B");
    expect(readdirSync(root).filter((f) => f.endsWith(".tmp") || f.includes(".bak"))).toEqual([]);
  });

  it("reports a manual-recovery io_error and keeps backups when automatic restore also fails", () => {
    const root = mkdtempSync(join(tmpdir(), "fs-"));
    const a = join(root, "a.json");
    const b = join(root, "b.json");
    writeFileSync(a, '"old-A"\n');
    writeFileSync(b, '"old-B"\n');

    const store = new AtomicFileStore();
    let installs = 0;
    store.commitRename = (from: string, to: string) => {
      if (from.includes(".tmp")) {
        installs++;
        if (installs === 2) throw EIO(); // B install fails
      }
      if (from.includes(".bak")) throw EIO(); // restore of A from its backup fails too
      renameSync(from, to);
    };

    expect(() =>
      store.writeJsonAll([
        { path: a, value: "new-A" },
        { path: b, value: "new-B" },
      ]),
    ).toThrowError(expect.objectContaining({ code: "io_error" }));

    // A's old blob survives as a .bak for manual recovery
    expect(readdirSync(root).some((f) => f.includes(".bak"))).toBe(true);
    expect(existsSync(a)).toBe(true);
  });

  it("fsyncs every staged temp before commit and the target directory after (CP-03)", () => {
    const root = mkdtempSync(join(tmpdir(), "fs-"));
    const a = join(root, "a.json");
    const b = join(root, "b.json");

    const store = new AtomicFileStore();
    const calls: string[] = [];
    store.fsyncFile = (p: string) => calls.push(`file:${p.endsWith(".tmp") ? "tmp" : "other"}`);
    store.fsyncDir = (d: string) => calls.push(`dir:${d === root ? "root" : "other"}`);

    store.writeJsonAll([
      { path: a, value: "A" },
      { path: b, value: "B" },
    ]);

    // both temps land before the single directory barrier that publishes the renames
    expect(calls).toEqual(["file:tmp", "file:tmp", "dir:root"]);
  });

  it("backs up an existing target under a high-entropy name, never a resettable counter (CP-04)", () => {
    const root = mkdtempSync(join(tmpdir(), "fs-"));
    const a = join(root, "a.json");
    writeFileSync(a, '"old-A"\n');

    const store = new AtomicFileStore();
    const bakTargets: string[] = [];
    store.commitRename = (from: string, to: string) => {
      if (to.endsWith(".bak")) bakTargets.push(to);
      renameSync(from, to);
    };

    store.writeJsonAll([{ path: a, value: "new-A" }]);

    expect(bakTargets).toHaveLength(1);
    // 128-bit hex suffix, not `<pid>.<counter>.bak` — so a leftover .bak can never be reused/overwritten
    expect(bakTargets[0]).toMatch(/\.[0-9a-f]{32}\.bak$/);
  });
});
