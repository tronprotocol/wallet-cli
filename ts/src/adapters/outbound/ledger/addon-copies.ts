import { lstatSync, readdirSync, rmdirSync, unlinkSync } from "node:fs";
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
