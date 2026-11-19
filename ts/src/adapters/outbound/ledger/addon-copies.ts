import {
  lstatSync,
  mkdtempSync,
  readdirSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

// Removes the addon copies earlier starts of the standalone executable left in `directory`: each directory
// whose name starts with `prefix` loses `file` and is then removed if empty. A link is never followed, a
// directory of another user is skipped, and every error is ignored: a copy another running process has
// loaded stays locked on Windows until a later start.
export function removeAddonCopies(directory: string, prefix: string, file = "HID.node"): void {
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch {
    return;
  }
  const uid = process.getuid?.();
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    const path = join(directory, name);
    try {
      const stats = lstatSync(path);
      if (!stats.isDirectory() || (uid !== undefined && stats.uid !== uid)) continue;
      try {
        unlinkSync(join(path, file));
      } catch {
        // Already gone, or still loaded.
      }
      rmdirSync(path);
    } catch {
      // Left for a later start.
    }
  }
}

export interface AddonCopy<T> {
  // The temporary directory the private copy is created in.
  readonly root: string;
  readonly prefix: string;
  readonly bytes: Uint8Array;
  readonly load: (file: string) => T;
  readonly platform?: NodeJS.Platform;
}

// Writes the addon into a new private directory under `root`, loads it and removes the directory. A fixed
// path in a shared temporary directory would let another local user plant the native code that gets
// loaded. On Windows a loaded copy stays locked, so copies earlier starts left are removed first; a start
// that does so can remove this copy before it is loaded, which leads to one new attempt. Any other failure
// is thrown as it is.
export function loadAddonCopy<T>(copy: AddonCopy<T>): T {
  if ((copy.platform ?? process.platform) === "win32") removeAddonCopies(copy.root, copy.prefix);
  const first = attempt(copy);
  if (first.loaded) return first.value;
  const second = attempt(copy);
  if (second.loaded) return second.value;
  throw new Error("the Ledger HID addon copy was removed before it could be loaded", {
    cause: second.error,
  });
}

function attempt<T>(
  copy: AddonCopy<T>,
): { loaded: true; value: T } | { loaded: false; error: unknown } {
  const dir = mkdtempSync(join(copy.root, copy.prefix));
  const file = join(dir, "HID.node");
  let written = false;
  try {
    writeFileSync(file, copy.bytes, { mode: 0o700, flag: "wx" });
    written = true;
    return { loaded: true, value: copy.load(file) };
  } catch (error) {
    // Removed by another start: the directory is gone, or the written file is.
    if (isGone(dir) || (written && isGone(file))) return { loaded: false, error };
    throw error;
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows keeps a loaded DLL locked; a later start removes the copy.
    }
  }
}

// A path that cannot be inspected is not gone.
function isGone(path: string): boolean {
  try {
    lstatSync(path);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}
