import { defineConfig } from "vitest/config";

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
        // Golden tests spawn a fresh `node --import tsx src/index.ts` per case, which cold-transpiles the
        // whole CLI import graph each time. Under parallel CPU load a single spawn can take far
        // longer than vitest's default 5s testTimeout, causing intermittent timeout failures.
        // 30s covers the heaviest case (~4s on a 10-core dev box) on CI's 2-core runner, where the
        // same case has been measured past 15s. Keep this suite above the child-process guard so
        // hangs fail with subprocess details.
        test: {
          name: "golden",
          environment: "node",
          include: ["test/**/*.test.ts"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
