import { defineConfig } from "vitest/config";
import { join } from "node:path";
import { availableParallelism } from "node:os";

export default defineConfig({
  test: {
    environment: "node",
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          // Leave one CPU for the coordinator/OS.
          maxWorkers: Math.min(10, Math.max(1, availableParallelism() - 1)),
          include: ["src/**/*.test.ts"],
          testTimeout: 20_000,
          hookTimeout: 20_000,
        },
      },
      {
        // Keep the test timeout above the 25s subprocess guard for diagnostics.
        test: {
          name: "golden",
          // Each worker spawns a CLI process with SDK loading and real scrypt.
          maxWorkers: Math.min(4, availableParallelism()),
          // Vitest requires separate groups for different worker caps.
          sequence: { groupOrder: 1 },
          environment: "node",
          include: ["test/**/*.test.ts"],
          // Allow repeated CLI startup and real scrypt on busy CI runners.
          testTimeout: 60_000,
          hookTimeout: 30_000,
          // Preserve the installed-package entry supplied by verify:package.
          globalSetup: ["./test/build-entry.ts"],
          env: {
            WALLET_CLI_TEST_ENTRY:
              process.env.WALLET_CLI_TEST_ENTRY ?? join(process.cwd(), "dist", "index.js"),
          },
        },
      },
    ],
  },
});
