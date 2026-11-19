import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAddonCopy, removeAddonCopies } from "./addon-copies.js";

// Runs after each private directory is created, as another start would between creation and the write.
const created = vi.hoisted(() => ({ hook: undefined as ((dir: string) => void) | undefined }));
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return {
    ...fs,
    mkdtempSync: (prefix: string) => {
      const dir = fs.mkdtempSync(prefix);
      created.hook?.(dir);
      return dir;
    },
  };
});

const PREFIX = "wallet-cli-hid-";
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "addon-copies-test-"));
});
afterEach(() => {
  created.hook = undefined;
  rmSync(root, { recursive: true, force: true });
});

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

describe("loadAddonCopy", () => {
  const BYTES = new Uint8Array([1, 2, 3]);

  function loader(behave: (file: string, call: number) => string = () => "binding") {
    const files: string[] = [];
    const load = vi.fn((file: string) => {
      files.push(file);
      expect(readFileSync(file)).toEqual(Buffer.from(BYTES));
      return behave(file, files.length);
    });
    return { load, files };
  }

  it("loads a private copy and removes its directory", () => {
    const { load } = loader();
    expect(loadAddonCopy({ root, prefix: PREFIX, bytes: BYTES, load, platform: "darwin" })).toBe(
      "binding",
    );
    expect(load).toHaveBeenCalledTimes(1);
    expect(readdirSync(root)).toEqual([]);
  });

  it("tries once more when another start removes the directory before the write", () => {
    let first = true;
    created.hook = () => {
      if (!first) return;
      first = false;
      removeAddonCopies(root, PREFIX);
    };
    const { load } = loader();
    expect(loadAddonCopy({ root, prefix: PREFIX, bytes: BYTES, load, platform: "darwin" })).toBe(
      "binding",
    );
    expect(load).toHaveBeenCalledTimes(1);
    expect(readdirSync(root)).toEqual([]);
  });

  it("tries once more when another start removes the file before it is loaded", () => {
    const { load } = loader((file, call) => {
      if (call > 1) return "binding";
      removeAddonCopies(root, PREFIX);
      throw new Error(`dlopen failed: ${file}`);
    });
    expect(loadAddonCopy({ root, prefix: PREFIX, bytes: BYTES, load, platform: "darwin" })).toBe(
      "binding",
    );
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("fails when the copy is removed on the second attempt as well", () => {
    created.hook = () => removeAddonCopies(root, PREFIX);
    const { load } = loader();
    expect(() =>
      loadAddonCopy({ root, prefix: PREFIX, bytes: BYTES, load, platform: "darwin" }),
    ).toThrow("the Ledger HID addon copy was removed before it could be loaded");
    expect(load).not.toHaveBeenCalled();
  });

  it("throws a load failure of a copy that is still there as it is, without a second attempt", () => {
    const failure = new Error("not a valid addon");
    const { load } = loader(() => {
      throw failure;
    });
    expect(() =>
      loadAddonCopy({ root, prefix: PREFIX, bytes: BYTES, load, platform: "darwin" }),
    ).toThrow(failure);
    expect(load).toHaveBeenCalledTimes(1);
    expect(readdirSync(root)).toEqual([]);
  });

  // A mode change denies nothing on Windows or to the superuser.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "throws a load failure of a copy it can no longer inspect as it is, without a second attempt",
    () => {
      const failure = new Error("permission denied");
      let dir = "";
      const { load } = loader((file) => {
        dir = dirname(file);
        chmodSync(dir, 0o000);
        throw failure;
      });
      try {
        expect(() =>
          loadAddonCopy({ root, prefix: PREFIX, bytes: BYTES, load, platform: "darwin" }),
        ).toThrow(failure);
        expect(load).toHaveBeenCalledTimes(1);
      } finally {
        chmodSync(dir, 0o700);
      }
    },
  );

  it("throws a write failure in a directory that is still there as it is", () => {
    const { load } = loader();
    expect(() =>
      loadAddonCopy({ root, prefix: PREFIX, bytes: 42 as never, load, platform: "darwin" }),
    ).toThrow(expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }));
    expect(load).not.toHaveBeenCalled();
  });

  it("removes earlier copies on Windows only", () => {
    const leftover = copy(`${PREFIX}old`, "HID.node");
    loadAddonCopy({ root, prefix: PREFIX, bytes: BYTES, load: loader().load, platform: "linux" });
    expect(existsSync(leftover)).toBe(true);
    loadAddonCopy({ root, prefix: PREFIX, bytes: BYTES, load: loader().load, platform: "win32" });
    expect(existsSync(leftover)).toBe(false);
  });
});
