import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { removeAddonCopies } from "./addon-copies.js";

const PREFIX = "wallet-cli-hid-";
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "addon-copies-test-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function copy(name: string, ...files: string[]): string {
  const directory = join(root, name);
  mkdirSync(directory);
  for (const file of files) writeFileSync(join(directory, file), "x");
  return directory;
}

it("removes a leftover copy and its directory", () => {
  const leftover = copy(`${PREFIX}a1`, "HID.node");
  removeAddonCopies(root, PREFIX);
  expect(existsSync(leftover)).toBe(false);
});

it("leaves a directory that holds another file", () => {
  const other = copy(`${PREFIX}b2`, "HID.node", "notes.txt");
  removeAddonCopies(root, PREFIX);
  expect(existsSync(join(other, "notes.txt"))).toBe(true);
});

it("does not follow a link whose name has the prefix", () => {
  const target = copy("elsewhere", "HID.node");
  symlinkSync(target, join(root, `${PREFIX}link`), "dir");
  removeAddonCopies(root, PREFIX);
  expect(existsSync(join(target, "HID.node"))).toBe(true);
  expect(existsSync(join(root, `${PREFIX}link`))).toBe(true);
});

it("leaves an entry without the prefix untouched", () => {
  const unrelated = copy("unrelated-hid", "HID.node");
  removeAddonCopies(root, PREFIX);
  expect(existsSync(join(unrelated, "HID.node"))).toBe(true);
});

it("ignores a directory it cannot read", () => {
  expect(() => removeAddonCopies(join(root, "missing"), PREFIX)).not.toThrow();
});
