import { execFileSync } from "node:child_process";

/** Golden tests run the built CLI; build it once here so a stale dist never gets tested. */
export default function setup(): void {
  // Package verification supplies its own independently installed artifact.
  if (process.env.WALLET_CLI_TEST_ENTRY) return;
  execFileSync("npx", ["tsup"], { cwd: process.cwd(), stdio: "inherit", timeout: 120_000 });
}
