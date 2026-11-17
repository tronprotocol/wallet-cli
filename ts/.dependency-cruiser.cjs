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

const SDK_PACKAGES = "(tronweb|ethers)(/|$)|@ledgerhq/";
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

// A core layer directory.
const layer = (directory) => `^src/${directory}`;

// Export-map subpaths of the Ledger app modules that sign. Each pattern matches the bare
// specifier and the file it resolves to, since depcruise reports whichever it ends up with.
const LEDGER_SIGNING_MODULES = {
  "hw-app-trx": ["Trx", "TIP712"],
  "hw-app-eth": ["Eth", "modules/EIP712"],
};
const LEDGER_SIGNING_PATTERN = Object.entries(LEDGER_SIGNING_MODULES)
  .map(([app, modules]) => `${app}($|/(lib/|lib-es/|)(${modules.join("|")})(/index|)(\\.js|)$)`)
  .join("|");

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
        path: "^src/(application|adapters|bootstrap)/",
      },
    },
    {
      name: "application-owns-ports",
      severity: "error",
      comment: "production application code depends on domain and its own ports, never adapters",
      from: { path: `${layer("application")}/`, pathNot: "\\.test\\.ts$" },
      to: {
        path: "^src/(adapters|bootstrap)/",
      },
    },
    {
      name: "inbound-does-not-know-outbound",
      severity: "error",
      comment:
        "CLI adapters call application ports/use-cases; bootstrap/composition supplies outbound implementations",
      from: { path: `${layer("adapters")}/inbound/`, pathNot: "\\.test\\.ts$" },
      to: {
        path: "^src/(adapters/outbound|bootstrap)/",
      },
    },
    {
      name: "outbound-does-not-know-inbound",
      severity: "error",
      from: { path: `${layer("adapters")}/outbound/`, pathNot: "\\.test\\.ts$" },
      to: {
        path: "^src/(adapters/inbound|bootstrap)/",
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
      name: "ledger-apps-only-in-ledger-wrapper",
      severity: "error",
      comment: "the Ledger app modules that sign; only the ledger wrapper imports them",
      from: { path: "^src/", pathNot: "^src/adapters/outbound/ledger/index\\.ts$" },
      to: { path: `(^|node_modules/)@ledgerhq/(${LEDGER_SIGNING_PATTERN})` },
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
