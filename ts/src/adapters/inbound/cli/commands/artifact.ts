import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { UsageError } from "../../../../domain/errors/index.js";

export function readBoundedTextFile(path: string, maxBytes: number, label: string): string {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new UsageError("invalid_value", `${label} must be a regular file`);
    if (stat.size > maxBytes) throw new UsageError("invalid_value", `${label} exceeds the ${maxBytes}-byte limit`);
    return readFileSync(fd, "utf8");
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError("invalid_value", `could not read ${label}: ${(error as Error).message}`);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function exactlyOne(values: readonly unknown[], message: string): void {
  if (values.filter((value) => value !== undefined && value !== false).length !== 1) {
    throw new UsageError("invalid_option", message);
  }
}
