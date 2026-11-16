import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { paxPath, tarball, type TarEntry } from "../../../../test/plugins/tarball.js";
import { MAX_ARCHIVE_BYTES, readPackageTarball } from "./tar.js";

const text = (bytes: Uint8Array | undefined) => Buffer.from(bytes ?? []).toString("utf8");

describe("readPackageTarball", () => {
  it("returns files by their path inside the package", () => {
    const files = readPackageTarball(
      tarball([
        { name: "package/", type: "5" },
        { name: "package/package.json", body: "{}" },
        { name: "package/dist/index.mjs", body: "export default 1;" },
        { name: "pax", type: "x", body: paxPath(`package/${"long/".repeat(30)}file.js`) },
        { name: "package/ignored-short-name", body: "long" },
      ]),
    );
    expect([...files.keys()]).toEqual([
      "package.json",
      "dist/index.mjs",
      `${"long/".repeat(30)}file.js`,
    ]);
    expect(text(files.get("dist/index.mjs"))).toBe("export default 1;");
  });

  it.each([
    ["a parent path", { name: "package/../evil.js", body: "x" }],
    ["a nested parent path", { name: "package/dist/../../evil.js", body: "x" }],
    ["an absolute path", { name: "/etc/passwd", body: "x" }],
    ["a path through a pax header", { name: "pax", type: "x", body: paxPath("package/../x") }],
    ["a parent top-level directory", { name: "../package.json", body: "{}" }],
    ["a drive path", { name: "C:/package.json", body: "{}" }],
    [
      "a parent top-level directory in a pax header",
      { name: "pax", type: "x", body: paxPath("../package.json") },
    ],
    [
      "a parent top-level directory in a GNU long name",
      { name: "././@LongLink", type: "L", body: "../package.json" },
    ],
  ])("refuses %s", (_label, entry: TarEntry) => {
    const entries =
      entry.type === "x" || entry.type === "L"
        ? [entry, { name: "package/ok", body: "x" }]
        : [entry];
    expect(() => readPackageTarball(tarball(entries))).toThrow(
      expect.objectContaining({
        code: "plugin_invalid",
        message: expect.stringContaining("leaves the package root"),
      }),
    );
  });

  it.each([
    ["a symlink", "2"],
    ["a hard link", "1"],
    ["a character device", "3"],
    ["a fifo", "6"],
  ])("refuses %s", (_label, type) => {
    expect(() =>
      readPackageTarball(tarball([{ name: "package/link", type, linkName: "/etc/passwd" }])),
    ).toThrow(
      expect.objectContaining({
        code: "plugin_invalid",
        message: expect.stringContaining("link or special file"),
      }),
    );
  });

  it("refuses data that is not gzip, a corrupt header and a duplicate entry", () => {
    expect(() => readPackageTarball(new Uint8Array([1, 2, 3]))).toThrow(/not gzip data/);
    const corrupt = Buffer.alloc(1536);
    corrupt.write("package/a", 0);
    expect(() => readPackageTarball(gzipSync(corrupt))).toThrow(/header is corrupt/);
    expect(() =>
      readPackageTarball(
        tarball([
          { name: "package/a", body: "1" },
          { name: "package/a", body: "2" },
        ]),
      ),
    ).toThrow(/appears twice/);
  });

  it("refuses an archive over the size limits before and after decompression", () => {
    expect(() => readPackageTarball(new Uint8Array(MAX_ARCHIVE_BYTES + 1))).toThrow(/too large/);
    const bomb = tarball([{ name: "package/zeros", body: new Uint8Array(65 * 1024 * 1024) }]);
    expect(bomb.length).toBeLessThan(MAX_ARCHIVE_BYTES);
    expect(() => readPackageTarball(bomb)).toThrow(/unpacked archive is too large/);
  });

  it("refuses entries under different top-level directories", () => {
    expect(() =>
      readPackageTarball(
        tarball([
          { name: "package/package.json", body: "{}" },
          { name: "other/dist/index.mjs", body: "export default 1;" },
        ]),
      ),
    ).toThrow(
      expect.objectContaining({
        code: "plugin_invalid",
        message: expect.stringContaining("different top-level directories"),
      }),
    );
  });
});
