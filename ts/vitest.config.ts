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
        },
      },
      {
        // Golden tests spawn a fresh `tsx src/index.ts` per case, which cold-transpiles the
        // whole CLI import graph each time. Under parallel CPU load a single spawn can take far
        // longer than vitest's default 5s testTimeout, causing intermittent timeout failures.
        // Give this suite generous timeouts so transient slowness doesn't flake the run.
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
