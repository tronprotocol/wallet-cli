/**
 * Layer rules for the semantic src/ grouping.
 * Dependency order (low -> high): core -> infra -> runtime -> commands -> cli -> app.
 * A group may import lower groups only; importing a higher (or peer commands<->cli) group is forbidden.
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
      to: { path: "^src/(infra|runtime|commands|cli|app)/" },
    },
    {
      name: "infra-no-upward",
      severity: "error",
      comment: "infra/ may import core/ only",
      from: { path: "^src/infra/" },
      to: { path: "^src/(runtime|commands|cli|app)/" },
    },
    {
      name: "runtime-no-upward",
      severity: "error",
      comment: "runtime/ may import core/ and infra/ only",
      from: { path: "^src/runtime/" },
      to: { path: "^src/(commands|cli|app)/" },
    },
    {
      name: "commands-no-upward",
      severity: "error",
      comment: "commands/ may import core/infra/runtime; not cli/ or app/",
      from: { path: "^src/commands/" },
      to: { path: "^src/(cli|app)/" },
    },
    {
      name: "cli-no-upward-or-commands",
      severity: "error",
      comment: "cli/ may import core/infra/runtime; not commands/ (peer) or app/",
      from: { path: "^src/cli/" },
      to: { path: "^src/(commands|app)/" },
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
