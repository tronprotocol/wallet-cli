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
      comment: "CLI adapters call application ports/use-cases; bootstrap/composition supplies outbound implementations",
      from: { path: "^src/adapters/inbound/", pathNot: "\\.test\\.ts$" },
      to: { path: "^src/(adapters/outbound|bootstrap)/" },
    },
    {
      name: "outbound-does-not-know-inbound",
      severity: "error",
      from: { path: "^src/adapters/outbound/", pathNot: "\\.test\\.ts$" },
      to: { path: "^src/(adapters/inbound|bootstrap)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: { extensions: [".ts", ".js"] },
  },
};
