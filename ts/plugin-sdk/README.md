# @tron-walletcli/plugin-sdk

Types and host bindings for wallet-cli plugins. Not published; build it from `ts/` with
`npm run build:plugin-sdk`, then consume it as a packed tarball (`npm pack ./plugin-sdk`) or a `file:` path.

- `@tron-walletcli/plugin-sdk` and the `/domain`, `/application`, `/cli` and `/http` entries hold the
  type declarations of the plugin API. At run time each entry reads the API object that wallet-cli publishes
  at `globalThis[Symbol.for("wallet-cli.plugin-sdk")]` before it imports a plugin, so a plugin bundles only
  these small modules. Outside wallet-cli they throw.
- `PLUGIN_API_VERSION` and `PLUGIN_API_REVISION` are the numbers this SDK was built for. Put them in the
  plugin definition, and run `wallet-cli-plugin-stamp [package.json]` to write the same numbers into
  `walletCli.plugin` of the package manifest.
- `zod` is a peer dependency for the types only; at run time `z` comes from wallet-cli.

Bundle a plugin into one ES module (`dist/index.mjs`) that inlines this SDK and its other dependencies.

## Credentials

A plugin that needs an API key or another service credential declares the key, in the definition and in the
package manifest, with the same entries:

```ts
const plugin: PluginDefinition = {
  // name, version, apiVersion, apiRevision, groups ...
  credentials: [{ key: "exampleApiKey", summary: "API key of the example service" }],
  register(host) {
    const key = host.services.config.credential("exampleApiKey");
    // ...
  },
};
```

```json
"walletCli": { "plugin": { "credentials": [{ "key": "exampleApiKey", "summary": "API key of the example service" }] } }
```

- A key is a top-level key of `config.yaml`: one word of letters and digits that starts with a lower-case
  letter, at most 64 characters. A key that wallet-cli reads itself (`defaultNetwork`, `defaultOutput`,
  `timeoutMs`, `pluginRegistry`, `networks`, `aliases`, `price`, the TronLink keys) is refused at install.
  The summary is one line; `wallet-cli config --help` shows it.
- The definition and the manifest must declare the same keys with the same summaries, in the same order, or
  the plugin is not loaded.
- `config.credential(key)` returns the configured value, or `undefined` when the user has not set it. It
  throws for a key the plugin did not declare. Declare every key your code reads, including keys read by
  code you bundle from another plugin.
- Several plugins may declare the same key; they then read the same value.
- wallet-cli owns the handling: the user sets the value with
  `printf '%s\n' "$KEY" | wallet-cli config exampleApiKey --api-key-stdin`, never on the command line or
  from an environment variable; it is masked in everything wallet-cli writes, including what your commands
  return and log through the host; and a `config.yaml` that holds it must have mode `0600`. Writing it to
  the process streams yourself bypasses the masking.

## Testing a plugin

`@tron-walletcli/plugin-sdk/testing` publishes the real plugin API in a test process and exports the core
pieces that plugin tests construct (pipeline, signing service, broadcast guard and others). It inlines its
own copy of the core, so it is for tests only:

- It resolves only under the `wallet-cli-testing` export condition. A test runner opts in, for example in
  Vitest:

  ```ts
  import { defaultServerConditions } from "vite";
  import { defineConfig } from "vitest/config";

  export default defineConfig({
    ssr: { resolve: { conditions: ["wallet-cli-testing", ...defaultServerConditions] } },
    // test/setup.ts holds: import "@tron-walletcli/plugin-sdk/testing";
    test: { setupFiles: ["test/setup.ts"] },
  });
  ```

  Node takes `--conditions=wallet-cli-testing`. Without the condition, Node and bundlers cannot resolve it.
  Its type declarations resolve without the condition, so test files type-check.
- A plugin bundle must not include it. Its dry-run guard and signing service would be a second copy, not
  the host's. Make the production build refuse the import. Inside wallet-cli, where the host has published
  its API object, the module throws when it is loaded.
