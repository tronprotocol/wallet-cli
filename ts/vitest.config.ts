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
          include: ["src/**/*.test.ts"],
          testTimeout: 20_000,
          hookTimeout: 20_000,
        },
      },
      {
        // Each golden invocation stays a separate process. Keep the test timeout above
        // its 25s subprocess guard so a hung command fails with subprocess diagnostics.
        test: {
          name: "golden",
          // Each worker also starts a full CLI process; cap CPU/memory contention from SDK
          // loading and real scrypt rather than multiplying it by every available core.
          maxWorkers: Math.min(4, availableParallelism()),
          // Vitest refuses to run two projects with different maxWorkers in one group, so `npm test`
          // runs golden as a second group, after unit, under its own worker cap.
          sequence: { groupOrder: 1 },
          environment: "node",
          include: ["test/**/*.test.ts"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          // Build once, then every case spawns `node dist/index.js` instead of cold-transpiling
          // the whole CLI through tsx. `verify:package` sets WALLET_CLI_TEST_ENTRY to the
          // independently installed package and must keep testing that, not dist.
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
