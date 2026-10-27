import { expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const name of ["watch-pr", "ship-pr"]) {
  it(`${name} --help runs from a foreign working directory`, () => {
    const result = spawnSync(
      process.execPath,
      ["run", join(import.meta.dir, name), "--help"],
      {
        cwd: tmpdir(),
        encoding: "utf8",
        timeout: 3000,
      }
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`Usage: ${name}`);
  });
}
