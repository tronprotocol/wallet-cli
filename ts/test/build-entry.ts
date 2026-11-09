import { execFileSync } from "node:child_process";

// Build once so golden tests cannot use stale output.
export default function setup(): void {
  // Package verification supplies its own installed artifact.
  if (process.env.WALLET_CLI_TEST_ENTRY) return;
  execFileSync("npx", ["tsup"], { cwd: process.cwd(), stdio: "inherit", timeout: 120_000 });
}
