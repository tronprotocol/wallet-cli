import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    // standalone build/verify scripts run under Node or Bun, not the CLI's stream ports
    ignores: ["dist/**", "node_modules/**", ".wallet-cli/**", ".private/**", "scripts/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // the CLI renders through the streams port, never straight to the console
      "no-console": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // several renderers and sanitizers match control bytes on purpose, to strip terminal
      // escape-sequence injection out of chain-controlled text (see cli/render/scalars.ts)
      "no-control-regex": "off",
      // `any` sits at the adapter boundary, where TronWeb / Ledger / yargs ship no usable types.
      // tsc is the type authority here; flagging every such cast is noise, not signal.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // golden-output assertions match the CLI's literal column spacing
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
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        Bun: "readonly",
        URL: "readonly",
        console: "readonly",
        setTimeout: "readonly",
      },
    },
    rules: {
      // build and smoke-test scripts are CLI programs; their user-facing output is intentional.
      "no-console": "off",
    },
  },
  // formatting is Prettier's job — must stay last so it can switch stylistic rules off
  prettier,
);
