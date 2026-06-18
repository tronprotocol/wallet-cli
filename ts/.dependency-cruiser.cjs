/**
 * Layer rules for the semantic src/ grouping.
 * Dependency order (low -> high): core -> infra -> runtime -> chains -> cli -> app.
 * A group may import lower groups only; importing a higher (or peer chains<->cli) group is forbidden.
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "circular dependencies are not allowed",
      from: {},
      to: { circular: true },
    },
    {
      name: "core-no-upward",
      severity: "error",
      comment: "core/ is the base layer; it must not import any higher group",
      from: { path: "^src/core/" },
      to: { path: "^src/(infra|runtime|chains|cli|app)/" },
    },
    {
      name: "infra-no-upward",
      severity: "error",
      comment: "infra/ may import core/ only",
      from: { path: "^src/infra/" },
      to: { path: "^src/(runtime|chains|cli|app)/" },
    },
    {
      name: "runtime-no-upward",
      severity: "error",
      comment: "runtime/ may import core/ and infra/ only",
      from: { path: "^src/runtime/" },
      to: { path: "^src/(chains|cli|app)/" },
    },
    {
      name: "chains-no-upward",
      severity: "error",
      comment: "chains/ may import core/infra/runtime; not cli/ or app/",
      from: { path: "^src/chains/" },
      to: { path: "^src/(cli|app)/" },
    },
    {
      name: "cli-no-upward-or-chains",
      severity: "error",
      comment: "cli/ may import core/infra/runtime; not chains/ (peer) or app/",
      from: { path: "^src/cli/" },
      to: { path: "^src/(chains|app)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      extensions: [".ts", ".js"],
    },
  },
};
