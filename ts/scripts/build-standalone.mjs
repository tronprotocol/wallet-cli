import { existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
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
const requestedOutfile = resolve(option("--outfile") ?? join("standalone", defaultName));
const outfile =
  process.platform === "win32" && extname(requestedOutfile).toLowerCase() !== ".exe"
    ? `${requestedOutfile}.exe`
    : requestedOutfile;
const outfileExt = extname(outfile);
const outfileStem = outfileExt ? outfile.slice(0, -outfileExt.length) : outfile;
const stagedOutfile = `${outfileStem}.${process.pid}.${Date.now()}.building${outfileExt}`;
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

try {
  const result = await Bun.build({
    entrypoints: [resolve("src/index.ts")],
    compile: {
      target,
      outfile: stagedOutfile,
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
    // signature invalid. Sign the staged bytes before publishing so the previous executable remains
    // usable if signing fails.
    if (process.platform === "darwin") {
      const signed = spawnSync("/usr/bin/codesign", ["--force", "--sign", "-", stagedOutfile], {
        stdio: "inherit",
      });
      if (signed.error) throw signed.error;
      if (signed.status !== 0) {
        throw new Error(`codesign failed for ${stagedOutfile} with status ${signed.status}`);
      }
    }
    await publishExecutable(stagedOutfile, outfile);
    console.log(`built ${outfile} (${target})`);
  }
} finally {
  // Failed compile/sign/publish attempts must not accumulate large embedded-runtime executables.
  try {
    if (existsSync(stagedOutfile)) unlinkSync(stagedOutfile);
  } catch {
    // Preserve the primary build error; a stale, uniquely named staging file is safe to remove later.
  }
}

async function publishExecutable(staged, destination) {
  const attempts = process.platform === "win32" ? 12 : 1;
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      renameSync(staged, destination);
      return;
    } catch (error) {
      lastError = error;
    }

    // Windows cannot rename over an existing executable on every filesystem/runtime combination.
    // Remove only after the new executable has built successfully; a running image remains locked
    // and leaves the old destination intact.
    if (process.platform === "win32" && existsSync(destination)) {
      try {
        unlinkSync(destination);
        renameSync(staged, destination);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    if (!isRetryableWindowsLock(lastError) || attempt === attempts - 1) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(50 * 2 ** attempt, 500)));
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : "";
  const executableName = destination.split(/[\\/]/).at(-1);
  const hint =
    process.platform === "win32"
      ? ` Close every running ${executableName} process and retry; ` +
        `inspect locks with: tasklist /FI "IMAGENAME eq ${executableName}".`
      : "";
  throw new Error(`failed to publish standalone executable to ${destination}${detail}.${hint}`, {
    cause: lastError,
  });
}

function isRetryableWindowsLock(error) {
  if (process.platform !== "win32" || typeof error !== "object" || error === null) return false;
  return new Set(["EPERM", "EACCES", "EBUSY", "EEXIST", "ENOTEMPTY"]).has(error.code);
}
