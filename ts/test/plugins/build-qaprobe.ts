// Usage: node --import tsx test/plugins/build-qaprobe.ts <out-dir> [variant] [version]
// Writes <out-dir>/package (the package directory) and <out-dir>/qaprobe-<version>.tgz.
import { join, resolve } from "node:path";
import { buildQaprobe, packDirectory, type QaprobeVariant } from "./qaprobe.js";

const [out, variant = "ok", version = "1.0.0"] = process.argv.slice(2);
if (out === undefined) throw new Error("usage: build-qaprobe.ts <out-dir> [variant] [version]");
const dir = await buildQaprobe(join(resolve(out), "package"), variant as QaprobeVariant, version);
process.stdout.write(
  `${dir}\n${packDirectory(dir, join(resolve(out), `qaprobe-${version}.tgz`))}\n`,
);
