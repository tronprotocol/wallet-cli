import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, expect, it, vi } from "vitest";
import { isSea, pluginImporter, vmLoaderImporter } from "./import-plugin.js";

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

// Only the vm path swaps process.emitWarning around the import call.
it("uses the vm loader in a single executable and plain import() elsewhere", async () => {
  const entry = join(directory, "chosen.mjs");
  writeFileSync(entry, "export default 7;\n");
  const descriptor = Object.getOwnPropertyDescriptor(process, "emitWarning")!;
  let value = process.emitWarning;
  let swaps = 0;
  Object.defineProperty(process, "emitWarning", {
    configurable: true,
    get: () => value,
    set: (next) => {
      swaps += 1;
      value = next;
    },
  });
  try {
    expect((await pluginImporter(() => false)(pathToFileURL(entry).href)).default).toBe(7);
    expect(swaps).toBe(0);
    expect((await pluginImporter(() => true)(`${pathToFileURL(entry).href}?sea`)).default).toBe(7);
    expect(swaps).toBe(2);
  } finally {
    Object.defineProperty(process, "emitWarning", descriptor);
  }
});

it("is not a single executable under the test runner", () => {
  expect(isSea()).toBe(false);
});
