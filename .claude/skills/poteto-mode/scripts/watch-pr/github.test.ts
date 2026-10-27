import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WatchDeadline } from "./deadline.ts";
import {
  ChecksUnavailable,
  WatcherQueryError,
  discoverStack,
  buildReviewThreads,
  mapRollupNode,
  orderStack,
  parseFastCheck,
  parsePullRequest,
  parseReviewThreadPage,
  PR_FACTS_QUERY,
  resolveChecks,
  resolveContext,
  resolveReviewThreads,
  runJson,
} from "./github.ts";
import {
  fakeReader,
  failedCheck,
  passingCheck,
  pendingCheck,
} from "./fakes.test-helper.ts";
import type { CheckRead, PrContext, ReportedChecks } from "./types.ts";
import { parsePrNumber } from "./types.ts";

const context = {
  owner: "owner",
  repo: "repo",
  number: parsePrNumber(42),
};

function reported(read: CheckRead): ReportedChecks {
  if (read.kind !== "reported")
    throw new Error(`expected checks: ${read.kind}`);
  return read;
}

const numbers = (stack: readonly PrContext[]): number[] =>
  stack.map((pr) => Number(pr.number));

describe("checks fallback chain", () => {
  it("uses a non-empty fast-path result without a rollup query", async () => {
    const reader = fakeReader({
      fastPath: { kind: "checks", checks: [passingCheck("fast")] },
    });
    const read = reported(await resolveChecks(reader, context));
    expect(read.source).toBe("gh-pr-checks");
    expect(read.checks.map((check) => check.name)).toEqual(["fast"]);
    expect(reader.calls).toEqual(["checksFastPath"]);
  });

  it("paginates GraphQL when the fast path is unusable", async () => {
    const reader = fakeReader({
      fastPath: { kind: "unusable", exitCode: 8, stderr: "" },
      rollupPages: [
        {
          kind: "contexts",
          checks: [passingCheck("first")],
          endCursor: "next",
        },
        { kind: "contexts", checks: [failedCheck("second")], endCursor: null },
      ],
    });
    const read = reported(await resolveChecks(reader, context));
    expect(read.source).toBe("graphql-rollup");
    expect(read.checks.map((check) => check.name)).toEqual(["first", "second"]);
    expect(reader.calls).toEqual([
      "checksFastPath",
      "checkRollupPage:null",
      "checkRollupPage:next",
    ]);
  });

  it("falls back when valid fast-path JSON represented an empty list", async () => {
    const reader = fakeReader({
      fastPath: { kind: "checks", checks: [] },
      rollupPages: [
        {
          kind: "contexts",
          checks: [pendingCheck("fallback")],
          endCursor: null,
        },
      ],
    });
    expect(reported(await resolveChecks(reader, context)).checks[0].name).toBe(
      "fallback"
    );
    expect(reader.calls).toEqual(["checksFastPath", "checkRollupPage:null"]);
  });

  it("fails closed when both paths are empty", async () => {
    const reader = fakeReader({
      fastPath: {
        kind: "unusable",
        exitCode: 8,
        stderr: "credential cannot read checks",
      },
    });
    await expect(resolveChecks(reader, context)).rejects.toBeInstanceOf(
      ChecksUnavailable
    );
    expect(reader.calls).toEqual(["checksFastPath", "checkRollupPage:null"]);
  });

  it("reads no checks when gh reports none and the head commit has no rollup", async () => {
    const reader = fakeReader({
      fastPath: { kind: "none-reported" },
      rollupPages: [{ kind: "no-rollup" }],
    });
    expect(await resolveChecks(reader, context)).toEqual({ kind: "no-checks" });
    expect(reader.calls).toEqual(["checksFastPath", "checkRollupPage:null"]);
  });

  it("fails closed when only one read says there are no checks", async () => {
    const oneSided = [
      {
        fastPath: { kind: "unusable", exitCode: 1, stderr: "HTTP 401" },
        rollupPages: [{ kind: "no-rollup" }],
      },
      {
        fastPath: { kind: "checks", checks: [] },
        rollupPages: [{ kind: "no-rollup" }],
      },
      {
        fastPath: { kind: "none-reported" },
        rollupPages: [{ kind: "contexts", checks: [], endCursor: null }],
      },
    ] as const;
    for (const options of oneSided)
      await expect(
        resolveChecks(fakeReader(options), context)
      ).rejects.toBeInstanceOf(ChecksUnavailable);
  });

  it("rejects a rollup cursor that does not advance instead of paging on", async () => {
    const stuck = { kind: "contexts", checks: [], endCursor: "same" } as const;
    const reader = fakeReader({
      fastPath: { kind: "checks", checks: [] },
      rollupPages: [
        stuck,
        stuck,
        { kind: "contexts", checks: [], endCursor: null },
      ],
    });
    await expect(resolveChecks(reader, context)).rejects.toMatchObject({
      failure: {
        kind: "missing-key",
        retryable: true,
        detail: expect.stringContaining("must advance"),
      },
    });
    expect(reader.calls).toEqual([
      "checksFastPath",
      "checkRollupPage:null",
      "checkRollupPage:same",
    ]);
  });

  it("rejects a rollup cursor that returns to an earlier page after moving on", async () => {
    const page = (endCursor: string | null) =>
      ({ kind: "contexts", checks: [], endCursor }) as const;
    const reader = fakeReader({
      fastPath: { kind: "checks", checks: [] },
      rollupPages: [page("a"), page("b"), page("a"), page(null)],
    });
    await expect(resolveChecks(reader, context)).rejects.toMatchObject({
      failure: {
        kind: "missing-key",
        detail: expect.stringContaining("must advance"),
      },
    });
    expect(reader.calls).toEqual([
      "checksFastPath",
      "checkRollupPage:null",
      "checkRollupPage:a",
      "checkRollupPage:b",
    ]);
  });

  it("propagates a failed rollup query instead of reading it as no checks", async () => {
    const reader = fakeReader({ fastPath: { kind: "none-reported" } });
    const failure = new WatcherQueryError({
      kind: "command-exit",
      retryable: true,
      code: 1,
      detail: "HTTP 502",
    });
    reader.checkRollupPage = async () => {
      throw failure;
    };
    await expect(resolveChecks(reader, context)).rejects.toBe(failure);
  });
});

it("reports a binary that cannot be spawned as a query failure that does not retry", async () => {
  await expect(
    runJson(
      ["/nonexistent/watch-pr-missing-gh", "pr", "view"],
      new WatchDeadline(0, () => 0)
    )
  ).rejects.toMatchObject({
    failure: {
      kind: "spawn-failed",
      retryable: false,
      detail: expect.stringContaining("ENOENT"),
    },
  });
});

describe("rollup node mapping", () => {
  it("maps terminal and non-terminal CheckRun states fail closed", () => {
    const cases = [
      ["IN_PROGRESS", null, "pending", "PENDING"],
      ["COMPLETED", "SUCCESS", "passed", "SUCCESS"],
      ["COMPLETED", "NEUTRAL", "skipped", "NEUTRAL"],
      ["COMPLETED", "SKIPPED", "skipped", "SKIPPED"],
      ["COMPLETED", "ACTION_REQUIRED", "failed", "ACTION_REQUIRED"],
      ["COMPLETED", "TIMED_OUT", "failed", "FAILURE"],
      ["COMPLETED", "FUTURE_VALUE", "failed", "FAILURE"],
    ] as const;
    for (const [status, conclusion, kind, reportedState] of cases) {
      expect(
        mapRollupNode({
          __typename: "CheckRun",
          name: "ci",
          status,
          conclusion,
        })
      ).toMatchObject({ kind, reportedState });
    }
  });

  it("classifies an in-progress Code Review Gate from the rollup as the gate", () => {
    expect(
      mapRollupNode({
        __typename: "CheckRun",
        name: "Code Review Gate",
        status: "IN_PROGRESS",
        conclusion: null,
      })
    ).toMatchObject({ kind: "code-review-gate" });
    expect(
      mapRollupNode({
        __typename: "StatusContext",
        context: "Code Review Gate",
        state: "PENDING",
      })
    ).toMatchObject({ kind: "code-review-gate" });
  });

  it("classifies a Code Review Gate waiting on an owner approval as the gate", () => {
    expect(
      mapRollupNode({
        __typename: "CheckRun",
        name: "Code Review Gate",
        status: "COMPLETED",
        conclusion: "ACTION_REQUIRED",
        description: "1 of 2 policies",
      })
    ).toMatchObject({
      kind: "code-review-gate",
      reportedState: "ACTION_REQUIRED",
    });
  });

  it("classifies a fast-path Code Review Gate waiting on an owner approval as the gate", () => {
    expect(
      parseFastCheck({
        name: "Code Review Gate",
        state: "ACTION_REQUIRED",
        bucket: "fail",
      })
    ).toMatchObject({
      kind: "code-review-gate",
      reportedState: "ACTION_REQUIRED",
    });
    expect(
      parseFastCheck({ name: "ci", state: "ACTION_REQUIRED", bucket: "fail" })
    ).toMatchObject({ kind: "failed", reportedState: "ACTION_REQUIRED" });
  });

  it("maps StatusContext states and drops unknown typenames", () => {
    expect(
      mapRollupNode({
        __typename: "StatusContext",
        context: "ci",
        state: "EXPECTED",
      })
    ).toMatchObject({ kind: "pending", reportedState: "PENDING" });
    expect(
      mapRollupNode({
        __typename: "StatusContext",
        context: "ci",
        state: "FUTURE_VALUE",
      })
    ).toMatchObject({ kind: "failed", reportedState: "FUTURE_VALUE" });
    expect(mapRollupNode({ __typename: "FutureNode" })).toBeNull();
  });
});

describe("fast-path check mapping", () => {
  // gh's aggregate.go files every state it does not name into the pending
  // bucket, including completed conclusions.
  it("fails completed conclusions that gh buckets as pending", () => {
    for (const state of ["STARTUP_FAILURE", "STALE"]) {
      expect(
        parseFastCheck({ name: "ci", state, bucket: "pending" })
      ).toMatchObject({ kind: "failed", reportedState: state });
    }
  });

  it("keeps in-flight states pending", () => {
    for (const state of [
      "EXPECTED",
      "REQUESTED",
      "WAITING",
      "QUEUED",
      "PENDING",
      "IN_PROGRESS",
    ]) {
      expect(
        parseFastCheck({ name: "ci", state, bucket: "pending" })
      ).toMatchObject({ kind: "pending", reportedState: state });
    }
  });
});

describe("closed enum parsing", () => {
  const rawPullRequest = {
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    headRefOid: "head",
    baseRef: { target: { oid: "base" } },
    headRefName: "feature",
    baseRefName: "main",
    state: "OPEN",
    mergedAt: null,
    isDraft: false,
  };

  it("accepts mergeStateStatus CONFLICTING", () => {
    expect(
      parsePullRequest(
        { ...rawPullRequest, mergeStateStatus: "CONFLICTING" },
        context
      ).mergeStateStatus
    ).toBe("CONFLICTING");
  });

  it("rejects an empty reviewDecision like any other unknown enum value", () => {
    expect(() =>
      parsePullRequest({ ...rawPullRequest, reviewDecision: "" }, context)
    ).toThrow(WatcherQueryError);
  });

  it("still rejects an unknown reviewDecision", () => {
    expect(() =>
      parsePullRequest({ ...rawPullRequest, reviewDecision: "MAYBE" }, context)
    ).toThrow(WatcherQueryError);
  });

  it("uses the current base target when the scalar base OID is stale", () => {
    expect(
      parsePullRequest(
        {
          ...rawPullRequest,
          baseRefOid: "stale-base",
          baseRef: { target: { oid: "current-base" } },
        },
        context
      ).baseRefOid
    ).toBe("current-base");
  });

  it("queries the current base target with the other PR facts", () => {
    expect(PR_FACTS_QUERY).toContain("baseRef { target { oid } }");
    expect(PR_FACTS_QUERY).not.toContain("baseRefOid");
  });

  it("fails closed when the current base ref is null or missing", () => {
    const missingBaseRef = Object.fromEntries(
      Object.entries(rawPullRequest).filter(([key]) => key !== "baseRef")
    );
    for (const value of [{ ...rawPullRequest, baseRef: null }, missingBaseRef])
      expect(() => parsePullRequest(value, context)).toThrow(WatcherQueryError);
  });

  it("rejects unknown enum values as retryable errors carrying the raw value", () => {
    try {
      parsePullRequest(
        { ...rawPullRequest, mergeStateStatus: "FUTURE_STATE" },
        context
      );
      throw new Error("expected parser to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(WatcherQueryError);
      if (!(error instanceof WatcherQueryError)) throw error;
      expect(error.failure).toMatchObject({
        kind: "missing-key",
        retryable: true,
        rawValue: '"FUTURE_STATE"',
      });
    }
  });
});

it("annotates Bugbot threads with distinct review-pass counts", () => {
  const response = {
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: "one",
                isResolved: false,
                comments: {
                  nodes: [
                    {
                      body: "RUN_ID: run-1",
                      createdAt: "now",
                      path: "a.ts",
                      line: 1,
                      author: { login: "bugbot" },
                    },
                  ],
                },
              },
              {
                id: "two",
                isResolved: false,
                comments: {
                  nodes: [
                    {
                      body: "CURSOR_AUTOMATION_ID: run-2 severity high",
                      createdAt: "now",
                      path: null,
                      line: null,
                      author: { login: "cursor" },
                    },
                  ],
                },
              },
              {
                id: "resolved",
                isResolved: true,
                comments: {
                  nodes: [
                    {
                      body: "RUN_ID: run-3",
                      createdAt: "now",
                      path: null,
                      line: null,
                      author: { login: "bugbot" },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    },
  };
  const threads = buildReviewThreads(parseReviewThreadPage(response).threads);
  expect(threads).toHaveLength(2);
  expect(threads.map((thread) => thread.isBugbot)).toEqual([true, true]);
  expect(threads.map((thread) => thread.bugbotReviewPasses)).toEqual([3, 3]);
});

describe("review thread pagination", () => {
  const thread = (id: string, resolved = false) => ({
    id,
    firstComment: {
      authorLogin: "someone",
      body: "please fix",
      path: "a.ts",
      line: 1,
      createdAt: "now",
    },
    resolved,
  });

  it("keeps walking pages until the cursor is exhausted", async () => {
    const reader = fakeReader({
      threadPages: [
        { threads: [thread("one")], endCursor: "next" },
        { threads: [thread("two")], endCursor: "last" },
        { threads: [thread("three")], endCursor: null },
      ],
    });
    const threads = await resolveReviewThreads(reader, context);
    expect(threads.map((item) => item.id)).toEqual(["one", "two", "three"]);
    expect(reader.calls).toEqual([
      "reviewThreadPage:null",
      "reviewThreadPage:next",
      "reviewThreadPage:last",
    ]);
  });

  it("sees an unresolved thread that sits past the first page", async () => {
    const reader = fakeReader({
      threadPages: [
        { threads: [thread("early", true)], endCursor: "next" },
        { threads: [thread("late")], endCursor: null },
      ],
    });
    const threads = await resolveReviewThreads(reader, context);
    expect(threads.map((item) => item.id)).toEqual(["late"]);
  });

  it("stops after a single page when the cursor is exhausted", async () => {
    const reader = fakeReader({
      threadPages: [{ threads: [thread("only")], endCursor: null }],
    });
    expect((await resolveReviewThreads(reader, context)).length).toBe(1);
    expect(reader.calls).toEqual(["reviewThreadPage:null"]);
  });

  it("counts Bugbot review passes across every page", async () => {
    const bugbot = (id: string, runId: string) => ({
      id,
      firstComment: {
        authorLogin: "bugbot",
        body: `RUN_ID: ${runId}`,
        path: "a.ts",
        line: 1,
        createdAt: "now",
      },
      resolved: false,
    });
    const reader = fakeReader({
      threadPages: [
        { threads: [bugbot("one", "run-1")], endCursor: "next" },
        { threads: [bugbot("two", "run-2")], endCursor: null },
      ],
    });
    const threads = await resolveReviewThreads(reader, context);
    expect(threads.map((item) => item.bugbotReviewPasses)).toEqual([2, 2]);
  });

  it("drops resolved threads from later pages too", async () => {
    const reader = fakeReader({
      threadPages: [
        { threads: [thread("one")], endCursor: "next" },
        { threads: [thread("two", true)], endCursor: null },
      ],
    });
    expect(
      (await resolveReviewThreads(reader, context)).map((item) => item.id)
    ).toEqual(["one"]);
  });

  it("rejects a page that omits pageInfo instead of assuming one page", async () => {
    const response = {
      data: {
        repository: {
          pullRequest: { reviewThreads: { nodes: [] } },
        },
      },
    };
    expect(() => parseReviewThreadPage(response)).toThrow(WatcherQueryError);
  });

  it("rejects a page that promises more pages without a cursor", () => {
    for (const endCursor of [null, ""]) {
      const response = {
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                pageInfo: { hasNextPage: true, endCursor },
                nodes: [],
              },
            },
          },
        },
      };
      expect(() => parseReviewThreadPage(response)).toThrow(WatcherQueryError);
    }
  });

  it("rejects a thread cursor that does not advance instead of paging on", async () => {
    const stuck = { threads: [], endCursor: "same" };
    const reader = fakeReader({
      threadPages: [stuck, stuck, { threads: [], endCursor: null }],
    });
    await expect(resolveReviewThreads(reader, context)).rejects.toMatchObject({
      failure: {
        kind: "missing-key",
        retryable: true,
        detail: expect.stringContaining(
          "reviewThreads.pageInfo.endCursor must advance"
        ),
      },
    });
    expect(reader.calls).toEqual([
      "reviewThreadPage:null",
      "reviewThreadPage:same",
    ]);
  });
});

describe("context and stack discovery", () => {
  it("returns a fully explicit context without any reader call", async () => {
    const reader = fakeReader();
    expect(
      await resolveContext({
        reader,
        owner: "explicit",
        repo: "repo",
        pr: context.number,
      })
    ).toEqual({ owner: "explicit", repo: "repo", number: context.number });
    expect(reader.calls).toEqual([]);
  });

  it("uses the local origin before currentPr for an explicit number", async () => {
    const reader = fakeReader({ origin: { owner: "local", repo: "checkout" } });
    expect(
      await resolveContext({
        reader,
        owner: null,
        repo: null,
        pr: context.number,
      })
    ).toEqual({ owner: "local", repo: "checkout", number: context.number });
    expect(reader.calls).toEqual(["originRepo"]);
  });

  it("refuses to pair the checkout's PR number with a different explicit repository", async () => {
    const reader = fakeReader({
      current: { owner: "acme", repo: "web", number: parsePrNumber(57) },
    });
    const resolved = resolveContext({
      reader,
      owner: "acme",
      repo: "api",
      pr: null,
    });
    await expect(resolved).rejects.toBeInstanceOf(WatcherQueryError);
    await expect(resolved).rejects.toMatchObject({
      failure: { retryable: false },
    });
  });

  it("accepts an explicit repository that matches the checkout's PR", async () => {
    const reader = fakeReader({
      current: { owner: "acme", repo: "web", number: parsePrNumber(57) },
    });
    expect(
      await resolveContext({ reader, owner: "ACME", repo: "Web", pr: null })
    ).toEqual({ owner: "ACME", repo: "Web", number: parsePrNumber(57) });
  });

  it("orders the connected stack bottom-to-top", () => {
    const ordered = orderStack(context, "main", [
      {
        number: parsePrNumber(41),
        headRepository: { owner: "owner", repo: "repo" },
        headRefName: "base-feature",
        baseRefName: "main",
      },
      {
        number: context.number,
        headRepository: { owner: "owner", repo: "repo" },
        headRefName: "feature",
        baseRefName: "base-feature",
      },
      {
        number: parsePrNumber(43),
        headRepository: { owner: "owner", repo: "repo" },
        headRefName: "upstack",
        baseRefName: "feature",
      },
    ]);
    expect(ordered.map((item) => Number(item.number))).toEqual([41, 42, 43]);
  });

  it("keeps a PR whose head is the default branch out of every stack", () => {
    const repo = { owner: "owner", repo: "repo" };
    const backport = parsePrNumber(2);
    const open = [
      {
        number: backport,
        headRepository: repo,
        headRefName: "main",
        baseRefName: "release",
      },
      {
        number: context.number,
        headRepository: repo,
        headRefName: "feature",
        baseRefName: "main",
      },
      {
        number: parsePrNumber(43),
        headRepository: repo,
        headRefName: "upstack",
        baseRefName: "feature",
      },
    ];
    expect(numbers(orderStack(context, "main", open))).toEqual([42, 43]);
    expect(
      numbers(orderStack({ ...context, number: backport }, "main", open))
    ).toEqual([2]);
  });

  it("keeps a PR that brings the default branch into a feature branch out of that feature's stack", () => {
    const repo = { owner: "owner", repo: "repo" };
    const sync = parsePrNumber(7);
    const open = [
      {
        number: context.number,
        headRepository: repo,
        headRefName: "feature",
        baseRefName: "main",
      },
      {
        number: sync,
        headRepository: repo,
        headRefName: "main",
        baseRefName: "feature",
      },
    ];
    expect(numbers(orderStack(context, "main", open))).toEqual([42]);
    expect(
      numbers(orderStack({ ...context, number: sync }, "main", open))
    ).toEqual([7]);
  });

  it("still stacks a fork PR whose head branch has the default branch's name", () => {
    const fork = parsePrNumber(50);
    const open = [
      {
        number: context.number,
        headRepository: { owner: "owner", repo: "repo" },
        headRefName: "feature",
        baseRefName: "main",
      },
      {
        number: fork,
        headRepository: { owner: "contributor", repo: "repo" },
        headRefName: "main",
        baseRefName: "feature",
      },
    ];
    expect(numbers(orderStack(context, "main", open))).toEqual([42, 50]);
    expect(
      numbers(orderStack({ ...context, number: fork }, "main", open))
    ).toEqual([42, 50]);
  });

  it("stops at the default branch when it is an integration branch with a release PR", () => {
    const repo = { owner: "owner", repo: "repo" };
    const open = [
      {
        number: parsePrNumber(500),
        headRepository: repo,
        headRefName: "develop",
        baseRefName: "main",
      },
      {
        number: parsePrNumber(612),
        headRepository: repo,
        headRefName: "feature/login",
        baseRefName: "develop",
      },
      {
        number: parsePrNumber(613),
        headRepository: repo,
        headRefName: "fix/typo",
        baseRefName: "develop",
      },
    ];
    expect(
      numbers(
        orderStack({ ...repo, number: parsePrNumber(612) }, "develop", open)
      )
    ).toEqual([612]);
    expect(
      numbers(
        orderStack({ ...repo, number: parsePrNumber(500) }, "develop", open)
      )
    ).toEqual([500]);
  });

  it("reads the default branch once while discovering a stack", async () => {
    const reader = fakeReader({ defaultBranch: "trunk" });
    expect(await discoverStack(reader, context)).toEqual([context]);
    expect(reader.calls).toEqual(["openPullRequests", "defaultBranch"]);
  });

  it("orders a discovered stack around the default branch the repository reports", async () => {
    const repo = { owner: "owner", repo: "repo" };
    const reader = fakeReader({
      defaultBranch: "develop",
      openPullRequests: [
        {
          number: parsePrNumber(500),
          headRepository: repo,
          headRefName: "develop",
          baseRefName: "main",
        },
        {
          number: context.number,
          headRepository: repo,
          headRefName: "feature",
          baseRefName: "develop",
        },
      ],
    });
    expect(numbers(await discoverStack(reader, context))).toEqual([42]);
  });

  it("refuses a full open-PR page, which may have cut the stack", async () => {
    const openPrs = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        number: parsePrNumber(index + 1),
        headRepository: { owner: "owner", repo: "repo" },
        headRefName: `branch-${index + 1}`,
        baseRefName: "main",
      }));
    await expect(
      discoverStack(fakeReader({ openPullRequests: openPrs(300) }), context)
    ).rejects.toMatchObject({ failure: { kind: "invalid-stack" } });
    expect(
      await discoverStack(
        fakeReader({ openPullRequests: openPrs(299) }),
        context
      )
    ).toEqual([context]);
  });

  it("does not use a fork's same-named head as a stack parent", () => {
    const ordered = orderStack(context, "main", [
      { number: parsePrNumber(41), headRefName: "base-feature", baseRefName: "main", headRepository: { owner: "contributor", repo: "repo" } },
      { number: context.number, headRefName: "feature", baseRefName: "base-feature", headRepository: { owner: "owner", repo: "repo" } },
    ]);
    expect(ordered.map((item) => Number(item.number))).toEqual([42]);
  });

  it("does not attach upstream branch children to a fork head", () => {
    const ordered = orderStack(context, "main", [
      { number: context.number, headRefName: "feature", baseRefName: "main", headRepository: { owner: "contributor", repo: "repo" } },
      { number: parsePrNumber(43), headRefName: "upstack", baseRefName: "feature", headRepository: { owner: "owner", repo: "repo" } },
    ]);
    expect(ordered.map((item) => Number(item.number))).toEqual([42]);
  });

  it("terminates when an unrelated fork opens main against main", () => {
    // Bound the subprocess so this regression reports a failure instead of hanging the suite.
    const program = `import { orderStack } from ${JSON.stringify(import.meta.dir + "/github.ts")};
      console.log(JSON.stringify(orderStack(${JSON.stringify(context)}, "main", [
        { number: 41, headRefName: "main", baseRefName: "main", headRepository: { owner: "contributor", repo: "repo" } },
        { number: 42, headRefName: "feature", baseRefName: "main", headRepository: { owner: "owner", repo: "repo" } }
      ])));`;
    const child = spawnSync(process.execPath, ["-e", program], { encoding: "utf8", timeout: 2000 });
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(JSON.parse(child.stdout).map((item: { number: number }) => item.number)).toEqual([42]);
  });

  it("requests and parses fork identity from gh before stack discovery", () => {
    const directory = mkdtempSync(join(tmpdir(), "watch-pr-fork-"));
    try {
      writeFileSync(join(directory, "gh"), `#!/bin/sh
case "$*" in
  *number,headRefName,baseRefName,headRepository,headRepositoryOwner*) ;;
  *) exit 2 ;;
esac
printf '%s\\n' '[{"number":42,"headRefName":"feature","baseRefName":"main","headRepository":{"name":"repo"},"headRepositoryOwner":{"login":"contributor"}}]'
`, { mode: 0o755 });
      const program = `import { GhGitHubReader } from ${JSON.stringify(import.meta.dir + "/github.ts")};
        import { WatchDeadline } from ${JSON.stringify(import.meta.dir + "/deadline.ts")};
        console.log(JSON.stringify(await new GhGitHubReader(new WatchDeadline(0, Date.now)).openPullRequests({ owner: "owner", repo: "repo" })));`;
      const child = spawnSync(process.execPath, ["-e", program], {
        encoding: "utf8", timeout: 2000,
        env: { ...process.env, PATH: directory + ":" + process.env.PATH },
      });
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(0);
      expect(JSON.parse(child.stdout)).toEqual([
        { number: 42, headRefName: "feature", baseRefName: "main", headRepository: { owner: "contributor", repo: "repo" } },
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

});
