import { describe, expect, it } from "bun:test";
import { type CliRuntime, main, parseArgs } from "./cli.ts";
import { WatchDeadline } from "./deadline.ts";
import { fakeReader, passingCheck } from "./fakes.test-helper.ts";
import { renderJson, renderPretty } from "./render.ts";
import type { GitHubReader, QueryFailure, WatcherVerdict } from "./types.ts";
import { parsePrNumber } from "./types.ts";

const silentIo = { stdout: () => {}, stderr: () => {} };

function testRuntime(reader: GitHubReader): {
  readonly runtime: CliRuntime;
  readonly stdout: string[];
  readonly stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    runtime: {
      reader,
      deadline: new WatchDeadline(0, () => 0),
      clock: {
        now: () => 0,
        observedAt: () => "2026-07-26T00:00:00.000Z",
        async sleep() {
          throw new Error("test unexpectedly slept");
        },
      },
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
    },
  };
}

describe("parseArgs", () => {
  it("uses the specified defaults", () => {
    expect(parseArgs([], silentIo)).toMatchObject({
      owner: null,
      repo: null,
      pr: null,
      mode: "single",
      stackPrs: [],
      statusOnly: false,
      pretty: false,
      polling: {
        interval: 60,
        sweepInterval: 300,
        timeout: 0,
        maxQueryErrors: 5,
        allowDraft: false,
      },
    });
  });

  it("parses a frozen queued stack bottom-to-top", () => {
    const parsed = parseArgs(
      [
        "--queued-stack",
        "--stack-prs",
        "#10, 11,#12",
        "--interval",
        "2.5",
        "--sweep-interval",
        "30",
        "--timeout",
        "0",
        "--max-query-errors",
        "3",
        "--allow-draft",
        "--pretty",
      ],
      silentIo
    );
    expect(parsed.mode).toBe("queued-stack");
    expect(parsed.stackPrs.map(Number)).toEqual([10, 11, 12]);
    expect(parsed.polling).toEqual({
      interval: 2.5,
      sweepInterval: 30,
      timeout: 0,
      maxQueryErrors: 3,
      allowDraft: true,
    });
    expect(parsed.pretty).toBe(true);
  });

  it("rejects every invalid mode and numeric shape as usage", async () => {
    const invalid = [
      ["--unknown"],
      ["--interval", "0"],
      ["--sweep-interval", "-1"],
      ["--timeout", "-1"],
      ["--max-query-errors", "1.5"],
      ["--stack", "--queued-stack"],
      ["--stack-prs", "1,2"],
      ["--queued-stack", "--stack-prs", "1,1"],
    ];
    for (const argv of invalid) {
      const harness = testRuntime(fakeReader());
      expect(await main(argv, harness.runtime)).toBe(64);
      expect(harness.stdout).toEqual([]);
      expect(harness.stderr.join("")).toContain("error:");
    }
  });
});

describe("rendering", () => {
  const context = {
    owner: "owner",
    repo: "repo",
    number: parsePrNumber(1),
  };
  const status = {
    schemaVersion: 1,
    sequence: 1,
    observedAt: "2026-07-26T00:00:00.000Z",
    mode: "single",
    kind: "STATUS",
    terminal: true,
    exitCode: 0,
    reason: "status-only",
    rows: [
      {
        kind: "merged",
        context,
        facts: {
          context,
          mergeable: "MERGEABLE",
          mergeStateStatus: "CLEAN",
          reviewDecision: "APPROVED",
          headRefOid: "head",
          baseRefOid: "base",
          headRefName: "feature",
          baseRefName: "main",
          state: "MERGED",
          mergedAt: "now",
          isDraft: false,
        },
      },
    ],
  } satisfies WatcherVerdict;

  it("emits compact valid JSON by default", () => {
    const rendered = renderJson(status);
    expect(rendered.endsWith("\n")).toBe(true);
    expect(JSON.parse(rendered)).toEqual(status);
  });

  it("renders the Markdown table from the same verdict only", () => {
    const rendered = renderPretty(status);
    expect(rendered).toContain("| PR | CI | Review | Merge |");
    expect(rendered).toContain(
      "| [#1](https://github.com/owner/repo/pull/1) | \u2014 | \u2014 | ✅ merged |"
    );
  });

  const envelope = {
    schemaVersion: 1,
    sequence: 1,
    observedAt: "2026-07-26T00:00:00.000Z",
    mode: "single",
  } as const;

  it("does not call a PR that changed mid-read a failed query", () => {
    const retry = (failure: QueryFailure) =>
      renderPretty({
        ...envelope,
        kind: "RETRY",
        terminal: false,
        failure,
        consecutiveFailures: 1,
        retryInSeconds: 60,
      });
    expect(
      retry({ kind: "snapshot-changed", retryable: true, detail: "moved" })
    ).toBe(
      "RETRY: the PR changed while its status was being read; retrying in 60s\ndetail=moved\n"
    );
    expect(
      retry({ kind: "command-exit", retryable: true, detail: "502", code: 1 })
    ).toBe("RETRY: GitHub status query failed; retrying in 60s\ndetail=502\n");
  });

  it("tells a caller whose command could not run to install it, not to check authentication", () => {
    const action = (failure: QueryFailure) =>
      renderPretty({
        ...envelope,
        kind: "BLOCKER",
        terminal: true,
        exitCode: 7,
        blocker: { kind: "status-query", failures: 1, failure },
      })
        .trimEnd()
        .split("\n")
        .at(-1);
    expect(
      action({ kind: "spawn-failed", retryable: false, detail: "no gh" })
    ).toBe(
      "action=install the command that could not run, or put it on PATH, then rearm"
    );
    expect(
      action({ kind: "command-exit", retryable: true, detail: "401", code: 1 })
    ).toBe(
      "action=verify current PR context, GitHub authentication, and API availability, then rearm"
    );
  });
});

describe("main", () => {
  it("returns EX_USAGE 64 and writes usage errors only to stderr", async () => {
    const harness = testRuntime(fakeReader());
    expect(await main(["--interval", "0"], harness.runtime)).toBe(64);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr.join("")).toContain(
      "option '--interval <seconds>' argument '0' is invalid"
    );
  });

  it("rejects an interval longer than one timer can sleep, and accepts the longest one", async () => {
    const harness = testRuntime(fakeReader());
    expect(await main(["--interval", "2147484"], harness.runtime)).toBe(64);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr.join("")).toContain(
      "option '--interval <seconds>' argument '2147484' is invalid. must be at most 2147483.647"
    );
    expect(
      parseArgs(["--interval", "2147483.647"], silentIo).polling.interval
    ).toBe(2147483.647);
  });

  it("bypasses the queue machine for queued-stack status-only", async () => {
    const reader = fakeReader();
    const harness = testRuntime(reader);
    const code = await main(
      [
        "--owner",
        "owner",
        "--repo",
        "repo",
        "--queued-stack",
        "--stack-prs",
        "1",
        "--status-only",
      ],
      harness.runtime
    );
    expect(code).toBe(0);
    expect(harness.stdout).toHaveLength(1);
    const verdict: unknown = JSON.parse(harness.stdout[0]);
    expect(verdict).toMatchObject({
      kind: "STATUS",
      terminal: true,
      exitCode: 0,
      mode: "queued-stack",
    });
    expect(harness.stdout[0]).not.toContain('"kind":"QUEUE"');
  });

  it("returns exit 4 for a hidden GitHub-side CI refusal", async () => {
    const reader = fakeReader({
      facts: { mergeStateStatus: "BLOCKED" },
      fastPath: { kind: "checks", checks: [passingCheck()] },
      commitRollups: [{ oid: "head", state: "FAILURE" }],
    });
    const harness = testRuntime(reader);
    const code = await main(
      ["--owner", "owner", "--repo", "repo", "--pr", "1"],
      harness.runtime
    );
    expect(code).toBe(4);
    expect(harness.stdout).toHaveLength(1);
    expect(JSON.parse(harness.stdout[0])).toMatchObject({
      kind: "BLOCKER",
      exitCode: 4,
      blocker: {
        kind: "failing-checks",
        ci: { kind: "ci-github-rejected" },
      },
    });
  });

  it("names the absence of checks in the status table and the READY verdict", async () => {
    const argv = [
      "--owner",
      "owner",
      "--repo",
      "repo",
      "--pr",
      "1",
      "--pretty",
    ];
    const noChecks = () =>
      testRuntime(
        fakeReader({
          facts: { reviewDecision: null },
          fastPath: { kind: "none-reported" },
          rollupPages: [{ kind: "no-rollup" }],
          commitRollups: [{ oid: "head", state: null }],
        })
      );
    const status = noChecks();
    expect(await main([...argv, "--status-only"], status.runtime)).toBe(0);
    expect(status.stdout.join("")).toContain(
      "| [#1](https://github.com/owner/repo/pull/1) | ⏳ no checks reported yet | ✅ | ✅ |"
    );
    const ready = noChecks();
    let now = 0;
    const runtime = {
      ...ready.runtime,
      clock: {
        ...ready.runtime.clock,
        now: () => now,
        async sleep(seconds: number) {
          now += seconds;
          if (now > 3600) throw new Error("no verdict within an hour");
        },
      },
    };
    expect(await main(argv, runtime)).toBe(0);
    expect(ready.stdout).toEqual([
      "WAITING: frontier=#1; no checks have reported on the head commit yet\n",
      "READY: no merge conflicts, no unresolved review threads, no failing or pending checks\nmergeStateStatus=CLEAN\nreviewDecision=null\nisDraft=false\nchecks=none reported on the head commit\n",
    ]);
  });

  it("says that mergeability is unknown in the status table, the WAITING line, and the TIMEOUT line", async () => {
    const argv = [
      "--owner",
      "owner",
      "--repo",
      "repo",
      "--pr",
      "1",
      "--pretty",
    ];
    const unknown = () =>
      testRuntime(
        fakeReader({
          facts: { mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" },
        })
      );
    const status = unknown();
    expect(await main([...argv, "--status-only"], status.runtime)).toBe(0);
    expect(status.stdout.join("")).toContain(
      "| [#1](https://github.com/owner/repo/pull/1) | ✅ | ✅ | ⏳ mergeability unknown |"
    );
    const waiting = unknown();
    let now = 0;
    const runtime = {
      ...waiting.runtime,
      deadline: new WatchDeadline(90, () => now),
      clock: {
        ...waiting.runtime.clock,
        now: () => now,
        async sleep(seconds: number) {
          now += seconds;
        },
      },
    };
    expect(await main(argv, runtime)).toBe(5);
    expect(waiting.stdout).toEqual([
      "WAITING: frontier=#1; GitHub has not computed mergeability yet\n",
      "WAITING: frontier=#1; GitHub has not computed mergeability yet\n",
      "TIMEOUT: GitHub has not computed mergeability yet\n",
    ]);
  });

  it("shows help without touching the reader", async () => {
    const reader = fakeReader();
    const harness = testRuntime(reader);
    expect(await main(["--help"], harness.runtime)).toBe(0);
    const help = harness.stdout.join("").replace(/\s+/g, " ");
    expect(help).toContain("JSON (NDJSON while polling)");
    expect(help).toContain(
      "print one status table and exit; exit 0 means the table was read, not that the PR is ready"
    );
    expect(help).toContain(
      "poll interval; a PR with no checks takes 60 seconds to confirm whatever this is"
    );
    expect(reader.calls).toEqual([]);
  });
});
