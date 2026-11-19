import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import type { DetachedCli } from "../../../application/ports/cli-launcher.js";
import { ProcessCliLauncher } from "./index.js";

const directory = mkdtempSync(join(tmpdir(), "cli-launcher-test-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function firstMessage(child: DetachedCli) {
  return new Promise((resolve, reject) => {
    child.on("message", resolve);
    child.once("exit", () => reject(new Error("child exited first")));
  });
}

function exited(child: DetachedCli) {
  return new Promise<void>((resolve) => child.once("exit", resolve));
}

// The test process stands in for the CLI: `process.argv[1]` is the Node script it would run again.
it("runs the entry script again with the arguments, the environment, stderr and IPC", async () => {
  const log = join(directory, "stderr.txt");
  const fd = openSync(log, "w");
  const script = join(directory, "child.cjs");
  writeFileSync(
    script,
    'process.stderr.write("to the log");process.send({ argv: process.argv.slice(2), marker: process.env.MARKER });process.disconnect();',
  );
  const entry = process.argv[1]!;
  process.argv[1] = script;
  let child: DetachedCli;
  try {
    child = new ProcessCliLauncher(() => false).startDetached({
      argv: ["serve", "--port", "a b"],
      env: { ...process.env, MARKER: "1" },
      stderr: fd,
    });
  } finally {
    process.argv[1] = entry;
    closeSync(fd);
  }
  const done = exited(child);
  expect(await firstMessage(child)).toEqual({ argv: ["serve", "--port", "a b"], marker: "1" });
  await done;
  expect(readFileSync(log, "utf8")).toBe("to the log");
});
