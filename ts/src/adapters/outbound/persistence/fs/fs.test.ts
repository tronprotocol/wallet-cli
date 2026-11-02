import { describe, it, expect, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { AtomicFileStore } from "./index.js";
import { CommandDeadline } from "../../../../application/services/command-deadline.js";
import { DeadlineExpiredError } from "../../../../application/contracts/deadline.js";

const EIO = () => Object.assign(new Error("EIO"), { code: "EIO" });

describe("AtomicFileStore.writeJsonAll", () => {
  it("writes every file and leaves no temp/backup residue on success", () => {
    const root = mkdtempSync(join(tmpdir(), "fs-"));
    const a = join(root, "a.json");
    const b = join(root, "b.json");
    writeFileSync(a, '"old-A"\n');

    const store = new AtomicFileStore();
    expect(
      store.writeJsonAll([
        { path: a, value: "new-A" },
        { path: b, value: "new-B" }, // b did not exist before
      ]),
    ).toEqual([]);

    expect(JSON.parse(readFileSync(a, "utf8"))).toBe("new-A");
    expect(JSON.parse(readFileSync(b, "utf8"))).toBe("new-B");
    expect(readdirSync(root).filter((f) => f.endsWith(".tmp") || f.includes(".bak"))).toEqual([]);
  });

  it("returns the backup it could not remove after the commit", () => {
    const root = mkdtempSync(join(tmpdir(), "fs-"));
    const a = join(root, "a.json");
    writeFileSync(a, '"old-A"\n');

    const store = new AtomicFileStore();
    let backup = "";
    store.commitRename = (from: string, to: string) => {
      if (!to.endsWith(".bak")) return renameSync(from, to);
      // A non-empty directory in place of the backup makes the final unlink fail.
      backup = to;
      unlinkSync(from);
      mkdirSync(to);
      writeFileSync(join(to, "keep"), "");
    };

    expect(store.writeJsonAll([{ path: a, value: "new-A" }])).toEqual([backup]);
    expect(JSON.parse(readFileSync(a, "utf8"))).toBe("new-A");
    expect(existsSync(backup)).toBe(true);
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
        if (installs === 2) throw EIO();
      }
      if (from.includes(".bak")) throw EIO();
      renameSync(from, to);
    };

    expect(() =>
      store.writeJsonAll([
        { path: a, value: "new-A" },
        { path: b, value: "new-B" },
      ]),
    ).toThrowError(expect.objectContaining({ code: "io_error" }));

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

    expect(calls).toEqual(["file:tmp", "file:tmp", "dir:root"]);
  });

  it("keeps committed data and retains backups when the post-commit dir fsync fails (not a rollback)", () => {
    const root = mkdtempSync(join(tmpdir(), "fs-"));
    const a = join(root, "a.json");
    writeFileSync(a, '"old-A"\n');

    const store = new AtomicFileStore();
    store.fsyncDir = () => {
      throw EIO();
    };

    expect(() => store.writeJsonAll([{ path: a, value: "new-A" }])).toThrowError(
      expect.objectContaining({ code: "io_error" }),
    );

    expect(JSON.parse(readFileSync(a, "utf8"))).toBe("new-A");
    expect(readdirSync(root).some((f) => f.includes(".bak"))).toBe(true);
  });

  it("fsyncs the affected directory during a clean rollback, before rethrowing", () => {
    const root = mkdtempSync(join(tmpdir(), "fs-"));
    const a = join(root, "a.json");
    const b = join(root, "b.json");
    writeFileSync(a, '"old-A"\n');
    writeFileSync(b, '"old-B"\n');

    const store = new AtomicFileStore();
    const dirSyncs: string[] = [];
    store.fsyncDir = (d: string) => dirSyncs.push(d);
    let installs = 0;
    store.commitRename = (from: string, to: string) => {
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

    expect(dirSyncs).toContain(root);
    expect(JSON.parse(readFileSync(a, "utf8"))).toBe("old-A");
  });

  it("reports rollback-durability-uncertain (not a bare error) when the rollback fsync fails", () => {
    const root = mkdtempSync(join(tmpdir(), "fs-"));
    const a = join(root, "a.json");
    const b = join(root, "b.json");
    writeFileSync(a, '"old-A"\n');
    writeFileSync(b, '"old-B"\n');

    const store = new AtomicFileStore();
    store.fsyncDir = () => {
      throw EIO();
    };
    let installs = 0;
    store.commitRename = (from: string, to: string) => {
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
    ).toThrowError(expect.objectContaining({ code: "io_error" }));
    expect(JSON.parse(readFileSync(a, "utf8"))).toBe("old-A");
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
    expect(bakTargets[0]).toMatch(/\.[0-9a-f]{32}\.bak$/);
  });
});

describe("AtomicFileStore.fsyncDir", () => {
  it("propagates a real I/O error instead of silently reporting a durable write", () => {
    const store = new AtomicFileStore();
    store.rawFsyncDir = () => {
      throw EIO();
    };
    expect(() => store.fsyncDir("/anything")).toThrowError(
      expect.objectContaining({ code: "EIO" }),
    );
  });

  it("swallows an unsupported-directory-fsync error (best-effort)", () => {
    const store = new AtomicFileStore();
    store.rawFsyncDir = () => {
      throw Object.assign(new Error("EINVAL"), { code: "EINVAL" });
    };
    expect(() => store.fsyncDir("/anything")).not.toThrow();
  });
});

describe("AtomicFileStore I/O error mapping", () => {
  const ENOSPC = () => {
    throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
  };

  it("writeJson reports io_error, preserves the target, and removes its temp", () => {
    const root = mkdtempSync(join(tmpdir(), "fs-enospc-json-"));
    const target = join(root, "data.json");
    writeFileSync(target, '"old"\n');
    const store = new AtomicFileStore();
    store.fsyncFile = ENOSPC;

    expect(() => store.writeJson(target, "new")).toThrowError(
      expect.objectContaining({ code: "io_error" }),
    );
    expect(readFileSync(target, "utf8")).toBe('"old"\n');
    expect(readdirSync(root)).toEqual(["data.json"]);
  });

  it("writeText reports io_error, preserves the target, and removes its temp", () => {
    const root = mkdtempSync(join(tmpdir(), "fs-enospc-text-"));
    const target = join(root, "config.yaml");
    writeFileSync(target, "old\n");
    const store = new AtomicFileStore();
    store.fsyncFile = ENOSPC;

    expect(() => store.writeText(target, "new\n")).toThrowError(
      expect.objectContaining({ code: "io_error" }),
    );
    expect(readFileSync(target, "utf8")).toBe("old\n");
    expect(readdirSync(root)).toEqual(["config.yaml"]);
  });

  it("writeJsonAll maps a cleanly rolled-back ENOSPC to io_error", () => {
    const root = mkdtempSync(join(tmpdir(), "fs-enospc-all-"));
    const target = join(root, "wallets.json");
    writeFileSync(target, '"old"\n');
    const store = new AtomicFileStore();
    store.fsyncFile = ENOSPC;

    expect(() => store.writeJsonAll([{ path: target, value: "new" }])).toThrowError(
      expect.objectContaining({ code: "io_error" }),
    );
    expect(readFileSync(target, "utf8")).toBe('"old"\n');
    expect(readdirSync(root)).toEqual(["wallets.json"]);
  });
});

describe("AtomicFileStore.recoverJournal", () => {
  it.each([
    ["no journal was published", undefined],
    ["the journal is staged", { version: 1, state: "staged", files: ["a.json"] }],
  ])("removes journal temp files a killed process left when %s", (_label, journal) => {
    const root = mkdtempSync(join(tmpdir(), "afs-journal-"));
    const journalPath = join(root, "op.journal.json");
    writeFileSync(join(root, "a.json"), '"old"\n');
    writeFileSync(join(root, "a.json.next"), '"new"\n');
    if (journal) writeFileSync(journalPath, JSON.stringify(journal));
    writeFileSync(`${journalPath}.4242.0.tmp`, "{}");
    writeFileSync(join(root, "a.json.4242.1.tmp"), "{}");

    new AtomicFileStore().recoverJournal(journalPath);

    // Another file's temp is not the journal's to remove.
    const expected = journal
      ? ["a.json", "a.json.4242.1.tmp"]
      : ["a.json", "a.json.4242.1.tmp", "a.json.next"];
    expect(readdirSync(root).sort()).toEqual(expected);
    expect(readFileSync(join(root, "a.json"), "utf8")).toBe('"old"\n');
  });
});

describe("AtomicFileStore.withLock under the command deadline", () => {
  const held = () => {
    const dir = mkdtempSync(join(tmpdir(), "wcli-lock-"));
    const path = join(dir, "data.json");
    // A live owner (this process) keeps the lock from being treated as stale.
    writeFileSync(`${path}.lock`, `${process.pid}\n`);
    return path;
  };

  it("waits for a held lock no longer than the time left, then reports timeout", () => {
    const path = held();
    const clock = { now: () => performance.now() };
    const store = new AtomicFileStore(new CommandDeadline(150, clock.now(), clock));
    const fn = vi.fn();
    const started = Date.now();
    expect(() => store.withLock(path, fn)).toThrow(DeadlineExpiredError);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("keeps the 5 s lock limit and its error when more time is left", () => {
    const path = held();
    const store = new AtomicFileStore(new CommandDeadline(0));
    expect(() => store.withLock(path, () => {}, { timeoutMs: 50 })).toThrow(
      /timed out acquiring lock/,
    );
  });

  it("starts no write after expiry and releases the lock", () => {
    const dir = mkdtempSync(join(tmpdir(), "wcli-lock-"));
    const path = join(dir, "data.json");
    const clock = { now: () => 0 };
    const deadline = new CommandDeadline(1000, 0, clock);
    deadline.dispose();
    clock.now = () => 1000;
    const fn = vi.fn();
    expect(() => new AtomicFileStore(deadline).withLock(path, fn)).toThrow(DeadlineExpiredError);
    expect(fn).not.toHaveBeenCalled();
    expect(existsSync(`${path}.lock`)).toBe(false);
  });
});

describe("AtomicFileStore.withLock staleness", () => {
  const DEAD_PID = 999999999;
  const lockedPath = (content: string, ageMs = 0) => {
    const path = join(mkdtempSync(join(tmpdir(), "wcli-lock-")), "data.json");
    writeFileSync(`${path}.lock`, content);
    age(`${path}.lock`, ageMs);
    return path;
  };
  const age = (file: string, ms: number) => {
    const then = new Date(Date.now() - ms);
    utimesSync(file, then, then);
  };
  const acquires = (path: string) =>
    new AtomicFileStore().withLock(path, () => "acquired", { timeoutMs: 50 });

  it("takes over a lock whose PID is dead", () => {
    expect(acquires(lockedPath(`${DEAD_PID}\nother\n2026-01-01T00:00:00.000Z\n`))).toBe("acquired");
  });

  it("takes over a live PID's lock not refreshed for 60 s", () => {
    const path = lockedPath(`${process.ppid}\nother\n2026-01-01T00:00:00.000Z\n`, 3_600_000);
    const started = performance.now();
    expect(acquires(path)).toBe("acquired");
    expect(performance.now() - started).toBeLessThan(1000);
    expect(existsSync(`${path}.lock`)).toBe(false);
  });

  it("respects a fresh lock of a live PID and names the file to delete", () => {
    const content = `${process.ppid}\nother\n2026-01-01T00:00:00.000Z\n`;
    const path = lockedPath(content, 1000);
    expect(() => acquires(path)).toThrow(
      `timed out acquiring lock ${path}.lock, held by process ${process.ppid}; if no wallet-cli command is running, delete ${path}.lock and retry`,
    );
    expect(readFileSync(`${path}.lock`, "utf8")).toBe(content);
  });

  it("judges a lock file from earlier releases by its PID and age", () => {
    expect(acquires(lockedPath(`${DEAD_PID}\n`))).toBe("acquired");
    expect(acquires(lockedPath(`${process.ppid}\n`, 61_000))).toBe("acquired");
    expect(acquires(lockedPath("not a pid", 61_000))).toBe("acquired");
    expect(() => acquires(lockedPath(`${process.ppid}\n`))).toThrow(/timed out acquiring lock/);
    expect(() => acquires(lockedPath("not a pid"))).toThrow(/timed out acquiring lock/);
  });

  it("writes PID, token and creation time, and removes its own lock on release", () => {
    const path = join(mkdtempSync(join(tmpdir(), "wcli-lock-")), "data.json");
    new AtomicFileStore().withLock(path, () => {
      expect(readFileSync(`${path}.lock`, "utf8")).toMatch(
        new RegExp(`^${process.pid}\\n[0-9a-f]{32}\\n\\d{4}-\\d\\d-\\d\\dT[^\\n]+Z\\n$`),
      );
    });
    expect(readdirSync(dirname(path))).toEqual([]);
  });

  it("does not remove a lock that another holder owns at release", () => {
    const path = join(mkdtempSync(join(tmpdir(), "wcli-lock-")), "data.json");
    const theirs = `${process.ppid}\nother\n2026-01-01T00:00:00.000Z\n`;
    new AtomicFileStore().withLock(path, () => {
      unlinkSync(`${path}.lock`);
      writeFileSync(`${path}.lock`, theirs);
    });
    expect(readFileSync(`${path}.lock`, "utf8")).toBe(theirs);
  });

  it("keeps a refreshed lock older than 60 s", () => {
    const path = join(mkdtempSync(join(tmpdir(), "wcli-lock-")), "data.json");
    new AtomicFileStore().withLock(path, (refresh) => {
      age(`${path}.lock`, 120_000);
      refresh();
      expect(() => acquires(path)).toThrow(/timed out acquiring lock/);
    });
  });

  it("refresh() throws on a lock taken over, before the holder writes", () => {
    const path = join(mkdtempSync(join(tmpdir(), "wcli-lock-")), "data.json");
    const store = new AtomicFileStore();
    const write = vi.fn(() => store.writeJson(path, "first holder"));
    expect(() =>
      store.withLock(path, (refresh) => {
        age(`${path}.lock`, 120_000);
        new AtomicFileStore().withLock(path, () => store.writeJson(path, "second holder"));
        refresh();
        write();
      }),
    ).toThrow(`lock ${path}.lock was taken over by another process; stopped before writing`);
    expect(write).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(path, "utf8"))).toBe("second holder");
  });

  // Each child counts through a read-modify-write and marks the section with an exclusive file.
  const contend = (dir: string, iterations: number, plantDeadLocks: boolean) => {
    const script = `
      import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
      import { AtomicFileStore } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, "index.ts")).href)};
      const dir = ${JSON.stringify(dir)};
      const store = new AtomicFileStore();
      let overlaps = 0;
      for (let i = 0; i < ${iterations}; i++) {
        if (${plantDeadLocks}) {
          try { writeFileSync(dir + "/data.json.lock", "${DEAD_PID}\\nplanted\\n", { flag: "wx" }); } catch {}
        }
        store.withLock(dir + "/data.json", () => {
          let fd;
          try { fd = openSync(dir + "/inside", "wx"); } catch { overlaps++; return; }
          const n = Number(readFileSync(dir + "/counter", "utf8"));
          writeFileSync(dir + "/counter", String(n + 1));
          closeSync(fd);
          unlinkSync(dir + "/inside");
        }, { timeoutMs: 15000 });
      }
      process.stdout.write(String(overlaps));
    `;
    return new Promise<number>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "--eval", script],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("close", (code) =>
        code === 0 ? resolve(Number(out)) : reject(new Error(`child exited ${code}: ${err}`)),
      );
    });
  };

  it.each([
    ["contending for one lock", false],
    ["also racing to take over dead PIDs' locks", true],
  ])("two processes never share the section while %s", async (_name, plantDeadLocks) => {
    const dir = mkdtempSync(join(tmpdir(), "wcli-lock-"));
    writeFileSync(join(dir, "counter"), "0");
    const overlaps = await Promise.all([
      contend(dir, 2000, plantDeadLocks),
      contend(dir, 2000, plantDeadLocks),
    ]);
    expect(overlaps).toEqual([0, 0]);
    expect(readFileSync(join(dir, "counter"), "utf8")).toBe("4000");
  });
});
