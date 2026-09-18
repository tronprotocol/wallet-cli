import { afterEach, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const homes: string[] = [];
const pids: number[] = [];
afterEach(async () => {
  for (const pid of pids.splice(0)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already stopped */
    }
  }
  for (const path of homes.splice(0)) await rm(path, { recursive: true, force: true });
});

it("detaches only after readiness, keeps serving, and closes its listener on SIGTERM", async () => {
  const home = await mkdtemp(join(tmpdir(), "wallet-daemon-test-"));
  homes.push(home);
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  const executable = process.env.WALLET_CLI_TEST_EXECUTABLE;
  const entry = executable
    ? []
    : process.env.WALLET_CLI_TEST_ENTRY
      ? [process.env.WALLET_CLI_TEST_ENTRY]
      : ["--import", "tsx", join(process.cwd(), "src/index.ts")];
  const parent = spawn(
    executable ?? process.execPath,
    [
      ...entry,
      "x402",
      "serve",
      "--network",
      "base-sepolia",
      "--pay-to",
      "0x1111111111111111111111111111111111111111",
      "--token",
      "USDC",
      "--raw-amount",
      "1000000",
      "--port",
      String(port),
      "--daemon",
      "-o",
      "json",
    ],
    {
      env: { ...process.env, WALLET_CLI_HOME: home },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "",
    stderr = "";
  parent.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  parent.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    const guard = setTimeout(() => {
      parent.kill("SIGKILL");
      reject(new Error("daemon parent did not exit"));
    }, 20000);
    parent.once("error", (error) => {
      clearTimeout(guard);
      reject(error);
    });
    parent.once("close", (code) => {
      clearTimeout(guard);
      resolve(code);
    });
  });
  expect(code, stderr || stdout).toBe(0);
  const result = JSON.parse(stdout);
  const { pid, logFile, payUrl } = result.data;
  pids.push(pid);
  homes.push(dirname(logFile));
  expect(result).toMatchObject({ success: true, data: { daemon: true, rawAmount: "1000000" } });
  const healthUrl = new URL("/health", payUrl);
  expect((await fetch(healthUrl)).status).toBe(200);
  expect((await stat(logFile)).mode & 0o777).toBe(0o600);
  await expect.poll(async () => readFile(logFile, "utf8")).toContain('"route":"/health"');
  process.kill(pid, "SIGTERM");
  await expect
    .poll(async () => {
      try {
        await fetch(healthUrl, { signal: AbortSignal.timeout(200) });
        return false;
      } catch {
        return true;
      }
    })
    .toBe(true);
});
