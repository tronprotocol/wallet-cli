import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import closedPortTypes from "./eslint-rules/closed-port-types.mjs";
import environmentReads from "./eslint-rules/environment-reads.mjs";

export default tseslint.config(
  {
    // Build scripts use Node/Bun streams directly.
    ignores: ["dist/**", "node_modules/**", ".wallet-cli/**", ".private/**", "scripts/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    ignores: ["src/adapters/inbound/**", "**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...["http", "https", "http2", "net", "tls"].flatMap((module) =>
              [module, `node:${module}`].map((name) => ({
                name,
                importNames:
                  module === "http2"
                    ? ["createServer", "createSecureServer", "Server"]
                    : ["createServer", "Server"],
                allowTypeImports: true,
                message: "Import server capabilities only in adapters/inbound.",
              })),
            ),
            {
              name: "ws",
              importNames: ["WebSocketServer", "Server"],
              allowTypeImports: true,
              message: "Import server capabilities only in adapters/inbound.",
            },
          ],
        },
      ],
    },
  },
  {
    plugins: {
      "wallet-cli": {
        rules: { "closed-port-types": closedPortTypes, "environment-reads": environmentReads },
      },
    },
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: { "wallet-cli/environment-reads": "error" },
  },
  {
    files: [
      "src/application/ports/**/*.ts",
      "src/application/contracts/**/*.ts",
      "src/domain/types/**/*.ts",
    ],
    ignores: ["**/*.test.ts"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: { "wallet-cli/closed-port-types": "error" },
  },
  {
    files: [
      "src/bootstrap/**",
      "src/adapters/inbound/cli/input/prompt/index.ts",
      "src/adapters/inbound/cli/help/index.ts",
      "src/adapters/outbound/config/index.ts",
      "src/adapters/outbound/ledger/index.ts",
    ],
    rules: { "wallet-cli/environment-reads": "off" },
  },
  {
    rules: {
      // CLI output must use the streams port.
      "no-console": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // Sanitizers match control bytes to prevent terminal injection.
      "no-control-regex": "off",
      // SDK boundaries require casts where upstream types are incomplete.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Output assertions match literal column spacing.
    files: ["**/*.test.ts", "test/**/*.ts"],
    rules: {
      "no-regex-spaces": "off",
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "writable", require: "readonly", __dirname: "readonly" },
    },
  },
  // Keep last to disable conflicting formatting rules.
  prettier,
);
