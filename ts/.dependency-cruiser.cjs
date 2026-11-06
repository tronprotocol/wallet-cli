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

const SDK_PACKAGES = "(tronweb|ethers)(/|$)|@(sun-protocol|bankofai|ledgerhq)/";
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
      from: { path: "^src/application/(ports|contracts)/", pathNot: "\\.test\\.ts$" },
      to: { path: "^src/application/", pathNot: "^src/application/(ports|contracts)/" },
    },
    {
      name: "application-imports-no-use-case",
      severity: "error",
      comment:
        "a use case is a *-service.ts module under application/use-cases; nothing in application imports one",
      from: { path: "^src/application/", pathNot: "\\.test\\.ts$" },
      to: { path: "^src/application/use-cases/.*[^/]-service\\.ts$" },
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
      from: { path: "^src/domain/" },
      to: { path: "^src/(application|adapters|bootstrap)/" },
    },
    {
      name: "application-owns-ports",
      severity: "error",
      comment: "production application code depends on domain and its own ports, never adapters",
      from: { path: "^src/application/", pathNot: "\\.test\\.ts$" },
      to: { path: "^src/(adapters|bootstrap)/" },
    },
    {
      name: "inbound-does-not-know-outbound",
      severity: "error",
      comment:
        "CLI adapters call application ports/use-cases; bootstrap/composition supplies outbound implementations",
      from: { path: "^src/adapters/inbound/", pathNot: "\\.test\\.ts$" },
      to: { path: "^src/(adapters/outbound|bootstrap)/" },
    },
    {
      name: "outbound-does-not-know-inbound",
      severity: "error",
      from: { path: "^src/adapters/outbound/", pathNot: "\\.test\\.ts$" },
      to: { path: "^src/(adapters/inbound|bootstrap)/" },
    },
    {
      name: "outbound-imports-no-service-or-use-case",
      severity: "error",
      comment:
        "outbound adapters import application ports and contracts, never services or use cases",
      from: { path: "^src/adapters/outbound/", pathNot: "\\.test\\.ts$" },
      to: { path: "^src/application/(services|use-cases)/" },
    },
    {
      name: "domain-and-application-use-allowlisted-packages",
      severity: "error",
      comment:
        "domain and application import outside packages only from @noble/*, @scure/*, and node:crypto",
      from: { path: "^src/(domain|application)/", pathNot: "\\.test\\.ts$" },
      // Node core modules resolve without the `node:` prefix.
      to: { pathNot: "^(src/|crypto$)|(^|node_modules/)@(noble|scure)/" },
    },
    {
      name: "sdks-and-http-clients-only-in-outbound",
      severity: "error",
      comment:
        "chain, device, and protocol SDKs and HTTP clients are imported only in adapters/outbound",
      from: { path: "^src/", pathNot: "^src/adapters/outbound/|\\.test\\.ts$" },
      to: { path: `(^|node_modules/)(${SDK_PACKAGES}|${HTTP_CLIENT_PACKAGES})` },
    },
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
        path: "^src/adapters/outbound/((chain/)?[^/]+$|(http|persistence)/)",
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
      name: "sdk-adapters-only",
      severity: "error",
      comment:
        "@sun-sdk is a vendor SDK, so it belongs behind the outbound adapter that owns it; anywhere else it would put a vendor's types in a port or a use case",
      from: { path: "^src/", pathNot: "^src/adapters/outbound/(sunswap|sunpump)/" },
      // Unanchored: an installed dependency resolves to `node_modules/@sun-protocol/sun-sdk-...`, an
      // unresolvable one keeps its bare specifier, and both have to be caught.
      // `import type` counts too — tsPreCompilationDeps is on, and a type-only edge still names
      // the vendor where a port belongs and is what a later refactor turns into a runtime edge.
      to: { path: "@sun-protocol/sun-sdk-" },
    },
    {
      name: "no-runtime-import",
      severity: "error",
      comment:
        "@sun-protocol/sun-sdk-runtime can broadcast (sendAction) and build a wallet from a private key; exactly one file builds a read-only runtime over a TronClient that throws on both, and nothing else may reach for it",
      from: { path: "^src/", pathNot: "^src/adapters/outbound/sunswap/sdk-runtime\\.ts$" },
      to: { path: "@sun-protocol/sun-sdk-runtime" },
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
      from: { path: "^src/", pathNot: "^src/adapters/outbound/erc8004/sdk-registry\\.ts$" },
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
      from: { path: "^src/", pathNot: "^src/adapters/outbound/x402/payment-client\\.ts$" },
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
