/**
 * Enforced dependency direction:
 *
 *   bootstrap (composition) -> inbound/outbound adapters -> application -> domain
 *                                  inbound adapters -> application -> domain
 *
 * Inbound and outbound adapters are peers. They may meet only in bootstrap/composition.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readdirSync } = require("node:fs");

const SDK_PACKAGES = "(tronweb|ethers)(/|$)|@(bankofai|ledgerhq)/";
const HTTP_CLIENT_PACKAGES = "(axios|undici|node-fetch|got|ky)(/|$)";

// Only a missing directory means "no integrations"; any other error would silently drop rules.
const directories = (path) => {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
};

// Listed from the cruised tree so each name is regex-escaped; a `$1` capture would be inserted unescaped.
const OUTBOUND_INTEGRATIONS = [
  ...directories("src/adapters/outbound/chain").map((family) => `chain/${family}`),
  ...directories("src/adapters/outbound").filter((name) => name !== "chain"),
];

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Built-in plugins and, per plugin, its outbound integrations.
const PLUGINS = directories("src/plugins");
const PLUGIN_INTEGRATIONS = PLUGINS.flatMap((plugin) =>
  directories(`src/plugins/${plugin}/adapters/outbound`).map((integration) => ({
    plugin,
    integration,
  })),
);
// A core layer directory, or the same directory inside a plugin.
const layer = (directory) => `^src/(${directory}|plugins/[^/]+/${directory})`;
// A plugin's index.ts and api.ts play the role of bootstrap.
const PLUGIN_ROOT = "^src/plugins/[^/]+/[^/]+$";
// The plugin-api entries each plugin layer may import (rule 9.2).
const PLUGIN_LAYER_ENTRIES = {
  domain: ["domain"],
  application: ["domain", "application"],
  "adapters/inbound": ["domain", "application", "cli"],
  "adapters/outbound": ["domain", "application", "http"],
};

// Export-map subpaths of the modules that sign, send, or settle. Each pattern matches the bare
// specifier and the file it resolves to, since depcruise reports whichever it ends up with.
const LEDGER_SIGNING_MODULES = {
  "hw-app-trx": ["Trx", "TIP712"],
  "hw-app-eth": ["Eth", "modules/EIP712"],
};
const X402_PAYMENT_MODULES = {
  "x402-core": ["client", "facilitator"],
  "x402-evm": [
    "exact/client",
    "exact/facilitator",
    "exact/v1/client",
    "exact/v1/facilitator",
    "upto/client",
    "upto/facilitator",
    "batch-settlement/client",
    "batch-settlement/server",
    "batch-settlement/facilitator",
    "auth-capture/client",
    "adapters/agent-wallet",
  ],
  "x402-tron": [
    "exact",
    "exact/client",
    "exact/facilitator",
    "upto",
    "upto/client",
    "upto/facilitator",
    "gasfree/client",
    "gasfree/facilitator",
    "batch-settlement/client",
    "batch-settlement/server",
    "batch-settlement/facilitator",
  ],
};
const LEDGER_SIGNING_PATTERN = Object.entries(LEDGER_SIGNING_MODULES)
  .map(([app, modules]) => `${app}($|/(lib/|lib-es/|)(${modules.join("|")})(/index|)(\\.js|)$)`)
  .join("|");
const X402_PAYMENT_PATTERN = [
  "x402-fetch($|/dist/(esm|cjs)/index\\.(mjs|js)$)",
  ...Object.entries(X402_PAYMENT_MODULES).map(
    ([pkg, modules]) => `${pkg}/(dist/(esm|cjs)/|)(${modules.join("|")})(/index|)(\\.(mjs|js)|)$`,
  ),
].join("|");

module.exports = {
  forbidden: [
    {
      name: "ports-are-innermost",
      severity: "error",
      from: { path: `${layer("application")}/(ports|contracts)/`, pathNot: "\\.test\\.ts$" },
      to: {
        path: `${layer("application")}/`,
        pathNot: `${layer("application")}/(ports|contracts)/`,
      },
    },
    {
      name: "application-imports-no-use-case",
      severity: "error",
      comment:
        "a use case is a *-service.ts module under application/use-cases; nothing in application imports one",
      from: { path: `${layer("application")}/`, pathNot: "\\.test\\.ts$" },
      to: { path: `${layer("application")}/use-cases/.*[^/]-service\\.ts$` },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "domain-is-independent",
      severity: "error",
      from: { path: `${layer("domain")}/` },
      to: {
        path: [
          "^src/(application|adapters|bootstrap)/",
          "^src/plugins/[^/]+/(application|adapters)/",
          PLUGIN_ROOT,
        ],
      },
    },
    {
      name: "application-owns-ports",
      severity: "error",
      comment: "production application code depends on domain and its own ports, never adapters",
      from: { path: `${layer("application")}/`, pathNot: "\\.test\\.ts$" },
      to: { path: ["^src/(adapters|bootstrap)/", "^src/plugins/[^/]+/adapters/", PLUGIN_ROOT] },
    },
    {
      name: "inbound-does-not-know-outbound",
      severity: "error",
      comment:
        "CLI adapters call application ports/use-cases; bootstrap/composition supplies outbound implementations",
      from: { path: `${layer("adapters")}/inbound/`, pathNot: "\\.test\\.ts$" },
      to: {
        path: [
          "^src/(adapters/outbound|bootstrap)/",
          "^src/plugins/[^/]+/adapters/outbound/",
          PLUGIN_ROOT,
        ],
      },
    },
    {
      name: "outbound-does-not-know-inbound",
      severity: "error",
      from: { path: `${layer("adapters")}/outbound/`, pathNot: "\\.test\\.ts$" },
      to: {
        path: [
          "^src/(adapters/inbound|bootstrap)/",
          "^src/plugins/[^/]+/adapters/inbound/",
          PLUGIN_ROOT,
        ],
      },
    },
    {
      name: "outbound-imports-no-service-or-use-case",
      severity: "error",
      comment:
        "outbound adapters import application ports and contracts, never services or use cases",
      from: { path: `${layer("adapters")}/outbound/`, pathNot: "\\.test\\.ts$" },
      to: { path: `${layer("application")}/(services|use-cases)/` },
    },
    {
      name: "domain-and-application-use-allowlisted-packages",
      severity: "error",
      comment:
        "domain and application import outside packages only from @noble/*, @scure/*, and node:crypto",
      from: { path: `${layer("(domain|application)")}/`, pathNot: "\\.test\\.ts$" },
      // Node core modules resolve without the `node:` prefix.
      to: { pathNot: "^(src/|crypto$)|(^|node_modules/)@(noble|scure)/" },
    },
    {
      name: "sdks-and-http-clients-only-in-outbound",
      severity: "error",
      comment:
        "chain, device, and protocol SDKs and HTTP clients are imported only in adapters/outbound",
      from: { path: "^src/", pathNot: `${layer("adapters")}/outbound/|\\.test\\.ts$` },
      to: { path: `(^|node_modules/)(${SDK_PACKAGES}|${HTTP_CLIENT_PACKAGES})` },
    },
    ...PLUGIN_INTEGRATIONS.map(({ plugin, integration }) => ({
      name: "integrations-do-not-import-each-other",
      severity: "error",
      comment: "within a plugin's outbound, an integration imports only itself",
      from: {
        path: `^src/plugins/${escapeRegExp(plugin)}/adapters/outbound/${escapeRegExp(integration)}/`,
        pathNot: "\\.test\\.ts$",
      },
      to: {
        path: `^src/plugins/${escapeRegExp(plugin)}/adapters/outbound/`,
        pathNot: `^src/plugins/${escapeRegExp(plugin)}/adapters/outbound/${escapeRegExp(integration)}/`,
      },
    })),
    ...OUTBOUND_INTEGRATIONS.map((integration) => ({
      name: "integrations-do-not-import-each-other",
      severity: "error",
      comment:
        "within outbound, an integration imports only itself and the shared http/ and persistence/ plumbing",
      from: {
        path: `^src/adapters/outbound/${escapeRegExp(integration)}/`,
        pathNot: "\\.test\\.ts$",
      },
      to: {
        path: "^src/adapters/outbound/",
        pathNot: `^src/adapters/outbound/(${escapeRegExp(integration)}|http|persistence)/`,
      },
    })),
    {
      name: "sdks-only-inside-integrations",
      severity: "error",
      comment:
        "outbound modules outside an integration, and the shared http/ and persistence/ plumbing, import no SDK",
      from: {
        path: [
          "^src/adapters/outbound/((chain/)?[^/]+$|(http|persistence)/)",
          "^src/plugins/[^/]+/adapters/outbound/[^/]+$",
        ],
        pathNot: "\\.test\\.ts$",
      },
      to: { path: `(^|node_modules/)(${SDK_PACKAGES})` },
    },
    {
      name: "outbound-modules-outside-integrations-import-only-plumbing",
      severity: "error",
      comment:
        "a module directly in adapters/outbound/ or chain/ belongs to no integration; within outbound it imports only http/ and persistence/",
      from: { path: "^src/adapters/outbound/(chain/)?[^/]+$", pathNot: "\\.test\\.ts$" },
      to: {
        path: "^src/adapters/outbound/",
        pathNot: "^src/adapters/outbound/(http|persistence)/",
      },
    },
    {
      name: "plugin-outbound-modules-outside-integrations-import-no-integration",
      severity: "error",
      comment:
        "a module directly in a plugin's adapters/outbound/ imports none of its integrations",
      from: { path: "^src/plugins/[^/]+/adapters/outbound/[^/]+$", pathNot: "\\.test\\.ts$" },
      to: { path: "^src/plugins/[^/]+/adapters/outbound/[^/]+/" },
    },
    {
      name: "core-does-not-import-plugins",
      severity: "error",
      comment: "only bootstrap/plugins/builtin.ts, the list of built-in plugins, imports plugins/",
      from: {
        path: "^src/",
        pathNot: "^src/plugins/|^src/bootstrap/plugins/builtin\\.ts$|\\.test\\.ts$",
      },
      to: { path: "^src/plugins/" },
    },
    {
      name: "plugins-reach-the-core-only-through-plugin-api",
      severity: "error",
      comment: "a plugin imports the core only through plugin-api",
      from: { path: "^src/plugins/", pathNot: "\\.test\\.ts$" },
      to: { path: "^src/", pathNot: "^src/(plugins|plugin-api)/" },
    },
    ...PLUGINS.map((plugin) => ({
      name: "plugins-import-only-their-own-directory",
      severity: "error",
      comment: "a built-in plugin imports another built-in plugin only through its api.ts",
      from: { path: `^src/plugins/${escapeRegExp(plugin)}/`, pathNot: "\\.test\\.ts$" },
      to: {
        path: "^src/plugins/",
        pathNot: `^src/plugins/(${escapeRegExp(plugin)}/|[^/]+/api\\.ts$)`,
      },
    })),
    ...Object.entries(PLUGIN_LAYER_ENTRIES).map(([layer, entries]) => ({
      name: "plugin-layers-import-only-their-api-entries",
      severity: "error",
      comment:
        "each plugin layer imports only its plugin-api entries; index.ts may import all of them",
      from: { path: `^src/plugins/[^/]+/${layer}/`, pathNot: "\\.test\\.ts$" },
      to: { path: "^src/plugin-api/", pathNot: `^src/plugin-api/(${entries.join("|")})\\.ts$` },
    })),
    {
      name: "plugin-roots-import-only-api-entries",
      severity: "error",
      comment: "a plugin's index.ts and api.ts import plugin-api only through its five entries",
      from: { path: PLUGIN_ROOT, pathNot: "\\.test\\.ts$" },
      to: {
        path: "^src/plugin-api/",
        pathNot: "^src/plugin-api/(index|domain|application|cli|http)\\.ts$",
      },
    },
    {
      name: "ledger-apps-only-in-ledger-wrapper",
      severity: "error",
      comment: "the Ledger app modules that sign; only the ledger wrapper imports them",
      from: { path: "^src/", pathNot: "^src/adapters/outbound/ledger/index\\.ts$" },
      to: { path: `(^|node_modules/)@ledgerhq/(${LEDGER_SIGNING_PATTERN})` },
    },
    {
      name: "erc8004-sdk-only-in-registry-wrapper",
      severity: "error",
      comment: "the ERC-8004 SDK client can send; only the registry wrapper imports it at runtime",
      from: {
        path: "^src/",
        pathNot: [
          "^src/adapters/outbound/erc8004/sdk-registry\\.ts$",
          "^src/plugins/erc8004/adapters/outbound/erc8004/sdk-registry\\.ts$",
        ],
      },
      to: {
        path: "(^|node_modules/)@bankofai/8004-sdk(/|$)",
        dependencyTypesNot: ["type-only", "type-import"],
      },
    },
    {
      name: "x402-payment-modules-only-in-payment-client",
      severity: "error",
      comment:
        "the x402 modules that sign, send, or settle payments; only the payment client imports them",
      from: {
        path: "^src/",
        pathNot: [
          "^src/adapters/outbound/x402/payment-client\\.ts$",
          "^src/plugins/x402/adapters/outbound/x402/payment-client\\.ts$",
        ],
      },
      to: { path: `(^|node_modules/)@bankofai/(${X402_PAYMENT_PATTERN})` },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: { extensions: [".ts", ".js"] },
    // `import type` is erased at build time, so without this the rules above only see the graph
    // that survives compilation — and a boundary violation carrying only a type is still one: it
    // names a concrete implementation where a port belongs, and it is what a later refactor turns
    // into a runtime edge.
    tsPreCompilationDeps: true,
  },
};
