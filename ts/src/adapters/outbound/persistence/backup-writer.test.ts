import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SecureBackupWriter } from "./backup-writer.js";

function freshRoot() {
  return mkdtempSync(join(tmpdir(), "bw-"));
}

describe("SecureBackupWriter", () => {
  let root: string;
  let writer: SecureBackupWriter;
  beforeEach(() => {
    root = freshRoot();
    writer = new SecureBackupWriter(root, () => 1_700_000_000_000);
  });

  it("writes the payload with 0600 perms and reports the path/size", () => {
    const res = writer.write("acct-1", undefined, { secret: "hunter2" });
    expect(res.out).toBe(join(root, "backups", "acct-1-1700000000000.json"));
    expect(res.fileMode).toBe("0600");
    const onDisk = readFileSync(res.out, "utf8");
    expect(JSON.parse(onDisk)).toEqual({ secret: "hunter2" });
    expect(res.bytes).toBe(Buffer.byteLength(onDisk));
    expect(statSync(res.out).mode & 0o777).toBe(0o600);
  });

  it("refuses to overwrite an existing regular file (output_exists)", () => {
    const target = join(root, "existing.json");
    writeFileSync(target, "keep-me");
    let err: { code?: string } | undefined;
    try {
      writer.write("acct-1", target, { secret: "x" });
    } catch (e) {
      err = e as { code?: string };
    }
    expect(err?.code).toBe("output_exists");
    // original file untouched
    expect(readFileSync(target, "utf8")).toBe("keep-me");
  });

  it("does not follow a symlink at the target path (exclusive create fails)", () => {
    // A symlink pointing at a sensitive file the backup must never clobber.
    const sensitive = join(root, "sensitive.txt");
    writeFileSync(sensitive, "DO-NOT-OVERWRITE");
    const link = join(root, "link.json");
    symlinkSync(sensitive, link);

    // `wx` (O_CREAT|O_EXCL) refuses to write through the symlink — it throws rather than
    // following it. The sensitive target must be left exactly as it was.
    expect(() => writer.write("acct-1", link, { secret: "x" })).toThrow();
    expect(readFileSync(sensitive, "utf8")).toBe("DO-NOT-OVERWRITE");
  });

  it("does not follow a dangling symlink at the target path", () => {
    const link = join(root, "dangling.json");
    symlinkSync(join(root, "nonexistent-target"), link);
    expect(() => writer.write("acct-1", link, { secret: "x" })).toThrow();
    // the symlink was not resolved into a real file
    expect(existsSync(join(root, "nonexistent-target"))).toBe(false);
  });
});
