import { expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { object } from "./landing.ts";

function fixture(
  body: (
    run: (...args: string[]) => {
      status: number | null;
      output: Record<string, unknown>;
    },
    file: string,
    dir: string
  ) => void
) {
  const dir = mkdtempSync(join(tmpdir(), "shipping-cli-"));
  const file = join(dir, "state.json");
  writeFileSync(
    file,
    JSON.stringify({
      id: "pr-id",
      state: "OPEN",
      headRefOid: "head",
      baseRefName: "main",
      baseRefOid: "stored-base",
      baseRef: { target: { oid: "base" } },
      autoMergeRequest: { enabledAt: "now" },
      mergeQueueEntry: { id: "queue" },
      mergeCommit: null,
    })
  );
  const gh = join(dir, "gh");
  writeFileSync(
    gh,
    `#!${process.execPath}
import { readFileSync, writeFileSync } from 'node:fs';
import { fakeGitHub } from ${JSON.stringify(join(import.meta.dir, "shipping.test-helper.ts"))};
const state = JSON.parse(readFileSync(process.env.SHIPPING_STATE, 'utf8'));
const response = fakeGitHub(state, process.argv.slice(2));
writeFileSync(process.env.SHIPPING_STATE, JSON.stringify(state));
console.log(JSON.stringify(response));
`
  );
  chmodSync(gh, 0o755);
  const entry = join(dir, "entry.ts");
  writeFileSync(
    entry,
    `import { main } from ${JSON.stringify(join(import.meta.dir, "shipping-cli.ts"))}; process.exitCode = await main(process.argv.slice(2));`
  );
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [entry, ...args], {
      encoding: "utf8",
      timeout: 3000,
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        SHIPPING_STATE: file,
      },
    });
    return {
      status: result.status,
      output: object(JSON.parse(result.stdout), "CLI result"),
    };
  };
  try {
    body(run, file, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

it("the CLI inspects, saves, cancels both mechanisms, and reads back in fresh processes", () =>
  fixture((run, file, dir) => {
    const inspected = run("inspect", "--repo", "owner/repo", "--pr", "1");
    expect(inspected.status).toBe(0);
    expect(object(inspected.output.record, "record").revision).toEqual({
      context: { owner: "owner", repo: "repo", number: 1 },
      headRefOid: "head",
      baseRefName: "main",
      baseRefOid: "base",
    });
    const saved = join(dir, "record.json");
    writeFileSync(saved, JSON.stringify(inspected.output));
    const cancelled = run("cancel-pending", "--record", saved);
    expect(cancelled.status).toBe(0);
    expect(cancelled.output).toMatchObject({
      kind: "cancelled",
      record: { pending: { autoMerge: false, queueEntryId: null } },
    });
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({
      autoMergeRequest: null,
      mergeQueueEntry: null,
    });
  }));

it("the CLI refuses a changed base without cancelling anything", () =>
  fixture((run, file, dir) => {
    const inspected = run("inspect", "--repo", "owner/repo", "--pr", "1");
    const saved = join(dir, "record.json");
    writeFileSync(saved, JSON.stringify(inspected.output));
    const changed = {
      ...JSON.parse(readFileSync(file, "utf8")),
      baseRef: { target: { oid: "advanced" } },
    };
    writeFileSync(file, JSON.stringify(changed));
    const result = run("cancel-pending", "--record", saved);
    expect(result.status).toBe(1);
    expect(result.output.kind).toBe("changed");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(changed);
  }));

it("the CLI treats a missing queue field as unavailable", () =>
  fixture((run, file) => {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    delete raw.mergeQueueEntry;
    writeFileSync(file, JSON.stringify(raw));
    const result = run("inspect", "--repo", "owner/repo", "--pr", "1");
    expect(result.status).toBe(1);
    expect(result.output.kind).toBe("unavailable");
  }));

for (const state of ["CLOSED", "MERGED"]) {
  it(`the CLI inspects a ${state} PR with a deleted base and refuses cancellation`, () =>
    fixture((run, file, dir) => {
      const inspected = run("inspect", "--repo", "owner/repo", "--pr", "1");
      expect(inspected.status).toBe(0);
      const saved = join(dir, "record.json");
      writeFileSync(saved, JSON.stringify(inspected.output));
      const terminal = {
        ...JSON.parse(readFileSync(file, "utf8")),
        state,
        baseRef: null,
        autoMergeRequest: null,
        mergeQueueEntry: null,
        mergeCommit: state === "MERGED" ? { oid: "merged" } : null,
      };
      writeFileSync(file, JSON.stringify(terminal));
      const record = {
        state,
        revision: { baseRefOid: "stored-base" },
        mergeCommitOid: state === "MERGED" ? "merged" : null,
      };

      const observed = run("inspect", "--repo", "owner/repo", "--pr", "1");
      expect(observed.status).toBe(0);
      expect(observed.output).toMatchObject({ kind: "inspected", record });
      const cancelled = run("cancel-pending", "--record", saved);
      expect(cancelled.status).toBe(1);
      expect(cancelled.output).toMatchObject({ kind: "not-open", record });
      expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(terminal);
    }));
}
