import { afterEach, describe, expect, it } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  NotFoundError,
  UserError,
  openStore,
  parseVerdict,
  type Forge,
  type OpenStoreOptions,
  type Store,
} from "./store.ts";

const SCRIPT = join(import.meta.dir, "orch.ts");
const directories: string[] = [];
const handles: Store[] = [];

interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function makeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "orch-test-"));
  directories.push(directory);
  return directory;
}

function useStore(
  directory: string,
  options?: OpenStoreOptions
): Store {
  const store = openStore(directory, options);
  handles.push(store);
  return store;
}

async function initializedStore(): Promise<{
  readonly directory: string;
  readonly store: Store;
}> {
  const directory = await makeDirectory();
  const store = useStore(directory, {
    forgePaths: {
      gh: join(directory, "bin", "gh"),
      origin: join(directory, "bin", "origin"),
    },
  });
  await store.init();
  return { directory, store };
}

function git({
  args,
  repo,
}: {
  args: readonly string[];
  repo: string;
}): string {
  const result = Bun.spawnSync(["git", "-C", repo, ...args]);
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr.toString()}`
    );
  }
  return result.stdout.toString().trim();
}

async function makeGitStack(directory: string): Promise<{
  readonly repo: string;
  readonly mergedSha: string;
  readonly closedSha: string;
  readonly openSha: string;
  readonly draftSha: string;
}> {
  const repo = join(directory, "repo");
  await mkdir(repo);
  git({ repo, args: ["init", "--initial-branch=main"] });
  git({ repo, args: ["config", "user.name", "Orch Test"] });
  git({ repo, args: ["config", "user.email", "orch@example.com"] });
  git({
    repo,
    args: ["remote", "add", "origin", `https://github.com/${FIXTURE_REPOSITORY}.git`],
  });
  await writeFile(join(repo, "main.txt"), "main\n");
  git({ repo, args: ["add", "."] });
  git({ repo, args: ["commit", "-m", "main"] });

  const branches = [
    "stack/merged",
    "stack/closed",
    "stack/open",
    "stack/draft",
  ];
  for (const [index, branch] of branches.entries()) {
    git({ repo, args: ["checkout", "-b", branch] });
    await writeFile(join(repo, `stack-${index}.txt`), `${branch}\n`);
    git({ repo, args: ["add", "."] });
    git({ repo, args: ["commit", "-m", branch] });
  }
  git({ repo, args: ["checkout", "stack/open"] });

  return {
    repo,
    mergedSha: git({ repo, args: ["rev-parse", "stack/merged"] }),
    closedSha: git({ repo, args: ["rev-parse", "stack/closed"] }),
    openSha: git({ repo, args: ["rev-parse", "stack/open"] }),
    draftSha: git({ repo, args: ["rev-parse", "stack/draft"] }),
  };
}

type FixtureState = "open" | "draft" | "merged" | "closed";

const FIXTURE_REPOSITORY = "acme/widgets";

interface FixturePr {
  readonly number: number;
  readonly state: FixtureState;
  readonly head: string;
  readonly base: string;
  // The head repository as owner/name. Undefined takes the fixture's default
  // and null stands for a fork that has since been deleted.
  readonly repository?: string | null;
}

const FORGE_FIXTURES: Readonly<
  Record<
    Forge,
    {
      readonly fields: string;
      readonly listArgs: readonly string[];
      readonly row: (
        pr: FixturePr,
        repository: string
      ) => Record<string, unknown>;
    }
  >
> = {
  gh: {
    fields: "number,state,headRefName,baseRefName,headRepository,headRepositoryOwner",
    listArgs: ["--limit", "1000"],
    row: ({ number, state, head, base, repository }, fallback) => ({
      number,
      state: state === "draft" ? "OPEN" : state.toUpperCase(),
      headRefName: head,
      baseRefName: base,
      headRepository:
        repository === null
          ? null
          : { id: "R_fixture", name: (repository ?? fallback).split("/")[1] },
      headRepositoryOwner:
        repository === null
          ? null
          : { login: (repository ?? fallback).split("/")[0] },
    }),
  },
  origin: {
    fields: "number,status,headRef,baseRef",
    listArgs: [],
    row: ({ number, state, head, base }) => ({
      number,
      status: state,
      headRef: head,
      baseRef: base,
    }),
  },
};

function forgeRows(
  forge: Forge,
  prs: readonly FixturePr[],
  repository = FIXTURE_REPOSITORY
): string {
  return JSON.stringify(
    prs.map((pr) => FORGE_FIXTURES[forge].row(pr, repository))
  );
}

async function withFakeForge<T>({
  directory,
  forge,
  operation,
  currentRows,
  repository = FIXTURE_REPOSITORY,
}: {
  directory: string;
  forge: Forge;
  operation: () => Promise<T>;
  currentRows?: string;
  repository?: string;
}): Promise<T> {
  const bin = join(directory, "bin");
  const outputPath = join(directory, "forge-output.txt");
  await mkdir(bin, { recursive: true });
  await writeFile(
    outputPath,
    `${
      currentRows ??
      forgeRows(
        forge,
        [
          {
            number: 11,
            state: "open",
            head: "stack/open",
            base: "stack/closed",
          },
        ],
        repository
      )
    }\n`
  );
  const { fields, listArgs } = FORGE_FIXTURES[forge];
  const list = (filter: string, branch: string): string =>
    [
      "pr",
      "list",
      filter,
      branch,
      "--state",
      "all",
      ...listArgs,
      "--json",
      fields,
    ].join(" ");
  const fake = join(bin, forge);
  await writeFile(
    fake,
    `#!/usr/bin/env bash
set -euo pipefail
if [ "$(pwd -P)" != "${realpathSync(join(directory, "repo"))}" ]; then
  printf '${forge} ran outside the fixture repo: %s\\n' "$(pwd -P)" >&2
  exit 2
fi
case "$*" in
  "${list("--head", "stack/open")}")
    cat "${outputPath}"
    ;;
  "${list("--head", "stack/closed")}")
    printf '%s\\n' '${forgeRows(forge, [{ number: 13, state: "closed", head: "stack/closed", base: "stack/merged" }], repository)}'
    ;;
  "${list("--head", "stack/merged")}")
    printf '%s\\n' '${forgeRows(forge, [{ number: 10, state: "merged", head: "stack/merged", base: "main" }], repository)}'
    ;;
  "${list("--base", "stack/open")}")
    printf '%s\\n' '${forgeRows(
      forge,
      [
        { number: 14, state: "draft", head: "stack/draft", base: "stack/open" },
        {
          number: 15,
          state: "closed",
          head: "stack/abandoned",
          base: "stack/open",
        },
      ],
      repository
    )}'
    ;;
  "${list("--base", "stack/draft")}")
    printf '[]\\n'
    ;;
  *)
    printf 'unexpected ${forge} arguments: %s\\n' "$*" >&2
    exit 2
    ;;
esac
`
  );
  await chmod(fake, 0o755);
  return operation();
}

function runCli(
  args: readonly string[],
  env?: Readonly<Record<string, string | undefined>>
): RunResult {
  const result = Bun.spawnSync([process.execPath, SCRIPT, ...args], { env });
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

async function plantStaleLock(directory: string): Promise<number> {
  const exited = Bun.spawn(["true"]);
  await exited.exited;
  await writeFile(join(directory, ".orch.lock"), `${exited.pid}\n`);
  return exited.pid;
}

function spawnWriter({
  directory,
  flags,
  name,
  force = false,
  before = "",
  atLockUnlink = "",
  patch = "",
  killAfterLockCall = 0,
}: {
  directory: string;
  flags: string;
  name: string;
  force?: boolean;
  before?: string;
  atLockUnlink?: string;
  patch?: string;
  killAfterLockCall?: number;
}) {
  const script = `
const { existsSync, rmSync, writeFileSync } = require("node:fs");
const promises = require("node:fs/promises");
const flag = (suffix) => ${JSON.stringify(`${flags}/${name}.`)} + suffix;
const peer = (suffix) => existsSync(${JSON.stringify(`${flags}/`)} + suffix);
const lock = ${JSON.stringify(join(directory, ".orch.lock"))};
const spin = (ready) => {
  const deadline = Date.now() + 4000;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error("barrier timeout");
  }
};
const unlink = promises.unlink;
let reached = false;
promises.unlink = async (path) => {
  if (!reached && path === lock) {
    reached = true;
    ${atLockUnlink}
  }
  return unlink(path);
};
${patch}
let lockCalls = 0;
for (const [call, run] of Object.entries(promises)) {
  if (typeof run !== "function") continue;
  promises[call] = async (...args) => {
    try {
      return await run(...args);
    } finally {
      if (args.slice(0, 2).some((path) => String(path).startsWith(lock))) {
        lockCalls += 1;
        if (lockCalls === ${killAfterLockCall}) process.kill(process.pid, "SIGKILL");
      }
    }
  };
}
const { openStore } = await import(${JSON.stringify(join(import.meta.dir, "store.ts"))});
const store = openStore(${JSON.stringify(directory)}, { force: ${force} });
${before}
try {
  await store.units.add({ id: "${name}-unit", track: "race" });
  writeFileSync(flag("held"), "");
} catch (error) {
  writeFileSync(flag("refused"), error.message);
}
await store.close();
`;
  return Bun.spawn([process.execPath, "-e", script], { stderr: "pipe" });
}

async function readFlags(
  flags: string
): Promise<Readonly<Record<string, string>>> {
  const entries = await Promise.all(
    (await readdir(flags)).map(async (name) => [
      name,
      await readFile(join(flags, name), "utf8"),
    ])
  );
  return Object.fromEntries(entries);
}

async function lockFiles(directory: string): Promise<readonly string[]> {
  return (await readdir(directory))
    .filter((name) => name.startsWith(".orch.lock"))
    .sort();
}

afterEach(async () => {
  for (const store of handles.splice(0).reverse()) {
    await store.close();
  }
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("Store", () => {
  it("initializes an idempotent plain-file store and releases its lock", async () => {
    const directory = await makeDirectory();
    const store = useStore(directory);

    expect(await store.init()).toEqual({ store: directory });
    const firstUnits = await readFile(join(directory, "units.tsv"), "utf8");
    const firstLedger = await readFile(
      join(directory, "ledger.tsv"),
      "utf8"
    );

    expect(await store.init()).toEqual({ store: directory });
    expect(await readFile(join(directory, "units.tsv"), "utf8")).toBe(
      firstUnits
    );
    expect(await readFile(join(directory, "ledger.tsv"), "utf8")).toBe(
      firstLedger
    );
    expect((await readdir(directory)).sort()).toEqual([
      ".orch.lock",
      "frontier.json",
      "gates.md",
      "inbox",
      "ledger.tsv",
      "preferences.md",
      "units.tsv",
    ]);

    await store.close();
    expect(await readdir(directory)).not.toContain(".orch.lock");
  });

  it("composes unit add, set, get, list, and counts", async () => {
    const { store } = await initializedStore();

    expect(
      await store.units.add({
        id: "u1",
        track: "build",
        brief: "briefs/u1.md",
      })
    ).toMatchObject({ id: "u1", state: "pending" });
    expect(
      await store.units.add({ id: "=SUM(A1)", track: "+build" })
    ).toMatchObject({ id: "=SUM(A1)", track: "+build" });

    const updated = await store.units.set({
      id: "u1",
      state: "done",
      branch: "poteto/u1",
      pr: 184530,
      sha: "abc123",
    });
    expect(updated).toEqual({
      id: "u1",
      track: "build",
      state: "done",
      branch: "poteto/u1",
      pr: "184530",
      sha: "abc123",
      brief: "briefs/u1.md",
    });
    expect(await store.units.get("u1")).toEqual(updated);
    expect(
      await store.units.list({ state: "done", track: "build" })
    ).toEqual([updated]);
    expect(await store.units.counts()).toEqual({ done: 1, pending: 1 });
    await expect(
      store.units.add({ id: "u1", track: "build" })
    ).rejects.toThrow("unit u1 already exists");
    await expect(
      store.units.set({ id: "missing", state: "done" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("records, replaces, checks, and summarizes typed ledger verdicts", async () => {
    const { store } = await initializedStore();

    try {
      await store.ledger.check({ pr: 184530, sha: "abc123" });
      throw new Error("expected ledger check to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundError);
      if (error instanceof NotFoundError) {
        expect(error.output).toEqual({
          compact: "NOT-VERIFIED",
          json: {
            pr: "184530",
            sha: "abc123",
            verdict: "NOT-VERIFIED",
          },
        });
      }
    }
    expect(() => parseVerdict("looks-good")).toThrow("verdict must be");

    const recorded = await store.ledger.record({
      pr: 184530,
      sha: "abc123",
      verdict: "unit-test-verified",
      evidence: "reports/verify.md",
      verifier: "opus",
    });
    expect(await store.ledger.check({ pr: 184530, sha: "abc123" })).toEqual(
      recorded
    );
    expect(await store.ledger.summary()).toEqual({
      "unit-test-verified": 1,
    });

    await store.ledger.record({
      pr: 184530,
      sha: "abc123",
      verdict: "live-ui-verified",
      evidence: "reports/live.md",
    });
    expect(await store.ledger.summary()).toEqual({
      "live-ui-verified": 1,
    });
  });

  it("pushes, peeks, and atomically drains inbox pointers", async () => {
    const { directory, store } = await initializedStore();

    const first = await store.inbox.push({
      agent: "worker-1",
      unit: "u1",
      status: "done",
      report: "reports/u1.md",
    });
    expect(first.pointer).toMatchObject({ unit: "u1", status: "done" });
    expect(first.filename).toEndWith(".tsv");
    await store.inbox.push({
      agent: "worker-2",
      unit: "u2",
      status: "failed",
    });

    expect(await store.inbox.count()).toBe(2);
    expect(await store.inbox.peek()).toHaveLength(2);
    expect(await store.inbox.count()).toBe(2);
    expect(await store.inbox.drain()).toHaveLength(2);
    expect(await store.inbox.count()).toBe(0);
    expect(await readdir(join(directory, "inbox"))).toEqual([]);
    expect(
      (await readdir(directory)).filter((name) =>
        name.startsWith(".inbox-drain-")
      )
    ).toEqual([]);
  });

  it("replaces a stale lock whose holder pid is dead", async () => {
    const { directory } = await initializedStore();
    const exited = Bun.spawn(["true"]);
    await exited.exited;
    await writeFile(join(directory, ".orch.lock"), `${exited.pid}\n`);

    const stale: string[] = [];
    const recovered = useStore(directory, {
      onStaleLock: (holder) => stale.push(holder),
    });
    expect(
      await recovered.units.add({ id: "u1", track: "build" })
    ).toMatchObject({ id: "u1" });
    expect(stale).toEqual([String(exited.pid)]);
    await recovered.close();
    expect(
      (await readdir(directory)).filter((name) =>
        name.startsWith(".orch.lock")
      )
    ).toEqual([]);
  });

  it("lets only one of two writers racing for a stale lock replace it", async () => {
    const { directory, store } = await initializedStore();
    await store.close();
    const exited = Bun.spawn(["true"]);
    await exited.exited;
    await writeFile(join(directory, ".orch.lock"), `${exited.pid}\n`);
    const flags = await makeDirectory();

    const worker = ({
      name,
      beforeTakeover,
      beforeClose,
    }: {
      name: string;
      beforeTakeover: string;
      beforeClose: string;
    }) => `
const { openStore } = await import(${JSON.stringify(join(import.meta.dir, "store.ts"))});
const { existsSync, readFileSync, writeFileSync } = await import("node:fs");
const flag = (suffix) => ${JSON.stringify(`${flags}/`)} + suffix;
const spin = (ready) => {
  const deadline = Date.now() + 5000;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error("barrier timeout");
  }
};
const lockHolds = (pid) => {
  try {
    return readFileSync(${JSON.stringify(join(directory, ".orch.lock"))}, "utf8").trim() === pid;
  } catch {
    return false;
  }
};
const store = openStore(${JSON.stringify(directory)}, {
  onStaleLock: () => {
    writeFileSync(flag("${name}.saw-stale"), "");
    ${beforeTakeover}
  },
});
writeFileSync(flag("${name}.pid"), String(process.pid));
try {
  await store.units.add({ id: "${name}-unit", track: "race" });
  writeFileSync(flag("${name}.held"), "");
} catch (error) {
  writeFileSync(flag("${name}.refused"), error.message);
}
${beforeClose}
await store.close();
`;
    const run = (script: string) =>
      Bun.spawn([process.execPath, "-e", script], { stderr: "pipe" });
    const a = run(
      worker({
        name: "A",
        beforeTakeover: `spin(() => existsSync(flag("B.saw-stale")));`,
        beforeClose: `spin(() => existsSync(flag("B.held")) || existsSync(flag("B.refused")));`,
      })
    );
    const b = run(
      worker({
        name: "B",
        beforeTakeover: `spin(() => existsSync(flag("A.saw-stale")));
    spin(() => lockHolds(readFileSync(flag("A.pid"), "utf8")));`,
        beforeClose: "",
      })
    );
    expect(await Promise.all([a.exited, b.exited])).toEqual([0, 0]);
    expect(await new Response(a.stderr).text()).toBe("");
    expect(await new Response(b.stderr).text()).toBe("");

    const outcomes = (await readdir(flags))
      .filter((name) => /\.(held|refused)$/.test(name))
      .sort();
    expect(outcomes).toEqual(["A.held", "B.refused"]);
    expect(await readFile(join(flags, "B.refused"), "utf8")).toMatch(
      /^store lock held by pid /
    );
    expect(await readFile(join(directory, "units.tsv"), "utf8")).toBe(
      "id\ttrack\tstate\tbranch\tpr\tsha\tbrief\nA-unit\trace\tpending\t\t\t\t\n"
    );
    expect(
      (await readdir(directory)).filter((name) =>
        name.startsWith(".orch.lock")
      )
    ).toEqual([]);
  });

  it("refuses a stale lock another writer is replacing, forced or not", async () => {
    const { directory, store } = await initializedStore();
    await store.close();
    const stale = await plantStaleLock(directory);
    await mkdir(join(directory, ".orch.lock.takeover"));
    await writeFile(
      join(directory, ".orch.lock.takeover", String(process.pid)),
      ""
    );

    for (const force of [false, true]) {
      await expect(
        useStore(directory, { force }).units.add({ id: "u1", track: "build" })
      ).rejects.toThrow(
        `store lock held by pid ${stale} is being replaced by another writer; retry`
      );
    }
    expect(await lockFiles(directory)).toEqual([
      ".orch.lock",
      ".orch.lock.takeover",
    ]);
  });

  it("refuses a forced writer that arrives while another writer is replacing a stale lock", async () => {
    const { directory, store } = await initializedStore();
    await store.close();
    const stale = await plantStaleLock(directory);
    const flags = await makeDirectory();

    const a = spawnWriter({
      directory,
      flags,
      name: "A",
      atLockUnlink: `writeFileSync(flag("replacing"), "");
    spin(() => peer("F.held") || peer("F.refused"));`,
    });
    const f = spawnWriter({
      directory,
      flags,
      name: "F",
      force: true,
      before: `spin(() => peer("A.replacing"));`,
    });
    expect(await Promise.all([a.exited, f.exited])).toEqual([0, 0]);
    expect(await new Response(a.stderr).text()).toBe("");
    expect(await new Response(f.stderr).text()).toBe("");

    expect(await readFlags(flags)).toEqual({
      "A.replacing": "",
      "A.held": "",
      "F.refused": `store lock held by pid ${stale} is being replaced by another writer; retry`,
    });
    expect(await readFile(join(directory, "units.tsv"), "utf8")).toBe(
      "id\ttrack\tstate\tbranch\tpr\tsha\tbrief\nA-unit\trace\tpending\t\t\t\t\n"
    );
    expect(await lockFiles(directory)).toEqual([]);
  });

  it("refuses a forced writer that arrives while the holder's release is between its read and its unlink", async () => {
    const { directory, store } = await initializedStore();
    await store.close();
    const flags = await makeDirectory();

    const a = spawnWriter({
      directory,
      flags,
      name: "A",
      atLockUnlink: `writeFileSync(flag("releasing"), "");
    spin(() => peer("F.held") || peer("F.refused"));`,
    });
    const f = spawnWriter({
      directory,
      flags,
      name: "F",
      force: true,
      before: `spin(() => peer("A.releasing"));`,
    });
    expect(await Promise.all([a.exited, f.exited])).toEqual([0, 0]);
    expect(await new Response(a.stderr).text()).toBe("");
    expect(await new Response(f.stderr).text()).toBe("");

    expect(await readFlags(flags)).toEqual({
      "A.releasing": "",
      "A.held": "",
      "F.refused": `store lock held by pid ${a.pid} is being replaced by another writer; retry`,
    });
    expect(await readFile(join(directory, "units.tsv"), "utf8")).toBe(
      "id\ttrack\tstate\tbranch\tpr\tsha\tbrief\nA-unit\trace\tpending\t\t\t\t\n"
    );
    expect(await lockFiles(directory)).toEqual([]);
  });

  it("replaces a stale lock after a writer was killed while replacing it", async () => {
    const { directory, store } = await initializedStore();
    await store.close();
    await plantStaleLock(directory);

    const killed = spawnWriter({
      directory,
      flags: await makeDirectory(),
      name: "A",
      atLockUnlink: `process.kill(process.pid, "SIGKILL");`,
    });
    await killed.exited;
    expect(killed.signalCode).toBe("SIGKILL");
    expect(await lockFiles(directory)).toEqual([
      ".orch.lock",
      ".orch.lock.takeover",
    ]);

    const recovered = useStore(directory);
    expect(
      await recovered.units.add({ id: "u1", track: "build" })
    ).toMatchObject({ id: "u1" });
    await recovered.close();
    expect(await lockFiles(directory)).toEqual([]);
  });

  it("leaves a live claim alone when a writer that saw only a dead claimant resumes", async () => {
    const { directory, store } = await initializedStore();
    await store.close();
    const stale = await plantStaleLock(directory);
    await mkdir(join(directory, ".orch.lock.takeover"));
    await writeFile(join(directory, ".orch.lock.takeover", String(stale)), "");
    const flags = await makeDirectory();

    const b = spawnWriter({
      directory,
      flags,
      name: "B",
      patch: `const { readdir } = promises;
promises.readdir = async (path) => {
  const claimants = await readdir(path);
  if (path === lock + ".takeover") {
    writeFileSync(flag("saw-dead-claimant"), "");
    spin(() => peer("C.replacing"));
  }
  return claimants;
};`,
    });
    const c = spawnWriter({
      directory,
      flags,
      name: "C",
      before: `spin(() => peer("B.saw-dead-claimant"));`,
      atLockUnlink: `writeFileSync(flag("replacing"), "");
    spin(() => peer("B.held") || peer("B.refused"));`,
    });
    expect(await Promise.all([b.exited, c.exited])).toEqual([0, 0]);
    expect(await new Response(b.stderr).text()).toBe("");
    expect(await new Response(c.stderr).text()).toBe("");

    expect(await readFlags(flags)).toEqual({
      "B.saw-dead-claimant": "",
      "B.refused": `store lock held by pid ${stale} is being replaced by another writer; retry`,
      "C.replacing": "",
      "C.held": "",
    });
    expect(await readFile(join(directory, "units.tsv"), "utf8")).toBe(
      "id\ttrack\tstate\tbranch\tpr\tsha\tbrief\nC-unit\trace\tpending\t\t\t\t\n"
    );
    expect(await lockFiles(directory)).toEqual([]);
  });

  it("replaces a stale lock that disappears before it is removed", async () => {
    const { directory, store } = await initializedStore();
    await store.close();
    await plantStaleLock(directory);
    const flags = await makeDirectory();

    const writer = spawnWriter({
      directory,
      flags,
      name: "A",
      atLockUnlink: `rmSync(lock);
    writeFileSync(flag("lock-gone"), "");`,
    });
    expect(await writer.exited).toBe(0);
    expect(await new Response(writer.stderr).text()).toBe("");
    expect(await readFlags(flags)).toEqual({ "A.held": "", "A.lock-gone": "" });
    expect(await lockFiles(directory)).toEqual([]);
  });

  it.each([
    ["no lock", false],
    ["a stale lock", true],
  ])(
    "lets the next writer in after a writer that found %s is killed at any step of taking or releasing it",
    async (_found, stale) => {
      const { directory, store } = await initializedStore();
      await store.close();
      const flags = await makeDirectory();

      let kills = 0;
      for (;;) {
        if (stale) {
          await plantStaleLock(directory);
        }
        const writer = spawnWriter({
          directory,
          flags,
          name: `w${kills}`,
          killAfterLockCall: kills + 1,
        });
        await writer.exited;
        if (writer.signalCode !== "SIGKILL") {
          expect(await new Response(writer.stderr).text()).toBe("");
          expect(writer.exitCode).toBe(0);
          break;
        }
        kills += 1;
        const id = `after-kill-${kills}`;
        const next = useStore(directory);
        expect(await next.units.add({ id, track: "build" })).toMatchObject({
          id,
        });
        await next.close();
      }
      expect(kills).toBeGreaterThan(2);
    },
    60_000
  );

  it("takes the lock with an exclusive open where hard links are unsupported", async () => {
    const { directory, store } = await initializedStore();
    await store.close();
    const flags = await makeDirectory();
    const lock = join(directory, ".orch.lock");
    const patch = `promises.link = async () => {
  throw Object.assign(new Error("no hard links"), { code: "ENOTSUP" });
};`;

    await writeFile(lock, `${process.pid}\n`);
    const blocked = spawnWriter({ directory, flags, name: "B", patch });
    expect(await blocked.exited).toBe(0);
    expect(await readFlags(flags)).toEqual({
      "B.refused": `store lock held by pid ${process.pid}`,
    });
    expect(await readFile(lock, "utf8")).toBe(`${process.pid}\n`);

    await rm(lock);
    const writer = spawnWriter({ directory, flags, name: "A", patch });
    expect(await writer.exited).toBe(0);
    expect(await new Response(writer.stderr).text()).toBe("");
    expect(await readFlags(flags)).toMatchObject({ "A.held": "" });
    expect(await lockFiles(directory)).toEqual([]);
  });

  it.each([
    ["no lock", false],
    ["a stale lock", true],
  ])("takes the lock when it finds %s and the writer that beats it to the create releases before its pid is read", async (_found, stale) => {
    const { directory, store } = await initializedStore();
    await store.close();
    if (stale) {
      await plantStaleLock(directory);
    }
    const flags = await makeDirectory();

    const writer = spawnWriter({
      directory,
      flags,
      name: "A",
      patch: `const { link, readFile } = promises;
let rival = "absent";
promises.link = async (from, to) => {
  if (rival === "absent" && !existsSync(lock)) {
    rival = "holding";
    writeFileSync(lock, "1\\n");
  }
  return link(from, to);
};
promises.readFile = async (path, ...rest) => {
  if (rival === "holding" && path === lock) {
    rival = "released";
    rmSync(lock);
    writeFileSync(flag("rival-released"), "");
  }
  return readFile(path, ...rest);
};`,
    });
    expect(await writer.exited).toBe(0);
    expect(await new Response(writer.stderr).text()).toBe("");
    expect(await readFlags(flags)).toEqual({
      "A.rival-released": "",
      "A.held": "",
    });
    expect(await lockFiles(directory)).toEqual([]);
  });

  it("reports a lock it can never read as held by an unknown pid", async () => {
    const { directory, store } = await initializedStore();
    await store.close();
    await symlink(join(directory, "missing"), join(directory, ".orch.lock"));

    await expect(
      useStore(directory).units.add({ id: "u1", track: "build" })
    ).rejects.toThrow("store lock held by pid unknown");
  });

  it("blocks a writer and steals the pid lock only with force", async () => {
    const { directory, store } = await initializedStore();
    await store.close();
    await writeFile(join(directory, ".orch.lock"), `${process.pid}\n`);

    const blocked = useStore(directory);
    await expect(
      blocked.units.add({ id: "u1", track: "build" })
    ).rejects.toThrow(`store lock held by pid ${process.pid}`);

    const stolen: string[] = [];
    const forced = useStore(directory, {
      force: true,
      onLockStolen: (holder) => stolen.push(holder),
    });
    expect(
      await forced.units.add({ id: "u1", track: "build" })
    ).toMatchObject({ id: "u1" });
    expect(stolen).toEqual([String(process.pid)]);
    await forced.close();
    expect(await readdir(directory)).not.toContain(".orch.lock");
  });

  it("parks gates, stores standing orders, and renders status", async () => {
    const { directory, store } = await initializedStore();
    await store.units.add({ id: "u1", track: "build" });
    expect(
      await store.gates.park({
        id: "release",
        question: "Ship now?",
        options: "ship,wait",
        defaultAnswer: "wait",
      })
    ).toMatchObject({ kind: "open", id: "release" });
    expect(
      await store.standing.add({ line: "Never force push." })
    ).toEqual({ number: 1, line: "Never force push." });

    const first = await store.status.render();
    expect(first.changed).toBe("first render");
    expect(first.summary.openGateIds).toEqual(["release"]);
    expect(await readFile(join(directory, "status.md"), "utf8")).toContain(
      "| release | open | Ship now? |"
    );
    expect((await store.status.render()).changed).toBe("no derived changes");

    expect(
      await store.gates.resolve({ id: "release", answer: "ship" })
    ).toMatchObject({ kind: "resolved", answer: "ship" });
    expect((await store.status.render()).changed).toBe("open gates 1->0");
    expect(await store.gates.list()).toEqual([]);
    expect(await store.standing.show()).toEqual([
      { number: 1, line: "Never force push." },
    ]);
  });

  for (const forge of ["gh", "origin"] as const) {
    it(`resolves the ordered frontier from the ${forge} base chain and validates an optional pin`, async () => {
      const { directory, store } = await initializedStore();
      const stack = await makeGitStack(directory);
      const forgeParams = forge === "gh" ? {} : { forge };

      await withFakeForge({
        directory,
        forge,
        operation: async () => {
          expect(
            await store.frontier.set({ repo: stack.repo, ...forgeParams })
          ).toEqual({
            generation: 1,
            prs: [
              {
                pr: 10,
                branches: "stack/merged",
                sha: stack.mergedSha,
                state: "MERGED",
              },
              {
                pr: 13,
                branches: "stack/closed",
                sha: stack.closedSha,
                state: "CLOSED",
              },
              {
                pr: 11,
                branches: "stack/open",
                sha: stack.openSha,
                state: "OPEN",
              },
              {
                pr: 14,
                branches: "stack/draft",
                sha: stack.draftSha,
                state: "OPEN",
              },
            ],
            lowestUnmerged: 11,
          });
          expect(
            (
              await store.frontier.set({
                repo: stack.repo,
                ...forgeParams,
                prs: [10, 13, 11, 14],
              })
            ).generation
          ).toBe(2);
          expect((await store.frontier.show()).generation).toBe(2);
          await expect(
            store.frontier.set({
              repo: stack.repo,
              ...forgeParams,
              prs: [10, 11, 12],
            })
          ).rejects.toThrow(
            "frontier pin mismatch: missing from resolved chain: 12; extra in resolved chain: 13,14"
          );
          await expect(
            store.frontier.set({
              repo: stack.repo,
              ...forgeParams,
              prs: [13, 10, 11, 14],
            })
          ).rejects.toThrow(
            "frontier pin mismatch: order differs: expected 13,10,11,14; resolved 10,13,11,14"
          );
          await expect(
            store.frontier.set({
              repo: stack.repo,
              ...forgeParams,
              prs: [10, 10],
            })
          ).rejects.toThrow("--prs must not contain duplicates");
        },
      });
    });

    it(`resolves a replacement ${forge} PR alongside closed branch history`, async () => {
      for (const historicalState of ["closed", "merged"] as const) {
        const { directory, store } = await initializedStore();
        const stack = await makeGitStack(directory);
        await withFakeForge({
          directory, forge,
          currentRows: forgeRows(forge, [
            { number: 9, state: historicalState, head: "stack/open", base: "main" },
            { number: 11, state: "open", head: "stack/open", base: "stack/closed" },
          ]),
          operation: async () => {
            const frontier = await store.frontier.set({ repo: stack.repo, forge });
            expect(frontier.prs.map((row) => row.pr)).toEqual([10, 13, 11, 14]);
            expect(frontier.lowestUnmerged).toBe(11);
          },
        });
      }
    });

    it(`still rejects multiple active ${forge} PRs on one branch`, async () => {
      const { directory, store } = await initializedStore();
      const stack = await makeGitStack(directory);
      await withFakeForge({
        directory, forge,
        currentRows: forgeRows(forge, [
          { number: 11, state: "open", head: "stack/open", base: "stack/closed" },
          { number: 12, state: "open", head: "stack/open", base: "main" },
        ]),
        operation: async () => {
          await expect(store.frontier.set({ repo: stack.repo, forge })).rejects.toThrow("multiple pull requests");
        },
      });
    });

    it(`rejects unparseable ${forge} output loudly`, async () => {
      const { directory, store } = await initializedStore();
      const stack = await makeGitStack(directory);

      await withFakeForge({
        directory,
        forge,
        currentRows: "this line is not forge output",
        operation: async () => {
          await expect(
            store.frontier.set({ repo: stack.repo, forge })
          ).rejects.toThrow(
            `${forge} pr list --head stack/open output is not valid JSON`
          );
        },
      });
    });
  }

  it("leaves pull requests whose head is in another repository out of the gh chain", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);

    await withFakeForge({
      directory,
      forge: "gh",
      currentRows: forgeRows("gh", [
        { number: 11, state: "open", head: "stack/open", base: "stack/closed" },
        {
          number: 99,
          state: "open",
          head: "stack/open",
          base: "main",
          repository: "mallory/widgets",
        },
        {
          number: 98,
          state: "closed",
          head: "stack/open",
          base: "main",
          repository: null,
        },
      ]),
      operation: async () => {
        const { prs } = await store.frontier.set({ repo: stack.repo });
        expect(prs.map((row) => row.pr)).toEqual([10, 13, 11, 14]);
      },
    });
  });

  it.each([undefined, null, {}, { login: "" }, { login: 1 }])(
    "rejects a gh head repository with a malformed owner %j",
    async (owner) => {
      const { directory, store } = await initializedStore();
      const stack = await makeGitStack(directory);
      await withFakeForge({
        directory,
        forge: "gh",
        currentRows: JSON.stringify([
          {
            number: 11,
            state: "OPEN",
            headRefName: "stack/open",
            baseRefName: "main",
            headRepository: { id: "R_fixture", name: "widgets" },
            headRepositoryOwner: owner,
          },
        ]),
        operation: async () => {
          await expect(store.frontier.set({ repo: stack.repo })).rejects.toThrow(
            "gh pr list --head stack/open output has an invalid PR row"
          );
        },
      });
    }
  );

  it("names the pull requests it left out when a chain branch has only those", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);

    await withFakeForge({
      directory,
      forge: "gh",
      currentRows: forgeRows("gh", [
        {
          number: 99,
          state: "open",
          head: "stack/open",
          base: "main",
          repository: "mallory/widgets",
        },
        {
          number: 98,
          state: "closed",
          head: "stack/open",
          base: "main",
          repository: null,
        },
      ]),
      operation: async () => {
        await expect(store.frontier.set({ repo: stack.repo })).rejects.toThrow(
          "branch stack/open has no pull request from acme/widgets (ignored #99 from mallory/widgets, #98 from a deleted repository); open one with gh pr create"
        );
      },
    });
  });

  it("keeps a stack pushed from a fork by matching the remote the branch pushes to", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);
    git({
      repo: stack.repo,
      args: ["remote", "add", "fork", "git@github.com:Me/Widgets.git"],
    });
    git({ repo: stack.repo, args: ["config", "remote.pushDefault", "origin"] });
    git({
      repo: stack.repo,
      args: ["config", "branch.stack/open.pushRemote", "fork"],
    });

    await withFakeForge({
      directory,
      forge: "gh",
      repository: "me/widgets",
      currentRows: forgeRows(
        "gh",
        [
          {
            number: 11,
            state: "open",
            head: "stack/open",
            base: "stack/closed",
          },
          {
            number: 97,
            state: "open",
            head: "stack/open",
            base: "main",
            repository: FIXTURE_REPOSITORY,
          },
        ],
        "me/widgets"
      ),
      operation: async () => {
        const { prs } = await store.frontier.set({ repo: stack.repo });
        expect(prs.map((row) => row.pr)).toEqual([10, 13, 11, 14]);
      },
    });
  });

  it("rejects a gh chain from a checkout whose branch has no push remote", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);
    git({ repo: stack.repo, args: ["remote", "remove", "origin"] });

    await withFakeForge({
      directory,
      forge: "gh",
      operation: async () => {
        await expect(store.frontier.set({ repo: stack.repo })).rejects.toThrow(
          "branch stack/open has no push remote (remote origin has no URL)"
        );
      },
    });
  });

  it("names the missing pull request when a chain branch has none", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);

    await withFakeForge({
      directory,
      forge: "gh",
      currentRows: "[]",
      operation: async () => {
        await expect(store.frontier.set({ repo: stack.repo })).rejects.toThrow(
          "branch stack/open has no pull request; open one with gh pr create"
        );
      },
    });
  });

  it("pins a branch head when a same-named tag points to another commit", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);
    git({
      repo: stack.repo,
      args: ["tag", "stack/open", stack.mergedSha],
    });

    await withFakeForge({
      directory,
      forge: "gh",
      operation: async () => {
        const frontier = await store.frontier.set({ repo: stack.repo });
        expect(frontier.prs.map((row) => [row.branches, row.sha])).toEqual([
          ["stack/merged", stack.mergedSha],
          ["stack/closed", stack.closedSha],
          ["stack/open", stack.openSha],
          ["stack/draft", stack.draftSha],
        ]);
        expect(await store.frontier.show()).toEqual(frontier);
      },
    });
  });

  it("rejects a tag without its branch and preserves the saved frontier", async () => {
    const { directory, store } = await initializedStore();
    const stack = await makeGitStack(directory);

    await withFakeForge({
      directory,
      forge: "gh",
      operation: async () => {
        const before = await store.frontier.set({ repo: stack.repo });
        git({
          repo: stack.repo,
          args: ["tag", "stack/merged", stack.mergedSha],
        });
        git({ repo: stack.repo, args: ["branch", "-D", "stack/merged"] });

        await expect(
          store.frontier.set({ repo: stack.repo })
        ).rejects.toThrow("git rev-parse");
        expect(await store.frontier.show()).toEqual(before);
        expect(before.generation).toBe(1);
      },
    });
  });

  it("rejects malformed TSV, verdict, frontier, and inbox data", async () => {
    const { directory, store } = await initializedStore();

    await writeFile(join(directory, "units.tsv"), "wrong\n");
    await expect(store.units.list()).rejects.toThrow(
      "units.tsv has an invalid header"
    );
    await writeFile(
      join(directory, "units.tsv"),
      "id\ttrack\tstate\tbranch\tpr\tsha\tbrief\nshort\trow\n"
    );
    await expect(store.units.list()).rejects.toThrow(
      "units.tsv has a malformed row"
    );

    await writeFile(
      join(directory, "ledger.tsv"),
      "pr\tsha\tverdict\tevidence\tverifier\tts\n1\tsha\tinvalid\treport\tme\tnow\n"
    );
    await expect(store.ledger.summary()).rejects.toThrow(
      "ledger.tsv has invalid verdict invalid"
    );

    await writeFile(join(directory, "frontier.json"), '{"generation":"1"}\n');
    await expect(store.frontier.show()).rejects.toThrow(
      "frontier.json has an invalid shape"
    );

    await writeFile(join(directory, "inbox", "bad.tsv"), "too\tshort\n");
    await expect(store.inbox.peek()).rejects.toThrow(
      "inbox pointer bad.tsv is malformed"
    );
  });

  it("rejects operations after close", async () => {
    const { store } = await initializedStore();
    await store.close();
    await expect(store.units.list()).rejects.toThrow("store is closed");
    await expect(store.status.render()).rejects.toBeInstanceOf(UserError);
  });
});

describe("orch CLI", () => {
  it("prints commander help and rejects invalid parsing with exit 1", async () => {
    const help = runCli(["--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Commands:");
    expect(help.stdout).toContain("unit");
    expect(help.stdout).toContain("ledger");

    const frontierHelp = runCli(["frontier", "set", "--help"]);
    expect(frontierHelp.code).toBe(0);
    expect(frontierHelp.stdout).toContain("--repo <dir>");
    expect(frontierHelp.stdout).toContain("--forge <forge>");
    expect(frontierHelp.stdout).toContain("--prs <n,...>");

    const directory = await makeDirectory();
    const invalid = runCli(["--store", directory, "unit", "add", "u1"]);
    expect(invalid.code).toBe(1);
    expect(invalid.stderr).toContain("required option '--track <track>'");

    const badForge = runCli([
      "--store",
      directory,
      "frontier",
      "set",
      "--repo",
      directory,
      "--forge",
      "gt",
    ]);
    expect(badForge.code).toBe(1);
    expect(badForge.stderr).toContain("Allowed choices are gh, origin");
  });

  it("accepts ORCH_STORE and emits complete JSON", async () => {
    const directory = await makeDirectory();
    const env = { PATH: process.env.PATH, ORCH_STORE: directory };
    expect(runCli(["init"], env).code).toBe(0);

    const added = runCli(
      ["unit", "add", "u1", "--track", "build", "--json"],
      env
    );
    expect(added.code).toBe(0);
    expect(JSON.parse(added.stdout)).toEqual({
      id: "u1",
      track: "build",
      state: "pending",
      branch: "",
      pr: "",
      sha: "",
      brief: "",
    });
  });

  it("maps user and not-found outcomes to the preserved exit codes", async () => {
    const directory = await makeDirectory();
    expect(runCli(["--store", directory, "init"]).code).toBe(0);

    const missingRepo = runCli([
      "--store",
      directory,
      "frontier",
      "set",
    ]);
    expect(missingRepo.code).toBe(1);
    expect(missingRepo.stderr).toContain(
      "set --repo <dir> or ORCH_REPO"
    );

    const userError = runCli([
      "--store",
      directory,
      "unit",
      "add",
      "",
      "--track",
      "build",
    ]);
    expect(userError.code).toBe(1);
    expect(userError.stderr).toContain("unit id must not be empty");

    const missingUnit = runCli([
      "--store",
      directory,
      "unit",
      "get",
      "missing",
    ]);
    expect(missingUnit.code).toBe(2);
    expect(missingUnit.stderr).toContain("unit missing not found");

    const missingLedger = runCli([
      "--store",
      directory,
      "--json",
      "ledger",
      "check",
      "184530",
      "abc123",
    ]);
    expect(missingLedger.code).toBe(2);
    expect(JSON.parse(missingLedger.stdout)).toEqual({
      pr: "184530",
      sha: "abc123",
      verdict: "NOT-VERIFIED",
    });
    expect(missingLedger.stderr).toBe("");
  });
});

describe("port guards", () => {
  it("keeps status.md table cells single-line when frontier data carries control characters", async () => {
    const { directory, store } = await initializedStore();

    await writeFile(
      join(directory, "frontier.json"),
      `${JSON.stringify({
        generation: 1,
        prs: [{ pr: 7, branches: "a\nb|c", sha: "cafe\tf00d", state: "OPEN" }],
        lowestUnmerged: 7,
      })}\n`
    );
    await store.status.render();
    const status = await readFile(join(directory, "status.md"), "utf8");
    expect(status).toContain("| a b\\|c | 7 | cafe f00d | OPEN |");
  });

  it("round-trips cells that start with a spreadsheet formula or quote character", async () => {
    const { directory, store } = await initializedStore();
    await store.units.add({ id: "-hotfix", track: "build", brief: "'quoted" });
    const set = await store.units.set({
      id: "-hotfix",
      state: "in-flight",
      branch: "@me/feat",
    });
    expect(set).toMatchObject({
      id: "-hotfix",
      branch: "@me/feat",
      brief: "'quoted",
    });
    expect(await store.units.get("-hotfix")).toEqual(set);
    expect(await readFile(join(directory, "units.tsv"), "utf8")).toBe(
      "id\ttrack\tstate\tbranch\tpr\tsha\tbrief\n'-hotfix\tbuild\tin-flight\t'@me/feat\t\t\t''quoted\n"
    );
  });

  it("round-trips inbox pointers that start with a spreadsheet formula or quote character", async () => {
    const { directory, store } = await initializedStore();
    const { filename, pointer } = await store.inbox.push({
      agent: "@bot",
      unit: "-hotfix",
      status: "=done",
      report: "'quoted",
    });
    expect(pointer).toMatchObject({
      agent: "@bot",
      unit: "-hotfix",
      status: "=done",
      report: "'quoted",
    });
    expect(await store.inbox.peek()).toEqual([pointer]);
    expect(await readFile(join(directory, "inbox", filename), "utf8")).toBe(
      `${pointer.ts}\t'@bot\t'-hotfix\t'=done\t''quoted\n`
    );
  });

  it("keeps a leading quote in rows written before cells were unquoted on read", async () => {
    const { directory, store } = await initializedStore();
    await writeFile(
      join(directory, "units.tsv"),
      "id\ttrack\tstate\tbranch\tpr\tsha\tbrief\n'=x\tt\tpending\t\t\t\t'quoted brief\n'foo\tt\tpending\t\t\t\t\nfoo\tt\tpending\t\t\t\t\n"
    );
    await writeFile(
      join(directory, "ledger.tsv"),
      "pr\tsha\tverdict\tevidence\tverifier\tts\n7\tabc\tunit-test-verified\t'bun test' passed\t\t2026-01-01T00:00:00.000Z\n"
    );

    const units = [
      { id: "=x", brief: "'quoted brief" },
      { id: "'foo", brief: "" },
      { id: "foo", brief: "" },
    ];
    expect(await store.units.list()).toMatchObject(units);
    expect(await store.ledger.check({ pr: 7, sha: "abc" })).toMatchObject({
      evidence: "'bun test' passed",
    });

    await store.units.set({ id: "'foo", state: "done" });
    expect(await store.units.list()).toMatchObject(units);
  });

  it.each([
    ["gh pr list --head stack/open", ""],
    [
      "gh pr list --base stack/open",
      `if [ "$3" = --head ]; then printf '%s\\n' '[{"number":11,"state":"OPEN","headRefName":"stack/open","baseRefName":"main","headRepository":{"name":"widgets"},"headRepositoryOwner":{"login":"acme"}}]'; exit 0; fi\n`,
    ],
  ])(
    "fails a frontier set when %s hangs and ignores SIGTERM",
    async (call, answerHead) => {
      const directory = await makeDirectory();
      const fake = join(directory, "bin", "gh");
      // On a saturated machine one start of the fake forge has taken over a
      // second, and the head query before a hung base query must fit the budget.
      const store = useStore(directory, {
        forgePaths: { gh: fake },
        forgeTimeoutMs: 2000,
      });
      await store.init();
      const stack = await makeGitStack(directory);
      await mkdir(join(directory, "bin"));
      await writeFile(
        fake,
        `#!/usr/bin/env bash\n${answerHead}trap '' TERM\nexec sleep 20\n`,
        { mode: 0o755 }
      );
      const started = Date.now();
      await expect(store.frontier.set({ repo: stack.repo })).rejects.toThrow(
        new RegExp(`^${call} --state all .* failed: .*ETIMEDOUT`)
      );
      expect(Date.now() - started).toBeLessThan(10_000);
    },
    30_000
  );
});
