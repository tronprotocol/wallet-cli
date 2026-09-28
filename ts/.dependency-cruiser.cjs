/**
 * Enforced dependency direction:
 *
 *   bootstrap (composition) -> inbound/outbound adapters -> application -> domain
 *                                  inbound adapters -> application -> domain
 *
 * Inbound and outbound adapters are peers. They may meet only in bootstrap/composition.
 */
module.exports = {
  forbidden: [
    {
      name: "ports-are-innermost",
      severity: "error",
      from: { path: "^src/application/ports/" },
      to: { path: "^src/application/(use-cases|services)/" },
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
      name: "sunswap-does-not-import-sunpump",
      severity: "error",
      comment: "the two SunSwap/SunPump adapters are separate integrations and share no code",
      from: { path: "^src/adapters/outbound/sunswap/" },
      to: { path: "^src/adapters/outbound/sunpump/" },
    },
    {
      name: "sunpump-does-not-import-sunswap",
      severity: "error",
      comment: "the reverse of sunswap-does-not-import-sunpump",
      from: { path: "^src/adapters/outbound/sunpump/" },
      to: { path: "^src/adapters/outbound/sunswap/" },
    },
    {
      name: "no-runtime-import",
      severity: "error",
      comment:
        "@sun-protocol/sun-sdk-runtime can broadcast (sendAction) and build a wallet from a private key; exactly one file builds a read-only runtime over a TronClient that throws on both, and nothing else may reach for it (D6)",
      from: { path: "^src/", pathNot: "^src/adapters/outbound/sunswap/sdk-runtime\\.ts$" },
      to: { path: "@sun-protocol/sun-sdk-runtime" },
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
