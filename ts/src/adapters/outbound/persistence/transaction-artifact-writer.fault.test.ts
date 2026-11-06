import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SecureTransactionArtifactWriter } from "./transaction-artifact-writer.js";

const state = vi.hoisted(() => ({ fault: "" }));

vi.mock("node:fs", async (original) => {
  const real = await original<typeof import("node:fs")>();
  return {
    ...real,
    writeFileSync: (...args: Parameters<typeof real.writeFileSync>) => {
      if (state.fault.startsWith("write")) {
        real.writeSync(args[0] as number, "partial");
        throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
      }
      return real.writeFileSync(...args);
    },
    fsyncSync: (fd: number) => {
      if (state.fault === "fsync") throw Object.assign(new Error("sync failed"), { code: "EIO" });
      return real.fsyncSync(fd);
    },
    closeSync: (fd: number) => {
      real.closeSync(fd);
      if (state.fault.endsWith("close")) {
        state.fault = "";
        throw Object.assign(new Error("close failed"), { code: "EIO" });
      }
    },
  };
});

const dirs: string[] = [];
afterEach(() => {
  state.fault = "";
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("SecureTransactionArtifactWriter failures", () => {
  it.each(["write", "fsync", "close", "write+close"])(
    "removes the output and reports io_error on a %s failure",
    (fault) => {
      const dir = fs.mkdtempSync(join(tmpdir(), "wallet-cli-tx-fault-"));
      dirs.push(dir);
      const path = join(dir, "signed.hex");
      state.fault = fault;
      expect(() => new SecureTransactionArtifactWriter().write(path, "abcd")).toThrowError(
        expect.objectContaining({ code: "io_error" }),
      );
      expect(fs.existsSync(path)).toBe(false);
    },
  );
});
