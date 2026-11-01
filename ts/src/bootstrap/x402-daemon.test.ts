import { fork, type ChildProcess } from "node:child_process";
import { mkdtempSync, openSync, closeSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { CommandDeadline } from "../application/services/command-deadline.js";
import { daemonChildTimeoutMs, startX402Daemon } from "./x402-daemon.js";

const directory = mkdtempSync(join(tmpdir(), "x402-daemon-test-"));
// Child modes: "ready" reports at once with its propagated duration, "exit" dies, "silent" never
// reports, "late" reports after 300 ms.
const script = join(directory, "child.cjs");
writeFileSync(
  script,
  `const mode = process.argv[2];
const report = () => process.send({ x402Ready: { payUrl: process.env.WALLET_CLI_X402_DAEMON_TIMEOUT_MS } });
process.on("SIGTERM", () => process.exit(0));
if (mode === "exit") process.exit(3);
if (mode === "ready") report();
if (mode === "late") setTimeout(report, 300);
setInterval(() => {}, 1000);
`,
);
const children: ChildProcess[] = [];

afterEach(() => {
  for (const child of children.splice(0)) if (child.exitCode === null) child.kill("SIGKILL");
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function launcher(mode: string) {
  return (options: object) => {
    const child = fork(script, [mode], options);
    children.push(child);
    return child;
  };
}

async function log() {
  const path = join(directory, `log-${children.length}-${Math.random()}.txt`);
  const fd = openSync(path, "wx", 0o600);
  return { path, fd, close: async () => closeSync(fd) };
}

function exited(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once("exit", () => resolve()));
}

it("announces a child that reports ready and hands it the resolved duration", async () => {
  const startup = new CommandDeadline(5000);
  const handle = await startX402Daemon(log, startup, 5000, launcher("ready"));
  startup.dispose();
  expect(handle.details).toMatchObject({ payUrl: "5000", daemon: true, pid: children[0]!.pid });
  await handle.close();
  await exited(children[0]!);
});

it("reports a child that exits before it is ready", async () => {
  const startup = new CommandDeadline(5000);
  await expect(startX402Daemon(log, startup, 5000, launcher("exit"))).rejects.toMatchObject({
    code: "provider_error",
    details: { logFile: expect.any(String) },
  });
  startup.dispose();
});

it("stops a child that is not ready within the start-up deadline", async () => {
  const startup = new CommandDeadline(200);
  await expect(startX402Daemon(log, startup, 200, launcher("silent"))).rejects.toMatchObject({
    code: "timeout",
    details: { logFile: expect.any(String) },
  });
  await exited(children[0]!);
  expect(children[0]!.exitCode !== null || children[0]!.signalCode !== null).toBe(true);
});

it("stops a child whose ready report arrives after expiry, before the timer fires", async () => {
  let now = 0;
  const startup = new CommandDeadline(1000, 0, { now: () => now });
  const pending = startX402Daemon(log, startup, 1000, launcher("late"));
  now = 1001;
  await expect(pending).rejects.toMatchObject({ code: "timeout" });
  startup.dispose();
  await exited(children[0]!);
});

it("starts no child once the start-up deadline has run out", async () => {
  const startup = new CommandDeadline(1);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const launch = vi.fn(launcher("ready"));
  await expect(startX402Daemon(log, startup, 1, launch)).rejects.toMatchObject({
    code: "timeout",
  });
  expect(launch).not.toHaveBeenCalled();
});

it("reads the propagated duration only in a daemon child", () => {
  vi.stubEnv("WALLET_CLI_X402_DAEMON_TIMEOUT_MS", "45000");
  vi.stubEnv("WALLET_CLI_X402_DAEMON_CHILD", "");
  expect(daemonChildTimeoutMs()).toBeUndefined();
  vi.stubEnv("WALLET_CLI_X402_DAEMON_CHILD", "1");
  expect(daemonChildTimeoutMs()).toBe(45000);
  vi.stubEnv("WALLET_CLI_X402_DAEMON_TIMEOUT_MS", "1e3");
  expect(daemonChildTimeoutMs()).toBeUndefined();
  vi.unstubAllEnvs();
});
