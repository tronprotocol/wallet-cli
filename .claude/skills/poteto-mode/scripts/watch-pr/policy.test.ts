import { describe, expect, it } from "bun:test";
import { WatchDeadline } from "./deadline.ts";
import { WatcherQueryError } from "./github.ts";
import {
  applyQueueSnapshot,
  assessGitHubMerge,
  classifyPr,
  createQueueState,
  evaluateQueue,
  noChecksConfirmer,
  planQueue,
  queryBackoffSeconds,
  readSnapshot,
  runQueued,
  runSimple,
  selectTierMajorStackDecision,
} from "./policy.ts";
import {
  fakeReader,
  failedCheck,
  passingCheck,
  pendingCheck,
} from "./fakes.test-helper.ts";
import type {
  GitHubReader,
  NonEmpty,
  PollingOptions,
  PrContext,
  ProgressVerdict,
  PullRequestFacts,
  RollupState,
} from "./types.ts";
import { parsePrNumber } from "./types.ts";

const context = (number: number): PrContext => ({
  owner: "owner",
  repo: "repo",
  number: parsePrNumber(number),
});
const options = {
  interval: 10,
  sweepInterval: 300,
  timeout: 0,
  maxQueryErrors: 5,
  allowDraft: false,
} satisfies PollingOptions;

describe("readiness truth table", () => {
  it("covers every specified row and every UNKNOWN rollup value", () => {
    const cases: readonly [
      PullRequestFacts["mergeStateStatus"],
      RollupState,
      "allowed" | "refused",
    ][] = [
      ["BLOCKED", "FAILURE", "refused"],
      ["BLOCKED", "ERROR", "refused"],
      ["BLOCKED", "PENDING", "allowed"],
      ["UNSTABLE", "FAILURE", "allowed"],
      ["UNKNOWN", "ERROR", "allowed"],
      ["UNKNOWN", "EXPECTED", "allowed"],
      ["UNKNOWN", "FAILURE", "allowed"],
      ["UNKNOWN", "PENDING", "allowed"],
      ["UNKNOWN", "SUCCESS", "allowed"],
      ["UNKNOWN", null, "allowed"],
      ["CLEAN", "SUCCESS", "allowed"],
    ];
    for (const [mergeStateStatus, headRollupState, expected] of cases) {
      expect(
        assessGitHubMerge({ mergeStateStatus, headRollupState }).kind,
      ).toBe(expected);
    }
  });

  it("turns a clean visible list plus GitHub refusal into an explicit CI blocker", async () => {
    const reader = fakeReader({
      facts: { mergeStateStatus: "BLOCKED" },
      fastPath: { kind: "checks", checks: [passingCheck()] },
      commitRollups: [{ oid: "head", state: "FAILURE" }],
    });
    const snapshot = await readSnapshot({
      reader,
      context: context(1),
      pendingHistory: "include",
      allowDraft: false,
    });
    expect(snapshot.kind).toBe("open");
    if (snapshot.kind !== "open") throw new Error("expected open snapshot");
    expect(snapshot.ci.kind).toBe("ci-github-rejected");
    expect(classifyPr(snapshot)).toMatchObject({
      kind: "blocker",
      blocker: { kind: "failing-checks" },
    });
  });
});

describe("snapshot query planning", () => {
  it("does not query commit rollups while queued checks are pending", async () => {
    const reader = fakeReader({
      fastPath: { kind: "checks", checks: [pendingCheck()] },
    });
    const snapshot = await readSnapshot({
      reader,
      context: context(2),
      pendingHistory: "omit",
      allowDraft: false,
    });
    expect(snapshot.kind).toBe("open");
    if (snapshot.kind !== "open") throw new Error("expected open snapshot");
    expect(snapshot.ci.kind).toBe("ci-pending");
    expect(reader.calls).toEqual([
      "pullRequest",
      "reviewThreadPage:null",
      "checksFastPath",
      "pullRequest",
    ]);
  });

  it("queries rollups for settled and failed lists", async () => {
    const settled = fakeReader();
    await readSnapshot({
      reader: settled,
      context: context(3),
      pendingHistory: "omit",
      allowDraft: false,
    });
    expect(settled.calls).toContain("commitRollups");

    const failed = fakeReader({
      fastPath: { kind: "checks", checks: [failedCheck()] },
    });
    await readSnapshot({
      reader: failed,
      context: context(4),
      pendingHistory: "omit",
      allowDraft: false,
    });
    expect(failed.calls).toContain("commitRollups");
  });

  it("short-circuits merged rows before threads and checks", async () => {
    const reader = fakeReader({
      facts: { state: "MERGED", mergedAt: "2026-07-26T00:00:00Z" },
    });
    expect(
      (
        await readSnapshot({
          reader,
          context: context(5),
          pendingHistory: "include",
          allowDraft: false,
        })
      ).kind,
    ).toBe("merged");
    expect(reader.calls).toEqual(["pullRequest"]);
  });
});

it("scans stacks tier-major so an upstack conflict outranks frontier CI", async () => {
  const frontier = await readSnapshot({
    reader: fakeReader({
      fastPath: { kind: "checks", checks: [failedCheck()] },
      commitRollups: [{ oid: "head", state: "FAILURE" }],
    }),
    context: context(10),
    pendingHistory: "omit",
    allowDraft: false,
  });
  const upstack = await readSnapshot({
    reader: fakeReader({ facts: { mergeable: "CONFLICTING" } }),
    context: context(11),
    pendingHistory: "omit",
    allowDraft: false,
  });
  const decision = selectTierMajorStackDecision([frontier, upstack]);
  expect(decision).toMatchObject({
    kind: "blocker",
    blocker: { kind: "merge-conflicts", pr: { number: 11 } },
  });
});

it("attributes a stack wait to the PR whose checks are pending, not the bottom", async () => {
  const readyBottom = await readSnapshot({
    reader: fakeReader(),
    context: context(20),
    pendingHistory: "omit",
    allowDraft: false,
  });
  const pendingUpstack = await readSnapshot({
    reader: fakeReader({
      fastPath: { kind: "checks", checks: [pendingCheck("upstack-build")] },
    }),
    context: context(21),
    pendingHistory: "omit",
    allowDraft: false,
  });
  const decision = selectTierMajorStackDecision([readyBottom, pendingUpstack]);
  expect(decision).toMatchObject({
    kind: "waiting",
    frontier: { number: 21 },
    reason: { kind: "pending-checks", pending: [{ name: "upstack-build" }] },
  });
});

it("waits on a draft while checks are pending, then reports the draft gate", async () => {
  const pending = await readSnapshot({
    reader: fakeReader({
      facts: { isDraft: true },
      fastPath: { kind: "checks", checks: [pendingCheck()] },
    }),
    context: context(12),
    pendingHistory: "omit",
    allowDraft: false,
  });
  expect(classifyPr(pending).kind).toBe("waiting");

  const settled = await readSnapshot({
    reader: fakeReader({ facts: { isDraft: true } }),
    context: context(12),
    pendingHistory: "omit",
    allowDraft: false,
  });
  expect(classifyPr(settled)).toMatchObject({
    kind: "blocker",
    blocker: { kind: "merge-gate", reason: "draft-pr" },
  });
});

describe("queued-stack cadence", () => {
  async function openSnapshot(pr: PrContext) {
    return readSnapshot({
      reader: fakeReader(),
      context: pr,
      pendingHistory: "omit",
      allowDraft: false,
    });
  }

  it("drops a sweep head only after its snapshot succeeds", async () => {
    const queue = [
      context(20),
      context(21),
      context(22),
    ] satisfies NonEmpty<PrContext>;
    let state = createQueueState(queue, 0);
    const first = await openSnapshot(queue[0]);
    state = applyQueueSnapshot(state, first, 0, options).state;
    expect(state.work).toMatchObject({
      kind: "whole-stack-sweep",
      remaining: [{ number: 21 }, { number: 22 }],
    });
    const second = await openSnapshot(queue[1]);
    state = applyQueueSnapshot(state, second, 60, options).state;
    expect(state.work).toMatchObject({
      kind: "whole-stack-sweep",
      remaining: [{ number: 22 }],
    });
  });

  it("resumes the sweep at the PR whose read failed", async () => {
    const middle = context(21);
    const base = fakeReader();
    let failNext = true;
    const timeline: string[] = [];
    const reader = {
      ...base,
      async pullRequest(pr: PrContext) {
        if (pr.number === middle.number && failNext) {
          failNext = false;
          timeline.push(`fail:${pr.number}`);
          throw new WatcherQueryError({
            kind: "command-exit",
            retryable: true,
            detail: "rate limited",
            code: 1,
          });
        }
        timeline.push(`read:${pr.number}`);
        return base.pullRequest(pr);
      },
    } satisfies GitHubReader;
    let now = 0;
    let sleeps = 0;
    const running = runQueued({
      dependencies: {
        reader,
        deadline: new WatchDeadline(options.timeout, () => now),
        clock: {
          now: () => now,
          observedAt: () => "2026-07-26T00:00:00.000Z",
          async sleep(seconds) {
            timeline.push("sleep");
            now += seconds;
            sleeps += 1;
            if (sleeps === 2) throw new Error("stop after resume proof");
          },
        },
        emit(verdict) {
          timeline.push(`emit:${verdict.kind}`);
        },
      },
      contexts: [context(20), middle, context(22)],
      options,
    });
    await expect(running).rejects.toThrow("stop after resume proof");
    expect(timeline).toEqual([
      "emit:QUEUE",
      "read:20",
      "read:20",
      "fail:21",
      "emit:RETRY",
      "sleep",
      "read:21",
      "read:21",
      "read:22",
      "read:22",
      "emit:STATUS",
      "emit:WAITING",
      "sleep",
    ]);
  });

  it("emits a completed sweep only after its final successful snapshot", async () => {
    const queue = [context(30), context(31)] satisfies NonEmpty<PrContext>;
    let state = createQueueState(queue, 0);
    const first = applyQueueSnapshot(
      state,
      await openSnapshot(queue[0]),
      0,
      options,
    );
    expect(first.completedSweepRows).toBeNull();
    state = first.state;
    const second = applyQueueSnapshot(
      state,
      await openSnapshot(queue[1]),
      5,
      options,
    );
    expect(
      second.completedSweepRows?.map((row) => Number(row.context.number)),
    ).toEqual([30, 31]);
    expect(second.state.nextSweepAt).toBe(305);
  });

  it("ADVANCE continues directly to the new frontier without sleeping", async () => {
    const one = context(40);
    const two = context(41);
    const base = fakeReader();
    const reads = new Map<number, number>();
    const timeline: string[] = [];
    const reader = {
      ...base,
      async pullRequest(pr: PrContext) {
        timeline.push(`read:${pr.number}`);
        const facts = await base.pullRequest(pr);
        const count = (reads.get(pr.number) ?? 0) + 1;
        reads.set(pr.number, count);
        return pr.number === one.number && count > 2
          ? {
              ...facts,
              state: "MERGED" as const,
              mergedAt: "2026-07-26T00:00:00Z",
            }
          : facts;
      },
    } satisfies GitHubReader;
    let now = 0;
    let sleeps = 0;
    const emitted: ProgressVerdict[] = [];
    const running = runQueued({
      dependencies: {
        reader,
        deadline: new WatchDeadline(options.timeout, () => now),
        clock: {
          now: () => now,
          observedAt: () => "2026-07-26T00:00:00.000Z",
          async sleep(seconds) {
            timeline.push("sleep");
            now += seconds;
            sleeps += 1;
            if (sleeps === 2) throw new Error("stop after advance proof");
          },
        },
        emit(verdict) {
          emitted.push(verdict);
          timeline.push(`emit:${verdict.kind}`);
        },
      },
      contexts: [one, two],
      options,
    });
    await expect(running).rejects.toThrow("stop after advance proof");
    expect(emitted.some((event) => event.kind === "ADVANCE")).toBe(true);
    const firstSleep = timeline.indexOf("sleep");
    expect(timeline.slice(firstSleep, firstSleep + 6)).toEqual([
      "sleep",
      "read:40",
      "emit:ADVANCE",
      "read:41",
      "read:41",
      "emit:WAITING",
    ]);
  });

  it("deduplicates identical waits and schedules the next due sweep", async () => {
    const queue = [context(50)] satisfies NonEmpty<PrContext>;
    let state = createQueueState(queue, 0);
    state = applyQueueSnapshot(
      state,
      await openSnapshot(queue[0]),
      0,
      options,
    ).state;
    const first = evaluateQueue(state, options);
    expect(first.kind).toBe("waiting");
    if (first.kind !== "waiting") throw new Error("expected waiting");
    expect(first.emit).toBe(true);
    const second = evaluateQueue(first.state, options);
    expect(second.kind).toBe("waiting");
    if (second.kind !== "waiting") throw new Error("expected waiting");
    expect(second.emit).toBe(false);
    expect(planQueue(second.state, 300).work?.kind).toBe("whole-stack-sweep");
  });
});

it("uses the specified retry floor and cap", () => {
  expect(queryBackoffSeconds(1, 1)).toBe(60);
  expect(queryBackoffSeconds(1, 2)).toBe(120);
  expect(queryBackoffSeconds(60, 4)).toBe(300);
});

describe("review gate", () => {
  it("blocks on a required review instead of reporting a blocked PR ready", async () => {
    const snapshot = await readSnapshot({
      reader: fakeReader({
        facts: { reviewDecision: "REVIEW_REQUIRED", mergeStateStatus: "BLOCKED" },
      }),
      context: context(23),
      pendingHistory: "omit",
      allowDraft: false,
    });
    expect(classifyPr(snapshot)).toEqual({
      kind: "blocker",
      blocker: { kind: "merge-gate", pr: context(23), reason: "review-required" },
    });
    expect(
      selectTierMajorStackDecision([snapshot] as NonEmpty<typeof snapshot>),
    ).toMatchObject({
      kind: "blocker",
      blocker: { kind: "merge-gate", reason: "review-required" },
    });
  });

  it("blocks when branch protection holds an approved PR with clean CI", async () => {
    const snapshot = await readSnapshot({
      reader: fakeReader({ facts: { mergeStateStatus: "BLOCKED" } }),
      context: context(24),
      pendingHistory: "omit",
      allowDraft: false,
    });
    expect(classifyPr(snapshot)).toMatchObject({
      kind: "blocker",
      blocker: { kind: "merge-gate", reason: "merge-blocked" },
    });
  });

  it("waits for pending checks before reporting the review gate", async () => {
    const snapshot = await readSnapshot({
      reader: fakeReader({
        facts: { reviewDecision: "REVIEW_REQUIRED", mergeStateStatus: "BLOCKED" },
        fastPath: { kind: "checks", checks: [pendingCheck()] },
      }),
      context: context(26),
      pendingHistory: "omit",
      allowDraft: false,
    });
    expect(classifyPr(snapshot)).toMatchObject({ kind: "waiting" });
  });

  it("still reports changes requested as a merge-gate blocker", async () => {
    const snapshot = await readSnapshot({
      reader: fakeReader({
        facts: { reviewDecision: "CHANGES_REQUESTED", mergeStateStatus: "BLOCKED" },
      }),
      context: context(25),
      pendingHistory: "omit",
      allowDraft: false,
    });
    expect(classifyPr(snapshot)).toMatchObject({
      kind: "blocker",
      blocker: { kind: "merge-gate", reason: "changes-requested" },
    });
  });
});

describe("facts that change while the snapshot is read", () => {
  const read = (options: Parameters<typeof fakeReader>[0]) =>
    readSnapshot({
      reader: fakeReader(options),
      context: context(29),
      pendingHistory: "include",
      allowDraft: false,
    });

  it("retries instead of reporting a merge gate the checks read has already cleared", async () => {
    await expect(
      read({
        facts: { mergeStateStatus: "BLOCKED" },
        factsOnReread: { mergeStateStatus: "CLEAN" },
      }),
    ).rejects.toMatchObject({
      failure: { kind: "snapshot-changed", retryable: true },
    });
  });

  it("retries instead of reporting ready when a review lands after the facts read", async () => {
    for (const factsOnReread of [
      { reviewDecision: "CHANGES_REQUESTED" },
      { mergeable: "CONFLICTING" },
      { mergeable: "UNKNOWN" },
      { isDraft: true },
    ] as const)
      await expect(read({ factsOnReread })).rejects.toMatchObject({
        failure: { kind: "snapshot-changed", retryable: true },
      });
  });

  it("retries when the PR closes, merges, or renames its head branch between the two reads", async () => {
    for (const factsOnReread of [
      { state: "CLOSED" },
      { mergedAt: "2026-07-26T00:00:00Z" },
      { headRefName: "renamed" },
    ] as const)
      await expect(read({ factsOnReread })).rejects.toMatchObject({
        failure: { kind: "snapshot-changed", retryable: true },
      });
  });

  it("keeps an unknown first read when GitHub computes mergeability before the re-read", async () => {
    const unknown = {
      mergeable: "UNKNOWN",
      mergeStateStatus: "UNKNOWN",
    } as const;
    expect(
      await read({
        facts: unknown,
        factsOnReread: { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" },
      }),
    ).toMatchObject({ kind: "open", facts: unknown });
    await expect(
      read({
        facts: unknown,
        factsOnReread: { reviewDecision: "CHANGES_REQUESTED" },
      }),
    ).rejects.toMatchObject({ failure: { kind: "snapshot-changed" } });
  });
});

const ticking = (onSleep = () => {}) => {
  let now = 0;
  return {
    now: () => now,
    async sleep(seconds: number) {
      now += seconds;
      // A wait that never ends would spin on this clock without yielding to
      // the test runner's own timeout.
      if (now > 3600) throw new Error("no verdict within an hour of polling");
      onSleep();
    },
  };
};
const dependencies = (
  reader: GitHubReader,
  clock: { now: () => number; sleep: (seconds: number) => Promise<void> },
  emitted: ProgressVerdict[],
  timeout = 0,
) => ({
  reader,
  emit: (verdict: ProgressVerdict) => {
    emitted.push(verdict);
  },
  clock: { ...clock, observedAt: () => "2026-07-26T00:00:00.000Z" },
  deadline: new WatchDeadline(timeout, clock.now),
});
const kinds = (emitted: readonly ProgressVerdict[]) =>
  emitted.map((verdict) =>
    verdict.kind === "WAITING"
      ? `${verdict.kind}:${verdict.reason.kind}`
      : verdict.kind,
  );

describe("mergeability", () => {
  const unknown = {
    mergeable: "UNKNOWN",
    mergeStateStatus: "UNKNOWN",
  } as const;
  const read = (options: Parameters<typeof fakeReader>[0]) =>
    readSnapshot({
      reader: fakeReader(options),
      context: context(27),
      pendingHistory: "include",
      allowDraft: false,
    });
  // One query error ends the run, so a wait that spent the budget would exit 7.
  const watch = async (
    reader: GitHubReader,
    polling: Partial<PollingOptions> = {},
    statusOnly = false,
  ) => {
    const clock = ticking();
    const emitted: ProgressVerdict[] = [];
    const verdict = await runSimple({
      dependencies: dependencies(reader, clock, emitted, polling.timeout),
      contexts: [context(27)],
      mode: "single",
      statusOnly,
      options: { ...options, maxQueryErrors: 1, ...polling },
    });
    return { verdict, emitted: kinds(emitted), elapsed: clock.now() };
  };

  it("waits while GitHub has not computed mergeability instead of reporting ready", async () => {
    for (const facts of [
      { mergeable: "UNKNOWN" },
      { mergeStateStatus: "UNKNOWN" },
    ] as const) {
      const snapshot = await read({ facts });
      const waiting = {
        kind: "waiting",
        frontier: context(27),
        reason: { kind: "mergeability-unknown" },
      } as const;
      expect(classifyPr(snapshot)).toEqual(waiting);
      expect(selectTierMajorStackDecision([snapshot])).toEqual(waiting);
    }
  });

  it("re-polls at the interval after an unknown first read, without spending the query-error budget", async () => {
    const { verdict, emitted, elapsed } = await watch(
      fakeReader({
        facts: unknown,
        factsOnReread: { mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" },
      }),
    );
    expect(emitted).toEqual(["WAITING:mergeability-unknown"]);
    expect(elapsed).toBe(options.interval);
    expect(verdict).toMatchObject({ kind: "READY", exitCode: 0 });
  });

  it("times out at the caller's deadline when GitHub never computes it", async () => {
    const { verdict, emitted, elapsed } = await watch(
      fakeReader({ facts: unknown }),
      { timeout: 25 },
    );
    expect(emitted).toEqual([
      "WAITING:mergeability-unknown",
      "WAITING:mergeability-unknown",
      "WAITING:mergeability-unknown",
    ]);
    expect(elapsed).toBe(25);
    expect(verdict).toMatchObject({
      kind: "TIMEOUT",
      exitCode: 5,
      reason: { kind: "mergeability-unknown" },
    });
  });

  it("reports an unknown row on a status-only pass and exits 0 without waiting", async () => {
    const { verdict, emitted, elapsed } = await watch(
      fakeReader({ facts: unknown }),
      {},
      true,
    );
    expect(emitted).toEqual([]);
    expect(elapsed).toBe(0);
    expect(verdict).toMatchObject({
      kind: "STATUS",
      exitCode: 0,
      rows: [{ kind: "open", facts: unknown, ci: { kind: "ci-clean" } }],
    });
  });

  it("still stops at once on a blocker that does not depend on mergeability", async () => {
    const thread = {
      id: "thread",
      firstComment: null,
      isBugbot: false,
      bugbotReviewPasses: 0,
    };
    const cases = [
      [{ threads: [thread] }, { kind: "review-threads" }],
      [
        {
          fastPath: { kind: "checks", checks: [failedCheck()] },
          commitRollups: [{ oid: "head", state: "FAILURE" }],
        },
        { kind: "failing-checks" },
      ],
      [
        { facts: { ...unknown, reviewDecision: "CHANGES_REQUESTED" } },
        { kind: "merge-gate", reason: "changes-requested" },
      ],
    ] as const;
    for (const [overrides, blocker] of cases)
      expect(
        classifyPr(await read({ facts: unknown, ...overrides })),
      ).toMatchObject({ kind: "blocker", blocker });
  });

  it("defers a required review, and names pending checks first, while mergeability is unknown", async () => {
    expect(
      classifyPr(
        await read({ facts: { ...unknown, reviewDecision: "REVIEW_REQUIRED" } }),
      ),
    ).toMatchObject({
      kind: "waiting",
      reason: { kind: "mergeability-unknown" },
    });
    expect(
      classifyPr(
        await read({
          facts: unknown,
          fastPath: { kind: "checks", checks: [pendingCheck()] },
        }),
      ),
    ).toMatchObject({ kind: "waiting", reason: { kind: "pending-checks" } });
  });

  it("does not report a queued frontier blocker-free while its mergeability is unknown", async () => {
    let sleeps = 0;
    const emitted: ProgressVerdict[] = [];
    const running = runQueued({
      dependencies: dependencies(
        fakeReader({ facts: unknown }),
        ticking(() => {
          if (++sleeps === 2) throw new Error("stop after two polls");
        }),
        emitted,
      ),
      contexts: [context(27)],
      options,
    });
    await expect(running).rejects.toThrow("stop after two polls");
    expect(kinds(emitted)).toEqual([
      "QUEUE",
      "STATUS",
      "WAITING:mergeability-unknown",
    ]);
  });

  it("gates a branch that is behind its base instead of reporting it ready", async () => {
    const snapshot = await readSnapshot({
      reader: fakeReader({ facts: { mergeStateStatus: "BEHIND" } }),
      context: context(28),
      pendingHistory: "include",
      allowDraft: false,
    });
    expect(classifyPr(snapshot)).toEqual({
      kind: "blocker",
      blocker: { kind: "merge-gate", pr: context(28), reason: "behind-base" },
    });
  });

  it("stops at once on a branch behind its base, without waiting for checks that are pending or unreported", async () => {
    for (const checks of [
      { fastPath: { kind: "checks", checks: [pendingCheck()] } },
      {
        fastPath: { kind: "none-reported" },
        rollupPages: [{ kind: "no-rollup" }],
        commitRollups: [{ oid: "head", state: null }],
      },
    ] as const)
      expect(
        classifyPr(
          await read({ facts: { mergeStateStatus: "BEHIND" }, ...checks }),
        ),
      ).toEqual({
        kind: "blocker",
        blocker: { kind: "merge-gate", pr: context(27), reason: "behind-base" },
      });
  });

  it("reports requested changes before a behind base, and a behind base before a required review", async () => {
    for (const [reviewDecision, reason] of [
      ["CHANGES_REQUESTED", "changes-requested"],
      ["REVIEW_REQUIRED", "behind-base"],
    ] as const)
      expect(
        classifyPr(
          await read({
            facts: { mergeStateStatus: "BEHIND", reviewDecision },
            fastPath: { kind: "checks", checks: [pendingCheck()] },
          }),
        ),
      ).toMatchObject({ kind: "blocker", blocker: { reason } });
  });
});

describe("a PR with no checks configured", () => {
  const noChecks = {
    fastPath: { kind: "none-reported" },
    rollupPages: [{ kind: "no-rollup" }],
    commitRollups: [{ oid: "head", state: null }],
  } as const;
  const read = (
    overrides: Parameters<typeof fakeReader>[0] = {},
    confirmNoChecks = () => true,
  ) =>
    readSnapshot({
      reader: fakeReader({ ...noChecks, ...overrides }),
      context: context(30),
      pendingHistory: "omit",
      allowDraft: false,
      confirmNoChecks,
    });
  const run = (...args: Parameters<typeof dependencies>) =>
    runSimple({
      dependencies: dependencies(...args),
      contexts: [context(30)],
      mode: "single",
      statusOnly: false,
      options,
    });
  // The suite polls every 10 seconds, so the 60 second floor is six polls.
  const sixPolls = (...perPoll: string[]) =>
    Array.from({ length: 6 }, () => perPoll).flat();

  it("is ready once the no-checks reading is confirmed and GitHub reports it mergeable", async () => {
    const snapshot = await read({ facts: { reviewDecision: null } });
    expect(classifyPr(snapshot)).toMatchObject({
      kind: "ready",
      pr: { proof: { ci: { kind: "ci-none" } } },
    });
  });

  it("waits on a first sighting instead of reporting ready or a merge gate", async () => {
    for (const facts of [
      { reviewDecision: null },
      { mergeStateStatus: "BLOCKED" },
      { reviewDecision: "REVIEW_REQUIRED" },
    ] as const) {
      const snapshot = await read({ facts }, () => false);
      expect(snapshot).toMatchObject({
        kind: "open",
        ci: { kind: "ci-unreported" },
      });
      expect(classifyPr(snapshot)).toEqual({
        kind: "waiting",
        frontier: context(30),
        reason: { kind: "checks-unreported" },
      });
    }
  });

  it("confirms no checks only once the same head has shown none for 60 seconds", () => {
    let now = 0;
    const confirm = noChecksConfirmer({ now: () => now });
    const head = { context: context(30), headRefOid: "head" };
    expect(confirm(head)).toBe(false);
    now = 59;
    expect(confirm(head)).toBe(false);
    now = 60;
    expect(confirm(head)).toBe(true);
    expect(confirm({ ...head, headRefOid: "pushed" })).toBe(false);
    now = 119;
    expect(confirm({ ...head, headRefOid: "pushed" })).toBe(false);
    now = 120;
    expect(confirm({ ...head, headRefOid: "pushed" })).toBe(true);
  });

  it("times each PR from its own first sighting, not from another PR's", () => {
    let now = 0;
    const confirm = noChecksConfirmer({ now: () => now });
    const first = { context: context(30), headRefOid: "head" };
    const second = { context: context(31), headRefOid: "head" };
    expect(confirm(first)).toBe(false);
    now = 60;
    expect(confirm(second)).toBe(false);
    expect(confirm(first)).toBe(true);
    now = 120;
    expect(confirm(second)).toBe(true);
  });

  it("reads no checks as unreported when the caller supplies no confirmation", async () => {
    expect(
      await readSnapshot({
        reader: fakeReader(noChecks),
        context: context(30),
        pendingHistory: "omit",
        allowDraft: false,
      }),
    ).toMatchObject({ kind: "open", ci: { kind: "ci-unreported" } });
  });

  it("reports a repository with no CI ready 60 seconds after the first sighting, however short the interval", async () => {
    const clock = ticking();
    const emitted: ProgressVerdict[] = [];
    const verdict = await run(
      fakeReader({ ...noChecks, facts: { reviewDecision: null } }),
      clock,
      emitted,
    );
    expect(kinds(emitted)).toEqual(sixPolls("WAITING:checks-unreported"));
    expect(clock.now()).toBe(60);
    expect(verdict).toMatchObject({
      kind: "READY",
      scope: { pr: { proof: { ci: { kind: "ci-none" } } } },
    });
  });

  it("stops at the merge gate only once a blocked PR has shown no checks for 60 seconds", async () => {
    const clock = ticking();
    const emitted: ProgressVerdict[] = [];
    const verdict = await run(
      fakeReader({
        ...noChecks,
        facts: { mergeStateStatus: "BLOCKED", reviewDecision: null },
      }),
      clock,
      emitted,
    );
    expect(kinds(emitted)).toEqual(sixPolls("WAITING:checks-unreported"));
    expect(clock.now()).toBe(60);
    expect(verdict).toMatchObject({
      kind: "BLOCKER",
      exitCode: 6,
      blocker: { kind: "merge-gate", reason: "merge-blocked" },
    });
  });

  it("waits through a first sighting and honours checks that register on the next poll", async () => {
    const base = fakeReader({
      ...noChecks,
      facts: { mergeStateStatus: "BLOCKED", reviewDecision: null },
    });
    let polls = 0;
    const reader = {
      ...base,
      async checksFastPath() {
        polls += 1;
        return polls === 1
          ? { kind: "none-reported" as const }
          : { kind: "checks" as const, checks: [pendingCheck("required-ci")] };
      },
    } satisfies GitHubReader;
    let sleeps = 0;
    const emitted: ProgressVerdict[] = [];
    const running = run(
      reader,
      ticking(() => {
        if (++sleeps === 2) throw new Error("stop after two polls");
      }),
      emitted,
    );
    await expect(running).rejects.toThrow("stop after two polls");
    expect(kinds(emitted)).toEqual([
      "WAITING:checks-unreported",
      "WAITING:pending-checks",
    ]);
  });

  it("times out unconfirmed when the deadline is shorter than the interval or than the 60 seconds", async () => {
    for (const [timeout, polls] of [
      [options.interval / 2, 1],
      [30, 3],
    ] as const) {
      const emitted: ProgressVerdict[] = [];
      const verdict = await run(
        fakeReader({ ...noChecks, facts: { reviewDecision: null } }),
        ticking(),
        emitted,
        timeout,
      );
      expect(kinds(emitted)).toEqual(
        Array.from({ length: polls }, () => "WAITING:checks-unreported"),
      );
      expect(verdict).toMatchObject({
        kind: "TIMEOUT",
        exitCode: 5,
        reason: { kind: "checks-unreported" },
      });
    }
  });

  it("confirms each PR of a stack on its own sightings", async () => {
    const clock = ticking();
    const emitted: ProgressVerdict[] = [];
    const verdict = await runSimple({
      dependencies: dependencies(
        fakeReader({ ...noChecks, facts: { reviewDecision: null } }),
        clock,
        emitted,
      ),
      contexts: [context(30), context(31)],
      mode: "stack",
      statusOnly: false,
      options,
    });
    expect(kinds(emitted)).toEqual([
      ...sixPolls("STATUS", "WAITING:checks-unreported"),
      "STATUS",
    ]);
    expect(clock.now()).toBe(60);
    expect(verdict).toMatchObject({
      kind: "READY",
      scope: {
        kind: "stack",
        prs: [
          { context: context(30), proof: { ci: { kind: "ci-none" } } },
          { context: context(31), proof: { ci: { kind: "ci-none" } } },
        ],
      },
    });
  });

  it("holds a queued frontier for the 60 seconds before reporting it blocker-free", async () => {
    const emitted: ProgressVerdict[] = [];
    const emittedAt: number[] = [];
    const clock = ticking(() => {
      if (clock.now() > 60) throw new Error("stop after the confirmation");
    });
    const queued = dependencies(
      fakeReader({ ...noChecks, facts: { reviewDecision: null } }),
      clock,
      emitted,
    );
    const running = runQueued({
      dependencies: {
        ...queued,
        emit(verdict) {
          emittedAt.push(clock.now());
          queued.emit(verdict);
        },
      },
      contexts: [context(30)],
      options,
    });
    await expect(running).rejects.toThrow("stop after the confirmation");
    expect(kinds(emitted)).toEqual([
      "QUEUE",
      "STATUS",
      "WAITING:checks-unreported",
      "WAITING:merge-queue",
    ]);
    expect(emittedAt).toEqual([0, 0, 0, 60]);
  });

  it("still stops on conflicts, review threads, and merge gates", async () => {
    const thread = {
      id: "thread",
      firstComment: null,
      isBugbot: false,
      bugbotReviewPasses: 0,
    };
    const cases = [
      [{ facts: { mergeable: "CONFLICTING" } }, { kind: "merge-conflicts" }],
      [{ threads: [thread] }, { kind: "review-threads" }],
      [
        { facts: { reviewDecision: "REVIEW_REQUIRED" } },
        { kind: "merge-gate", reason: "review-required" },
      ],
      [
        { facts: { mergeStateStatus: "BLOCKED" } },
        { kind: "merge-gate", reason: "merge-blocked" },
      ],
      [{ facts: { isDraft: true } }, { kind: "merge-gate", reason: "draft-pr" }],
    ] as const;
    for (const [overrides, blocker] of cases)
      expect(classifyPr(await read(overrides))).toMatchObject({
        kind: "blocker",
        blocker,
      });
  });

  it("fails closed while the head may not have reported yet", async () => {
    const unsettled = [
      {
        commitRollups: [
          { oid: "earlier", state: "SUCCESS" },
          { oid: "head", state: null },
        ],
      },
      { commitRollups: [{ oid: "head", state: "PENDING" }] },
    ] as const;
    for (const overrides of unsettled)
      await expect(read(overrides)).rejects.toMatchObject({
        failure: { kind: "checks-unavailable", retryable: true },
      });
  });
});

describe("polling deadline sleeps", () => {
  for (const mode of ["single", "queued-stack", "query-retry"] as const) {
    it(`caps ${mode} sleeps at the configured deadline`, async () => {
      let now = 0;
      const sleeps: number[] = [];
      const pending = fakeReader({ fastPath: { kind: "checks", checks: [pendingCheck()] } });
      const reader = mode === "query-retry"
        ? { ...pending, async pullRequest(): Promise<PullRequestFacts> {
          throw new WatcherQueryError({ kind: "command-exit", retryable: true, code: 1, detail: "temporary failure" });
        } }
        : pending;
      const polling = { ...options, interval: 60, timeout: 5 };
      const dependencies = {
        reader,
        deadline: new WatchDeadline(polling.timeout, () => now),
        clock: {
          now: () => now,
          observedAt: () => "2026-07-26T00:00:00.000Z",
          async sleep(seconds: number) { sleeps.push(seconds); now += seconds; },
        },
        emit() {},
      };
      const result = mode === "queued-stack"
        ? await runQueued({ dependencies, contexts: [context(1)], options: polling })
        : await runSimple({ dependencies, contexts: [context(1)], mode: "single", statusOnly: false, options: polling });
      expect(result.kind).toBe("TIMEOUT");
      expect(sleeps).toEqual([5]);
      expect(now).toBe(5);
    });
  }
  it("preserves the polling interval when the deadline is disabled", async () => {
    let now = 0;
    let reads = 0;
    const sleeps: number[] = [];
    const pending = fakeReader({ fastPath: { kind: "checks", checks: [pendingCheck()] } });
    const passed = fakeReader({ fastPath: { kind: "checks", checks: [passingCheck()] } });
    const result = await runSimple({
      dependencies: {
        reader: {
          ...pending,
          async checksFastPath(pr) {
            reads += 1;
            return reads === 1 ? pending.checksFastPath(pr) : passed.checksFastPath(pr);
          },
        },
        deadline: new WatchDeadline(0, () => now),
        clock: {
          now: () => now,
          observedAt: () => "2026-07-26T00:00:00.000Z",
          async sleep(seconds) { sleeps.push(seconds); now += seconds; },
        },
        emit() {},
      },
      contexts: [context(1)], mode: "single", statusOnly: false,
      options: { ...options, interval: 60, timeout: 0 },
    });
    expect(result.kind).toBe("READY");
    expect(sleeps).toEqual([60]);
  });
});
