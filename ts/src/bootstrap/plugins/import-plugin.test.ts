import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, expect, it, vi } from "vitest";
import { vmLoaderImporter } from "./import-plugin.js";

const directory = mkdtempSync(join(tmpdir(), "import-plugin-test-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

it("imports a file through the vm loader without its ExperimentalWarning and restores emitWarning", async () => {
  const entry = join(directory, "plugin.mjs");
  writeFileSync(entry, "export default await Promise.resolve(42);\n");
  const original = process.emitWarning;
  const spy = vi.fn();
  process.on("warning", spy);
  try {
    const module = await vmLoaderImporter()(pathToFileURL(entry).href);
    await new Promise((resolve) => setImmediate(resolve));
    expect(module.default).toBe(42);
    expect(process.emitWarning).toBe(original);
    expect(spy).not.toHaveBeenCalled();
  } finally {
    process.off("warning", spy);
  }
});

it("lets every other warning through", async () => {
  const spy = vi.fn();
  process.on("warning", spy);
  try {
    process.emitWarning("another experimental feature", "ExperimentalWarning");
    await new Promise((resolve) => setImmediate(resolve));
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ name: "ExperimentalWarning" }));
  } finally {
    process.off("warning", spy);
  }
});
