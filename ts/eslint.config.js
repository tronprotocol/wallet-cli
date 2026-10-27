import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    // Build scripts use Node/Bun streams directly.
    ignores: ["dist/**", "node_modules/**", ".wallet-cli/**", ".private/**", "scripts/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
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
