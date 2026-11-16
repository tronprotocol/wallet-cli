// Writes gzip ustar archives for plugin package tests, including hostile ones.
import { gzipSync } from "node:zlib";

export interface TarEntry {
  readonly name: string;
  readonly body?: Uint8Array | string;
  // Type flag: "0" file (default), "5" directory, "2" symlink, "1" hard link, "x" pax header.
  readonly type?: string;
  readonly linkName?: string;
}

function header(entry: TarEntry, size: number): Buffer {
  const block = Buffer.alloc(512);
  block.write(entry.name, 0, 100, "utf8");
  block.write("0000644\0", 100, 8, "ascii");
  block.write("0000000\0", 108, 8, "ascii");
  block.write("0000000\0", 116, 8, "ascii");
  block.write(`${size.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
  block.write("00000000000\0", 136, 12, "ascii");
  block.fill(0x20, 148, 156);
  block.write(entry.type ?? "0", 156, 1, "ascii");
  if (entry.linkName) block.write(entry.linkName, 157, 100, "utf8");
  block.write("ustar\0", 257, 6, "ascii");
  block.write("00", 263, 2, "ascii");
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return block;
}

export function tarball(entries: readonly TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.body ?? "");
    parts.push(header(entry, body.length), body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts));
}

// A pax extended header body that sets the next entry's path.
export function paxPath(path: string): string {
  const record = (length: number) => `${length} path=${path}\n`;
  let length = record(0).length;
  while (record(length).length !== length) length = record(length).length;
  return record(length);
}
