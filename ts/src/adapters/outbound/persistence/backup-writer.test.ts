import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  statSync,
  symlinkSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SecureBackupWriter } from "./backup-writer.js";

function freshRoot() {
  return mkdtempSync(join(tmpdir(), "bw-"));
}

describe("SecureBackupWriter", () => {
  let root: string;
  let writer: SecureBackupWriter;
  let cwd: string;
  beforeEach(() => {
    root = freshRoot();
    writer = new SecureBackupWriter(() => 1_700_000_000_000);
    cwd = process.cwd();
  });
  afterEach(() => {
    process.chdir(cwd);
  });

  it("writes the payload with 0600 perms and reports the path/size", () => {
    const res = writer.write("acct-1", join(root, "acct-1.json"), { secret: "hunter2" });
    expect(res.fileMode).toBe("0600");
    const onDisk = readFileSync(res.out, "utf8");
    expect(JSON.parse(onDisk)).toEqual({ secret: "hunter2" });
    expect(res.bytes).toBe(Buffer.byteLength(onDisk));
    expect(statSync(res.out).mode & 0o777).toBe(0o600);
  });

  it("defaults to <accountId>-<ms>.json in the CURRENT DIRECTORY, not the wallet root", () => {
    process.chdir(root);
    const res = writer.write("acct-1", undefined, { secret: "hunter2" });
    expect(res.out).toBe(join(realpathSync(root), "acct-1-1700000000000.json"));
    expect(existsSync(res.out)).toBe(true);
  });

  it("defaults keystore exports to the .keystore.json suffix, same directory rule", () => {
    process.chdir(root);
    const res = writer.write("acct-1", undefined, { version: 3 }, "keystore");
    expect(res.out).toBe(join(realpathSync(root), "acct-1-1700000000000.keystore.json"));
  });

  it("uses an explicit --out path verbatim regardless of format", () => {
    const target = join(root, "chosen-name.txt");
    expect(writer.write("acct-1", target, { version: 3 }, "keystore").out).toBe(target);
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

  it.runIf(process.platform !== "win32")(
    "maps an unusable parent path to io_error without creating an artifact",
    () => {
      const target = "/dev/null/account.backup";

      expect(() => writer.write("acct-1", target, { secret: "x" })).toThrowError(
        expect.objectContaining({ code: "io_error" }),
      );
      expect(existsSync(target)).toBe(false);
    },
  );
});
