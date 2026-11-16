# @tron-walletcli/plugin-sdk

Types and host bindings for wallet-cli plugins. Not published; build it from `ts/` with
`npm run build:plugin-sdk`, then consume it as a packed tarball (`npm pack ./plugin-sdk`) or a `file:` path.

- `@tron-walletcli/plugin-sdk` and the `/domain`, `/application`, `/cli` and `/http` entries hold the
  type declarations of the plugin API. At run time each entry reads the API object that wallet-cli publishes
  at `globalThis[Symbol.for("wallet-cli.plugin-api")]` before it imports a plugin, so a plugin bundles only
  these small modules. Outside wallet-cli they throw.
- `PLUGIN_API_VERSION` and `PLUGIN_API_REVISION` are the numbers this SDK was built for. Put them in the
  plugin definition, and run `wallet-cli-plugin-stamp [package.json]` to write the same numbers into
  `walletCli.plugin` of the package manifest.
- `zod` is a peer dependency for the types only; at run time `z` comes from wallet-cli.

Bundle a plugin into one ES module (`dist/index.mjs`) that inlines this SDK and its other dependencies.
