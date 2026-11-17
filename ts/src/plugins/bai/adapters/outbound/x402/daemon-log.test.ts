import { afterEach, expect, it } from "vitest";
import { writeSync } from "node:fs";
import { readFile, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { createX402DaemonLog } from "./daemon-log.js";

const created: string[] = [];
afterEach(async () => {
  for (const path of created.splice(0)) await rm(dirname(path), { recursive: true, force: true });
});

it("creates a private log in a new temp directory and leaves its descriptor writable", async () => {
  const log = await createX402DaemonLog();
  created.push(log.path);
  expect(log.path.startsWith(tmpdir())).toBe(true);
  expect((await stat(log.path)).mode & 0o777).toBe(0o600);
  writeSync(log.fd, "line\n");
  await log.close();
  expect(await readFile(log.path, "utf8")).toBe("line\n");
});

it("never reuses a directory", async () => {
  const first = await createX402DaemonLog();
  const second = await createX402DaemonLog();
  created.push(first.path, second.path);
  expect(dirname(first.path)).not.toBe(dirname(second.path));
  await Promise.all([first.close(), second.close()]);
});
