import { afterEach, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function run(scenario: string, extra: string[] = [], path?: string) {
  const dir = mkdtempSync(join(tmpdir(), "watch-transport-"));
  directories.push(dir);
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const gh = join(bin, "gh");
  writeFileSync(
    gh,
    `#!${process.execPath}
import { appendFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const scenario = process.env.WATCH_FIXTURE;
appendFileSync(process.env.WATCH_CALLS, JSON.stringify(args) + '\\n');
if (scenario === 'slow') {
  writeFileSync(process.env.WATCH_PID, String(process.pid));
  await new Promise(resolve => setTimeout(resolve, 2000));
}
const noCi = scenario.startsWith('no-ci');
const fail = (stderr) => { console.error(stderr); process.exit(1); };
let value;
if (args.some(a => a.includes('query PullRequestFacts'))) {
  value = { data: { repository: { pullRequest: { headRefOid: 'head', baseRef: { target: { oid: 'base' } }, mergeable: 'MERGEABLE', mergeStateStatus: scenario === 'no-ci-blocked' ? 'BLOCKED' : 'CLEAN', reviewDecision: noCi ? null : 'APPROVED', headRefName: 'feature', baseRefName: 'main', state: 'OPEN', mergedAt: null, isDraft: false } } } };
} else if (args[0] === 'pr' && args[1] === 'checks') {
  if (scenario === 'no-ci-unauthorized') fail('HTTP 401: Bad credentials (https://api.github.com/graphql)');
  if (noCi) fail("no checks reported on the 'feature' branch");
  value = [{ name: 'ci', state: 'SUCCESS', bucket: 'pass', description: '', link: '', workflow: '' }];
} else if (args.some(a => a.includes('query PrCheckRollup'))) {
  if (scenario === 'no-ci-rollup-fails') fail('HTTP 502: Bad Gateway (https://api.github.com/graphql)');
  value = { data: { repository: { pullRequest: { commits: { nodes: [{ commit: { statusCheckRollup: null } }] } } } } };
} else if (noCi && args.some(a => a.includes('query PrCommitStatuses'))) {
  value = { data: { repository: { pullRequest: { commits: { nodes: [{ commit: { oid: 'head', statusCheckRollup: null } }] } } } } };
} else if (args[0] === 'pr' && args[1] === 'list') {
  value = [{ number: 1, headRefName: 'main', baseRefName: 'main', headRepository: { name: 'repo', nameWithOwner: 'fork/repo' }, headRepositoryOwner: { login: 'fork' } }];
} else if (args[0] === 'repo' && args[1] === 'view') {
  value = { defaultBranchRef: { name: 'main' } };
} else if (args.some(a => a.includes('query ReviewThreads'))) {
  const after = args.find(a => a.startsWith('after='));
  const thread = (n, resolved) => ({ id: 't' + n, isResolved: resolved, comments: { nodes: [] } });
  const paginated = scenario === 'threads' || scenario === 'stuck-cursor';
  value = { data: { repository: { pullRequest: { reviewThreads: {
    nodes: paginated ? (after ? [thread(100, false)] : Array.from({length: 100}, (_, n) => thread(n, true))) : [],
    pageInfo: { hasNextPage: paginated && (!after || scenario === 'stuck-cursor'), endCursor: paginated ? 'next' : null }
  } } } } };
} else if (args.some(a => a.includes('query PrCommitStatuses'))) {
  value = { data: { repository: { pullRequest: { commits: { nodes: [{ commit: { oid: 'head', statusCheckRollup: { state: 'SUCCESS' } } }] } } } } };
} else { throw new Error('unexpected fixture command: ' + JSON.stringify(args)); }
console.log(JSON.stringify(value));
`
  );
  chmodSync(gh, 0o755);
  const entry = join(dir, "entry.ts");
  writeFileSync(
    entry,
    `import { main } from ${JSON.stringify(join(import.meta.dir, "cli.ts"))}; process.exitCode = await main(process.argv.slice(2));\n`
  );
  const callsFile = join(dir, "calls.jsonl");
  writeFileSync(callsFile, "");
  const pidFile = join(dir, "pid");
  const started = performance.now();
  const result = spawnSync(
    process.execPath,
    [entry, "--owner", "owner", "--repo", "repo", "--pr", "1", ...extra],
    {
      encoding: "utf8",
      timeout: 6000,
      env: {
        PATH: path ?? `${bin}:${process.env.PATH}`,
        WATCH_FIXTURE: scenario,
        WATCH_CALLS: callsFile,
        WATCH_PID: pidFile,
      },
    }
  );
  return {
    ...result,
    elapsed: performance.now() - started,
    calls: readFileSync(callsFile, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as string[]),
    pidFile,
  };
}

it("reads page two before reporting unresolved review threads", () => {
  const result = run("threads");
  expect(result.status).toBe(3);
  expect(JSON.parse(result.stdout.trim())).toMatchObject({
    kind: "BLOCKER",
    blocker: { kind: "review-threads", threads: [{ id: "t100" }] },
  });
  expect(
    result.calls.filter((args) => args.includes("after=next"))
  ).toHaveLength(1);
});

it("rejects a repeating page cursor instead of looping or silently truncating", () => {
  const result = run("stuck-cursor", ["--max-query-errors", "1"]);
  expect(result.status).toBe(7);
  expect(
    result.calls.filter((args) =>
      args.some((arg) => arg.includes("ReviewThreads"))
    )
  ).toHaveLength(2);
});

it("keeps a fork main branch distinct from destination main during stack discovery", () => {
  const result = run("fork", ["--stack", "--status-only"]);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout.trim())).toMatchObject({
    kind: "STATUS",
    rows: [{ context: { number: 1 } }],
  });
});

const verdicts = (stdout: string): unknown[] =>
  stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as unknown);

// The no-ci fixtures replay what gh returned for a mergeable PR in a repository
// with no checks configured: `gh pr checks` exits 1 with "no checks reported"
// and the head commit's statusCheckRollup is null.
it("reports a first sighting of no checks on a status-only pass", () => {
  const result = run("no-ci", ["--status-only", "--max-query-errors", "1"]);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout.trim())).toMatchObject({
    kind: "STATUS",
    terminal: true,
    rows: [{ kind: "open", ci: { kind: "ci-unreported" } }],
  });
});

// Confirming no checks takes 60 seconds of wall time, so a test on the real
// clock can only show the wait. A loaded machine fits fewer polls into the
// deadline, so this asserts what each poll said and not how many there were.
it("keeps a PR with no checks waiting through short-interval polls until the deadline", () => {
  for (const scenario of ["no-ci", "no-ci-blocked"]) {
    const result = run(scenario, [
      "--max-query-errors",
      "1",
      "--interval",
      "0.05",
      "--timeout",
      "2",
    ]);
    expect(result.status).toBe(5);
    const emitted = verdicts(result.stdout);
    for (const wait of emitted.slice(0, -1))
      expect(wait).toMatchObject({
        kind: "WAITING",
        reason: { kind: "checks-unreported" },
      });
    expect(emitted.at(-1)).toMatchObject({ kind: "TIMEOUT" });
  }
});

it("fails closed when the check queries fail instead of reporting no checks", () => {
  for (const scenario of ["no-ci-unauthorized", "no-ci-rollup-fails"]) {
    const result = run(scenario, ["--status-only", "--max-query-errors", "1"]);
    expect(result.status).toBe(7);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      kind: "BLOCKER",
      blocker: { kind: "status-query" },
    });
  }
});

it("exits 7 with a JSON verdict when gh is not on PATH", () => {
  const result = run("missing-gh", [], "/nonexistent");
  expect(result.status).toBe(7);
  expect(JSON.parse(result.stdout.trim())).toMatchObject({
    kind: "BLOCKER",
    exitCode: 7,
    blocker: {
      kind: "status-query",
      failures: 1,
      failure: { kind: "spawn-failed", retryable: false },
    },
  });
});

it("cancels an in-flight command at the CLI deadline", () => {
  const result = run("slow", ["--timeout", "0.25"]);
  expect(result.status).toBe(5);
  expect(result.elapsed).toBeLessThan(1500);
  expect(JSON.parse(result.stdout.trim())).toMatchObject({ kind: "TIMEOUT" });
  const pid = Number(readFileSync(result.pidFile, "utf8"));
  expect(() => process.kill(pid, 0)).toThrow();
});
