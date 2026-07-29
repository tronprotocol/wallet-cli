import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const targetByHost = {
  "darwin-arm64": "bun-darwin-arm64",
  "darwin-x64": "bun-darwin-x64",
  "linux-arm64": "bun-linux-arm64",
  "linux-x64": "bun-linux-x64-baseline",
  "win32-x64": "bun-windows-x64-baseline",
};

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const host = `${process.platform}-${process.arch}`;
const expectedTarget = targetByHost[host];
if (!expectedTarget) {
  throw new Error(`standalone builds are not supported on ${host}`);
}

const target = option("--target") ?? expectedTarget;
if (target !== expectedTarget) {
  throw new Error(
    `refusing to combine ${host} native HID code with ${target}; build each target on its native runner`,
  );
}

const defaultName = process.platform === "win32" ? "wallet-cli.exe" : "wallet-cli";
const outfile = resolve(option("--outfile") ?? join("standalone", defaultName));
const nativeAddon =
  process.platform === "linux"
    ? "node_modules/node-hid/build/Release/HID_hidraw.node"
    : "node_modules/node-hid/build/Release/HID.node";
if (!existsSync(nativeAddon)) {
  throw new Error(
    `missing ${nativeAddon}; run npm ci on the target platform before building the executable`,
  );
}

mkdirSync(dirname(outfile), { recursive: true });

const hidShim = resolve(
  process.platform === "linux"
    ? "scripts/standalone/node-hid-linux.ts"
    : "scripts/standalone/node-hid-default.ts",
);

const result = await Bun.build({
  entrypoints: [resolve("src/index.ts")],
  compile: {
    target,
    outfile,
    autoloadDotenv: false,
    autoloadBunfig: false,
  },
  minify: true,
  plugins: [
    {
      name: "standalone-node-hid",
      setup(build) {
        build.onResolve({ filter: /^node-hid$/ }, () => ({ path: hidShim }));
      },
    },
  ],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exitCode = 1;
} else {
  // Bun emits an ad-hoc-signed Mach-O, but embedding the native HID payload can leave that
  // signature invalid. Re-sign the final bytes so local builds and release assets pass Gatekeeper's
  // structural validation. Distribution identity/notarization can replace this ad-hoc signature
  // later without changing the build contract.
  if (process.platform === "darwin") {
    const signed = spawnSync("/usr/bin/codesign", ["--force", "--sign", "-", outfile], {
      stdio: "inherit",
    });
    if (signed.error) throw signed.error;
    if (signed.status !== 0) {
      throw new Error(`codesign failed for ${outfile} with status ${signed.status}`);
    }
  }
  console.log(`built ${outfile} (${target})`);
}
