// Builds the qaprobe fixture plugin against plugin-sdk/dist and packs it as npm would.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { build } from "esbuild";
import { tarball, type TarEntry } from "./tarball.js";

export type QaprobeVariant =
  | "ok"
  | "conflict"
  | "api-version"
  | "api-revision"
  | "import-failure"
  | "register-failure"
  | "credential-core-key"
  | "older-revision"
  | "missing-export";

const TS_ROOT = resolve(import.meta.dirname, "../..");
const FIXTURE = join(TS_ROOT, "test/fixtures/plugins/qaprobe");
const SDK = join(TS_ROOT, "plugin-sdk");
// The runtime entries the core serves to a plugin's import; the package root stays bundled.
const SDK_RUNTIME_ENTRIES = ["domain", "application", "cli", "http"] as const;

// Builds plugin-sdk/dist when it is missing.
export function ensurePluginSdk(): void {
  if (existsSync(join(SDK, "dist/version.json"))) return;
  execFileSync(process.execPath, ["--import", "tsx", "scripts/build-plugin-sdk.mjs"], {
    cwd: TS_ROOT,
    stdio: "ignore",
  });
}

// A package directory holding package.json and dist/index.mjs.
export async function buildQaprobe(
  outDir: string,
  variant: QaprobeVariant = "ok",
  version = "1.0.0",
): Promise<string> {
  ensurePluginSdk();
  mkdirSync(join(outDir, "dist"), { recursive: true });
  let root = join(SDK, "dist/index.mjs");
  if (variant === "older-revision") {
    // The root of an SDK built for the revision before this core's.
    const { apiVersion, apiRevision } = JSON.parse(
      readFileSync(join(SDK, "dist/version.json"), "utf8"),
    );
    root = `${outDir}.older-sdk-root.mjs`;
    writeFileSync(
      root,
      `export const PLUGIN_API_VERSION = ${apiVersion};\nexport const PLUGIN_API_REVISION = ${apiRevision - 1};\n`,
    );
  }
  await build({
    entryPoints: [join(FIXTURE, "src/index.mjs")],
    outfile: join(outDir, "dist/index.mjs"),
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    logLevel: "silent",
    define: { QAPROBE_VARIANT: JSON.stringify(variant), QAPROBE_VERSION: JSON.stringify(version) },
    // An alias would also rewrite the subpaths, which must stay external.
    plugins: [
      {
        name: "plugin-sdk-root",
        setup: (b) =>
          b.onResolve({ filter: /^@tron-walletcli\/plugin-sdk$/ }, () => ({ path: root })),
      },
    ],
    external: SDK_RUNTIME_ENTRIES.map((e) => `@tron-walletcli/plugin-sdk/${e}`),
    ...(variant === "missing-export"
      ? { banner: { js: 'import { noSuchExport } from "@tron-walletcli/plugin-sdk/domain";' } }
      : {}),
  });
  const pkg = JSON.parse(readFileSync(join(FIXTURE, "package.json"), "utf8"));
  pkg.version = version;
  if (variant === "conflict") pkg.walletCli.plugin.name = "qaprobe-twin";
  if (variant === "credential-core-key") pkg.walletCli.plugin.credentials[0].key = "timeoutMs";
  const manifest = join(outDir, "package.json");
  writeFileSync(manifest, JSON.stringify(pkg, null, 2));
  execFileSync(process.execPath, [join(SDK, "bin/stamp.mjs"), manifest], { stdio: "ignore" });
  const stamped = JSON.parse(readFileSync(manifest, "utf8"));
  if (variant === "api-version") stamped.walletCli.plugin.apiVersion += 1;
  if (variant === "api-revision") stamped.walletCli.plugin.apiRevision += 1;
  if (variant === "older-revision") stamped.walletCli.plugin.apiRevision -= 1;
  writeFileSync(manifest, JSON.stringify(stamped, null, 2));
  return outDir;
}

// Packs a package directory under `package/`, as `npm pack` lays it out.
export function packDirectory(dir: string, outFile: string): string {
  const entries: TarEntry[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else entries.push({ name: `package/${relative(dir, path)}`, body: readFileSync(path) });
    }
  };
  walk(dir);
  writeFileSync(outFile, tarball(entries));
  return outFile;
}
