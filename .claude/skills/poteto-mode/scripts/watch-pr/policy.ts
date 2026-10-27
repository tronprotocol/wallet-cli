import { landingRevision } from "./landing.ts";
import {
  ChecksUnavailable,
  WatcherQueryError,
  resolveChecks,
  resolveReviewThreads,
} from "./github.ts";
import { DeadlineExceeded, type WatchDeadline } from "./deadline.ts";
import type * as T from "./types.ts";
import { nonEmpty } from "./types.ts";
export function assessGitHubMerge(args: {
  readonly mergeStateStatus: T.MergeStateStatus;
  readonly headRollupState: T.RollupState;
}): T.GitHubMergeAssessment {
  if (args.mergeStateStatus === "BLOCKED") {
    if (args.headRollupState === "ERROR" || args.headRollupState === "FAILURE")
      return {
        kind: "refused",
        mergeStateStatus: args.mergeStateStatus,
        headRollupState: args.headRollupState,
      };
    return {
      kind: "allowed",
      basis: "rollup",
      mergeStateStatus: args.mergeStateStatus,
      headRollupState: args.headRollupState,
    };
  }
  return {
    kind: "allowed",
    basis: "merge-state",
    mergeStateStatus: args.mergeStateStatus,
    headRollupState: args.headRollupState,
  };
}
async function mergeAssessment(
  reader: T.GitHubReader,
  facts: T.PullRequestFacts
) {
  const commits = await reader.commitRollups(facts.context);
  const head = commits.find((commit) => commit.oid === facts.headRefOid);
  if (head === undefined)
    throw new WatcherQueryError({
      kind: "snapshot-changed",
      retryable: true,
      detail: `commit response does not contain expected head ${facts.headRefOid}`,
    });
  const headRollupState = head.state;
  return {
    anyCommitReported: commits.some((commit) => commit.state !== null),
    hadPreviousPassingCi: commits.some(
      (commit) => commit.oid !== facts.headRefOid && commit.state === "SUCCESS"
    ),
    github: assessGitHubMerge({
      mergeStateStatus: facts.mergeStateStatus,
      headRollupState,
    }),
  };
}
type OpenFacts = Extract<T.PullRequestFacts, { readonly state: "OPEN" }>;
export type NoChecksConfirmer = (
  head: Pick<OpenFacts, "context" | "headRefOid">
) => boolean;
// GitHub registers a fresh head's checks seconds after the push, during which
// every read matches a repository with no CI. Across 67 pushes measured in six
// repositories the first check appeared within 9 seconds.
export const NO_CHECKS_CONFIRM_SECONDS = 60;
export function noChecksConfirmer(
  clock: Pick<WatchClock, "now">
): NoChecksConfirmer {
  const firstSeen = new Map<
    T.PrNumber,
    { readonly headRefOid: string; readonly at: number }
  >();
  return (head) => {
    const now = clock.now();
    const prior = firstSeen.get(head.context.number);
    if (prior?.headRefOid === head.headRefOid)
      return now - prior.at >= NO_CHECKS_CONFIRM_SECONDS;
    firstSeen.set(head.context.number, {
      headRefOid: head.headRefOid,
      at: now,
    });
    return false;
  };
}
const neverConfirms: NoChecksConfirmer = () => false;
async function noChecksCi(
  reader: T.GitHubReader,
  facts: OpenFacts,
  confirmNoChecks = neverConfirms
): Promise<T.CiNone | T.CiUnreported> {
  const merge = await mergeAssessment(reader, facts);
  if (merge.anyCommitReported || merge.github.kind === "refused")
    throw new ChecksUnavailable(
      `no checks reported on head ${facts.headRefOid}, but a commit on this PR has reported checks`
    );
  const none = {
    failed: [],
    pending: [],
    hadPreviousPassingCi: false,
  } as const;
  return confirmNoChecks(facts)
    ? { ...none, kind: "ci-none", github: merge.github }
    : { ...none, kind: "ci-unreported" };
}
async function reportedCi(
  reader: T.GitHubReader,
  facts: T.PullRequestFacts,
  checks: T.ReportedChecks,
  pendingHistory: "include" | "omit"
): Promise<T.CiState> {
  const failed = nonEmpty(
    checks.checks.filter(
      (check): check is T.FailedCheck => check.kind === "failed"
    )
  );
  const pending = nonEmpty(
    checks.checks.filter(
      (check): check is T.PendingCheck => check.kind === "pending"
    )
  );
  if (failed === null && pending !== null && pendingHistory === "omit")
    return {
      kind: "ci-pending",
      source: checks.source,
      all: checks.checks,
      failed: [],
      pending,
      hadPreviousPassingCi: false,
    };
  const merge = await mergeAssessment(reader, facts);
  const base = {
    source: checks.source,
    all: checks.checks,
    hadPreviousPassingCi: merge.hadPreviousPassingCi,
  };
  if (failed !== null)
    return {
      ...base,
      kind: "ci-failing",
      failed,
      pending: pending ?? [],
      github: merge.github,
    };
  if (merge.github.kind === "refused")
    return {
      ...base,
      kind: "ci-github-rejected",
      failed: [],
      pending: pending ?? [],
      github: merge.github,
    };
  if (pending !== null)
    return { ...base, kind: "ci-pending", failed: [], pending };
  return {
    ...base,
    kind: "ci-clean",
    failed: [],
    pending: [],
    github: merge.github,
  };
}
const AUTOMATION_TOKENS = [
  "bugbot",
  "security review",
  "pr review automation",
  "review automation",
] as const;
const VERDICT_FACTS: Record<
  Exclude<keyof T.PullRequestFacts, "context">,
  true
> = {
  state: true,
  mergedAt: true,
  isDraft: true,
  mergeable: true,
  mergeStateStatus: true,
  reviewDecision: true,
  headRefOid: true,
  headRefName: true,
  baseRefName: true,
  baseRefOid: true,
};
const mergeabilityUnknown = (facts: T.PullRequestFacts): boolean =>
  facts.mergeable === "UNKNOWN" || facts.mergeStateStatus === "UNKNOWN";
// GitHub computes these two on the first read that asks, so an unknown first
// read usually has its answer by the re-read. That is not the PR changing.
const COMPUTED_ON_DEMAND: ReadonlySet<string> = new Set([
  "mergeable",
  "mergeStateStatus",
]);
const changedFacts = (
  before: T.PullRequestFacts,
  after: T.PullRequestFacts
): string[] =>
  (Object.keys(VERDICT_FACTS) as (keyof typeof VERDICT_FACTS)[])
    .filter((key) => before[key] !== after[key])
    .filter(
      (key) => !(mergeabilityUnknown(before) && COMPUTED_ON_DEMAND.has(key))
    )
    .map((key) => `${key} ${before[key]} -> ${after[key]}`);
export async function readSnapshot(args: {
  readonly reader: T.GitHubReader;
  readonly context: T.PrContext;
  readonly pendingHistory: "include" | "omit";
  readonly allowDraft: boolean;
  readonly confirmNoChecks?: NoChecksConfirmer;
}): Promise<T.PrSnapshot> {
  const facts = await args.reader.pullRequest(args.context);
  if (facts.state === "MERGED" || facts.mergedAt !== null)
    return { kind: "merged", context: args.context, facts };
  if (facts.state === "CLOSED")
    return { kind: "closed", context: args.context, facts };
  const [threads, checks] = await Promise.all([
    resolveReviewThreads(args.reader, args.context),
    resolveChecks(args.reader, args.context),
  ]);
  const ci =
    checks.kind === "no-checks"
      ? await noChecksCi(args.reader, facts, args.confirmNoChecks)
      : await reportedCi(args.reader, facts, checks, args.pendingHistory);
  const factsAfterChecks = await args.reader.pullRequest(args.context);
  const changed = changedFacts(facts, factsAfterChecks);
  if (changed.length > 0)
    throw new WatcherQueryError({
      kind: "snapshot-changed",
      retryable: true,
      detail: `PR changed while collecting ${facts.headRefOid} against ${facts.baseRefName}: ${changed.join(", ")}`,
    });
  return {
    kind: "open",
    context: args.context,
    facts,
    threads,
    ci,
    reviewAutomationRunning:
      checks.kind === "reported" &&
      checks.checks.some(
        (check) =>
          check.kind === "pending" &&
          AUTOMATION_TOKENS.some((token) =>
            check.name.toLowerCase().includes(token)
          )
      ),
  };
}
const conflictBlocker = (row: T.PrSnapshot): T.MergeBlocker | null =>
  row.kind === "open" &&
  (row.facts.mergeable === "CONFLICTING" ||
    row.facts.mergeStateStatus === "DIRTY" ||
    row.facts.mergeStateStatus === "CONFLICTING")
    ? { kind: "merge-conflicts", pr: row.context, facts: row.facts }
    : null;
function threadBlocker(row: T.PrSnapshot): T.MergeBlocker | null {
  if (row.kind !== "open") return null;
  const threads = nonEmpty(row.threads);
  return threads === null
    ? null
    : { kind: "review-threads", pr: row.context, threads };
}
const ciBlocker = (row: T.PrSnapshot): T.MergeBlocker | null =>
  row.kind === "open" &&
  (row.ci.kind === "ci-failing" || row.ci.kind === "ci-github-rejected")
    ? { kind: "failing-checks", pr: row.context, ci: row.ci }
    : null;
function gateReason(
  row: T.PrSnapshot,
  allowDraft: boolean
): T.MergeGateReason | null {
  if (row.kind === "merged") return null;
  if (row.kind === "closed") return "closed-without-merge";
  if (row.facts.isDraft && !allowDraft) return "draft-pr";
  if (row.facts.reviewDecision === "CHANGES_REQUESTED")
    return "changes-requested";
  // BEHIND means the base requires an up-to-date head. Updating the branch
  // restarts its checks and can dismiss an approval, so this comes before a
  // required review and does not wait for the current checks.
  if (row.facts.mergeStateStatus === "BEHIND") return "behind-base";
  if (row.facts.reviewDecision === "REVIEW_REQUIRED") return "review-required";
  // BLOCKED with clean CI is some other branch protection rule, such as signed
  // commits or a required check that never reported. GitHub will not merge it.
  return row.facts.mergeStateStatus === "BLOCKED" ? "merge-blocked" : null;
}
function waitReason(row: T.PrSnapshot): T.WaitReason | null {
  if (row.kind !== "open") return null;
  if (row.ci.kind === "ci-pending")
    return { kind: "pending-checks", pending: row.ci.pending };
  if (row.ci.kind === "ci-unreported") return { kind: "checks-unreported" };
  return mergeabilityUnknown(row.facts)
    ? { kind: "mergeability-unknown" }
    : null;
}
const DEFERRED_WHILE_WAITING: ReadonlySet<T.MergeGateReason> = new Set([
  "draft-pr",
  "review-required",
  "merge-blocked",
]);
function gateBlocker(
  row: T.PrSnapshot,
  allowDraft: boolean
): T.MergeBlocker | null {
  const reason = gateReason(row, allowDraft);
  return reason === null ||
    (DEFERRED_WHILE_WAITING.has(reason) && waitReason(row) !== null)
    ? null
    : { kind: "merge-gate", pr: row.context, reason };
}
// Indexed by the fact itself, so a proof compiles only where the guard below
// has narrowed mergeable to MERGEABLE.
const CLEAR_ONLY_WHEN = { MERGEABLE: "clear" } as const;
function readyContribution(
  row: T.PrSnapshot,
  allowDraft: boolean
): T.ReadyPr | T.MergedPr | null {
  if (row.kind === "merged")
    return {
      kind: "merged-pr",
      context: row.context,
      mergedAt: row.facts.mergedAt,
    };
  if (
    row.kind !== "open" ||
    (row.ci.kind !== "ci-clean" && row.ci.kind !== "ci-none") ||
    row.threads.length !== 0 ||
    row.facts.mergeable !== "MERGEABLE" ||
    conflictBlocker(row) !== null ||
    gateReason(row, allowDraft) !== null
  )
    return null;
  const reviewDecision = row.facts.reviewDecision;
  if (
    reviewDecision === "CHANGES_REQUESTED" ||
    reviewDecision === "REVIEW_REQUIRED"
  )
    return null;
  return {
    kind: "ready-pr",
    context: row.context,
    proof: {
      revision: landingRevision(row.facts),
      mergeability: CLEAR_ONLY_WHEN[row.facts.mergeable],
      threads: [],
      ci: row.ci,
      gate: {
        state: "OPEN",
        reviewDecision,
        draft: row.facts.isDraft ? "draft-allowed" : "not-draft",
      },
    },
  };
}
export function classifyPr(
  row: T.PrSnapshot,
  allowDraft = false
): T.PrDecision {
  for (const blocker of [
    conflictBlocker(row),
    threadBlocker(row),
    ciBlocker(row),
    gateBlocker(row, allowDraft),
  ])
    if (blocker !== null) return { kind: "blocker", blocker };
  const wait = waitReason(row);
  if (wait !== null)
    return { kind: "waiting", frontier: row.context, reason: wait };
  const ready = readyContribution(row, allowDraft);
  if (ready === null) throw new Error("snapshot has no classified decision");
  return ready.kind === "merged-pr"
    ? { kind: "merged", pr: ready }
    : { kind: "ready", pr: ready };
}
export function selectTierMajorStackDecision(
  rows: T.NonEmpty<T.PrSnapshot>,
  allowDraft = false
): T.StackDecision {
  for (const tier of [conflictBlocker, threadBlocker, ciBlocker])
    for (const row of rows) {
      const blocker = tier(row);
      if (blocker !== null) return { kind: "blocker", blocker };
    }
  for (const row of rows) {
    const blocker = gateBlocker(row, allowDraft);
    if (blocker !== null) return { kind: "blocker", blocker };
  }
  for (const row of rows) {
    const wait = waitReason(row);
    if (wait !== null)
      return { kind: "waiting", frontier: row.context, reason: wait };
  }
  const prs = nonEmpty(
    rows
      .map((row) => readyContribution(row, allowDraft))
      .filter((row): row is T.ReadyPr | T.MergedPr => row !== null)
  );
  if (prs === null || prs.length !== rows.length)
    throw new Error("stack has no classified decision");
  return { kind: "clear", prs };
}
export const queryBackoffSeconds = (
  interval: number,
  failures: number
): number => Math.min(Math.max(interval, 60) * 2 ** (failures - 1), 300);
interface Envelope<M extends T.WatchMode> {
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly observedAt: string;
  readonly mode: M;
}
type Payload<V> = V extends unknown
  ? Omit<V, keyof Envelope<T.WatchMode>>
  : never;
type VerdictPayload = Payload<T.WatcherVerdict>;
export interface VerdictStamp<M extends T.WatchMode = T.WatchMode> {
  <const P extends VerdictPayload>(payload: P): Envelope<M> & P;
  <const P extends VerdictPayload, M2 extends T.WatchMode>(
    payload: P,
    mode: M2
  ): Envelope<M2> & P;
}
export function verdictFactory<M extends T.WatchMode>(
  clock: WatchClock,
  mode: M
): VerdictStamp<M> {
  let sequence = 0;
  function stamp<const P extends VerdictPayload>(payload: P): Envelope<M> & P;
  function stamp<const P extends VerdictPayload, M2 extends T.WatchMode>(
    payload: P,
    mode: M2
  ): Envelope<M2> & P;
  function stamp<const P extends VerdictPayload>(
    payload: P,
    override?: T.WatchMode
  ): Envelope<T.WatchMode> & P {
    return {
      schemaVersion: 1,
      sequence: (sequence += 1),
      observedAt: clock.observedAt(),
      mode: override ?? mode,
      ...payload,
    };
  }
  return stamp;
}
function blockerVerdict(
  stamp: VerdictStamp,
  blocker: T.MergeBlocker
): T.BlockerVerdict {
  switch (blocker.kind) {
    case "merge-conflicts":
      return stamp({ kind: "BLOCKER", terminal: true, exitCode: 2, blocker });
    case "review-threads":
      return stamp({ kind: "BLOCKER", terminal: true, exitCode: 3, blocker });
    case "failing-checks":
      return stamp({ kind: "BLOCKER", terminal: true, exitCode: 4, blocker });
    case "merge-gate":
      return stamp({ kind: "BLOCKER", terminal: true, exitCode: 6, blocker });
    default: {
      const exhaustive: never = blocker;
      return exhaustive;
    }
  }
}
export function statusQueryVerdict(
  stamp: VerdictStamp,
  failures: number,
  failure: T.QueryFailure
): T.BlockerVerdict {
  return stamp({
    kind: "BLOCKER",
    terminal: true,
    exitCode: 7,
    blocker: { kind: "status-query", failures, failure },
  });
}
export interface WatchClock {
  now(): number;
  observedAt(): string;
  sleep(seconds: number): Promise<void>;
}
export interface RunDependencies {
  readonly deadline: WatchDeadline;
  readonly reader: T.GitHubReader;
  readonly clock: WatchClock;
  readonly emit: (verdict: T.ProgressVerdict) => void;
}
export function deadlineVerdict(stamp: VerdictStamp): T.TimeoutVerdict {
  return stamp({
    kind: "TIMEOUT",
    terminal: true,
    exitCode: 5,
    reason: {
      kind: "status-unavailable",
      failure: {
        kind: "deadline",
        retryable: false,
        detail: "deadline reached before a complete observation",
      },
    },
  });
}
type StepResult<V> =
  | { readonly kind: "terminal"; readonly verdict: V }
  | {
      readonly kind: "sleep";
      readonly seconds: number;
      readonly onDeadline: () => V;
    }
  | { readonly kind: "continue" };
async function pollUntilTerminal<V>(args: {
  readonly dependencies: RunDependencies;
  readonly options: T.PollingOptions;
  readonly stamp: VerdictStamp;
  readonly step: () => Promise<StepResult<V>>;
}): Promise<V | T.BlockerVerdict | T.TimeoutVerdict> {
  let failures = 0;
  const { deadline } = args.dependencies;
  let onDeadline: () => V | T.TimeoutVerdict = () =>
    deadlineVerdict(args.stamp);
  while (deadline.remaining() > 0) {
    let result: StepResult<V>;
    try {
      result = await args.step();
      failures = 0;
    } catch (error) {
      if (error instanceof DeadlineExceeded) break;
      if (!(error instanceof WatcherQueryError)) throw error;
      onDeadline = () =>
        args.stamp({
          kind: "TIMEOUT",
          terminal: true,
          exitCode: 5,
          reason: { kind: "status-unavailable", failure: error.failure },
        });
      failures += 1;
      if (!error.failure.retryable || failures >= args.options.maxQueryErrors)
        return statusQueryVerdict(args.stamp, failures, error.failure);
      const retryInSeconds = Math.min(
        deadline.remaining(),
        queryBackoffSeconds(args.options.interval, failures)
      );
      args.dependencies.emit(
        args.stamp({
          kind: "RETRY",
          terminal: false,
          failure: error.failure,
          consecutiveFailures: failures,
          retryInSeconds,
        })
      );
      await args.dependencies.clock.sleep(retryInSeconds);
      continue;
    }
    if (result.kind === "terminal") return result.verdict;
    if (result.kind === "sleep") {
      onDeadline = result.onDeadline;
      await args.dependencies.clock.sleep(
        Math.min(result.seconds, deadline.remaining())
      );
    }
  }
  return onDeadline();
}
export async function runSimple(args: {
  readonly dependencies: RunDependencies;
  readonly contexts: T.NonEmpty<T.PrContext>;
  readonly mode: T.WatchMode;
  readonly statusOnly: boolean;
  readonly options: T.PollingOptions;
}): Promise<T.TerminalVerdict> {
  const stamp = verdictFactory(args.dependencies.clock, args.mode);
  const confirmNoChecks = noChecksConfirmer(args.dependencies.clock);
  const step = async (): Promise<StepResult<T.TerminalVerdict>> => {
    const rows: T.PrSnapshot[] = [];
    for (const context of args.contexts)
      rows.push(
        await readSnapshot({
          reader: args.dependencies.reader,
          context,
          pendingHistory: "include",
          allowDraft: args.options.allowDraft,
          confirmNoChecks,
        })
      );
    const complete = nonEmpty(rows);
    if (complete === null) throw new Error("watch context cannot be empty");
    if (args.statusOnly)
      return {
        kind: "terminal",
        verdict: stamp({
          kind: "STATUS",
          terminal: true,
          exitCode: 0,
          reason: "status-only",
          rows: complete,
        }),
      };
    if (args.mode === "queued-stack")
      throw new Error("queued-stack requires status-only in the simple runner");
    if (args.mode === "stack")
      args.dependencies.emit(
        stamp(
          { kind: "STATUS", terminal: false, reason: "poll", rows: complete },
          args.mode
        )
      );
    const decision =
      args.mode === "single"
        ? classifyPr(complete[0], args.options.allowDraft)
        : selectTierMajorStackDecision(complete, args.options.allowDraft);
    if (decision.kind === "blocker")
      return {
        kind: "terminal",
        verdict: blockerVerdict(stamp, decision.blocker),
      };
    if (decision.kind === "ready" || decision.kind === "merged")
      return {
        kind: "terminal",
        verdict: stamp(
          {
            kind: "READY",
            terminal: true,
            exitCode: 0,
            scope: { kind: "single", pr: decision.pr },
          },
          args.mode
        ),
      };
    if (decision.kind === "clear")
      return {
        kind: "terminal",
        verdict: stamp(
          {
            kind: "READY",
            terminal: true,
            exitCode: 0,
            scope: { kind: "stack", prs: decision.prs },
          },
          args.mode
        ),
      };
    args.dependencies.emit(
      stamp({
        kind: "WAITING",
        terminal: false,
        frontier: decision.frontier,
        reason: decision.reason,
      })
    );
    return {
      kind: "sleep",
      seconds: args.options.interval,
      onDeadline: () =>
        stamp({
          kind: "TIMEOUT",
          terminal: true,
          exitCode: 5,
          reason: decision.reason,
        }),
    };
  };
  return pollUntilTerminal({
    dependencies: args.dependencies,
    options: args.options,
    stamp,
    step,
  });
}
export type QueueWork =
  | {
      readonly kind: "whole-stack-sweep";
      readonly remaining: T.NonEmpty<T.PrContext>;
    }
  | { readonly kind: "frontier-poll"; readonly frontier: T.PrContext };
export interface QueueState {
  readonly queue: T.NonEmpty<T.PrContext>;
  readonly snapshots: ReadonlyMap<T.PrNumber, T.PrSnapshot>;
  readonly work: QueueWork | null;
  readonly nextSweepAt: number;
  readonly frontier: T.PrContext | null;
  readonly lastWaitKey: string | null;
}
export const createQueueState = (
  queue: T.NonEmpty<T.PrContext>,
  now: number
): QueueState => ({
  queue,
  snapshots: new Map(),
  work: { kind: "whole-stack-sweep", remaining: queue },
  nextSweepAt: now,
  frontier: null,
  lastWaitKey: null,
});
const orderedRows = (state: QueueState): T.PrSnapshot[] =>
  state.queue.flatMap((context) => {
    const row = state.snapshots.get(context.number);
    return row === undefined ? [] : [row];
  });
const activeRows = (state: QueueState): T.PrSnapshot[] =>
  orderedRows(state).filter((row) => row.kind !== "merged");
export function planQueue(state: QueueState, now: number): QueueState {
  if (state.work !== null) return state;
  if (state.snapshots.size === 0 || now >= state.nextSweepAt) {
    const remaining = nonEmpty(
      state.queue.filter(
        (context) => state.snapshots.get(context.number)?.kind !== "merged"
      )
    );
    if (remaining !== null)
      return { ...state, work: { kind: "whole-stack-sweep", remaining } };
  }
  const frontier = activeRows(state)[0]?.context;
  return frontier === undefined
    ? state
    : { ...state, work: { kind: "frontier-poll", frontier } };
}
export interface QueueSnapshotResult {
  readonly state: QueueState;
  readonly completedSweepRows: T.NonEmpty<T.PrSnapshot> | null;
}
export function applyQueueSnapshot(
  state: QueueState,
  snapshot: T.PrSnapshot,
  now: number,
  options: T.PollingOptions
): QueueSnapshotResult {
  if (state.work === null) throw new Error("queue has no read in flight");
  const snapshots = new Map(state.snapshots);
  snapshots.set(snapshot.context.number, snapshot);
  const base = { ...state, snapshots };
  if (state.work.kind === "frontier-poll")
    return { state: { ...base, work: null }, completedSweepRows: null };
  const [head, ...tail] = state.work.remaining;
  if (head.number !== snapshot.context.number)
    throw new Error("snapshot does not match sweep head");
  const remaining = nonEmpty(tail);
  if (remaining !== null)
    return {
      state: { ...base, work: { kind: "whole-stack-sweep", remaining } },
      completedSweepRows: null,
    };
  const rows = nonEmpty(
    state.queue.flatMap((context) => {
      const row = snapshots.get(context.number);
      return row === undefined ? [] : [row];
    })
  );
  if (rows === null || rows.length !== state.queue.length)
    throw new Error("sweep completed without every snapshot");
  return {
    state: { ...base, work: null, nextSweepAt: now + options.sweepInterval },
    completedSweepRows: rows,
  };
}
export type QueueEvaluation =
  | {
      readonly kind: "complete";
      readonly state: QueueState;
      readonly merged: T.NonEmpty<T.MergedPr>;
    }
  | {
      readonly kind: "blocker";
      readonly state: QueueState;
      readonly blocker: T.MergeBlocker;
    }
  | {
      readonly kind: "advance";
      readonly state: QueueState;
      readonly merged: T.PrContext;
      readonly frontier: T.PrContext;
      readonly remaining: number;
    }
  | {
      readonly kind: "waiting";
      readonly state: QueueState;
      readonly frontier: T.PrContext;
      readonly reason:
        | T.WaitReason
        | { readonly kind: "merge-queue"; readonly unmergedCount: number };
      readonly emit: boolean;
    };
export function evaluateQueue(
  state: QueueState,
  options: T.PollingOptions
): QueueEvaluation {
  const active = activeRows(state);
  if (active.length === 0) {
    const merged = nonEmpty(
      orderedRows(state).flatMap((row) =>
        row.kind === "merged"
          ? [
              {
                kind: "merged-pr" as const,
                context: row.context,
                mergedAt: row.facts.mergedAt,
              },
            ]
          : []
      )
    );
    if (merged === null) throw new Error("empty queue cannot complete");
    return { kind: "complete", state, merged };
  }
  const rows = nonEmpty(active);
  if (rows === null) throw new Error("active queue cannot be empty");
  const decision = selectTierMajorStackDecision(rows, options.allowDraft);
  if (decision.kind === "blocker")
    return { kind: "blocker", state, blocker: decision.blocker };
  const frontier = rows[0].context;
  if (state.frontier !== null && state.frontier.number !== frontier.number)
    return {
      kind: "advance",
      state: { ...state, frontier, lastWaitKey: null },
      merged: state.frontier,
      frontier,
      remaining: active.length,
    };
  const reason = waitReason(rows[0]) ?? {
    kind: "merge-queue" as const,
    unmergedCount: active.length,
  };
  const key =
    reason.kind === "pending-checks"
      ? `pending:${frontier.number}:${reason.pending.length}`
      : reason.kind === "merge-queue"
        ? `queue:${frontier.number}:${reason.unmergedCount}`
        : `${reason.kind}:${frontier.number}`;
  return {
    kind: "waiting",
    state: { ...state, frontier, lastWaitKey: key },
    frontier,
    reason,
    emit: state.lastWaitKey !== key,
  };
}
export async function runQueued(args: {
  readonly dependencies: RunDependencies;
  readonly contexts: T.NonEmpty<T.PrContext>;
  readonly options: T.PollingOptions;
}): Promise<T.QueueTerminalVerdict> {
  let state = createQueueState(args.contexts, args.dependencies.clock.now());
  const stamp = verdictFactory(args.dependencies.clock, "queued-stack");
  const confirmNoChecks = noChecksConfirmer(args.dependencies.clock);
  args.dependencies.emit(
    stamp({ kind: "QUEUE", terminal: false, queue: args.contexts })
  );
  const step = async (): Promise<StepResult<T.QueueTerminalVerdict>> => {
    state = planQueue(state, args.dependencies.clock.now());
    if (state.work === null) {
      const complete = evaluateQueue(state, args.options);
      if (complete.kind !== "complete")
        throw new Error("queue has no work while active");
      return {
        kind: "terminal",
        verdict: stamp({
          kind: "COMPLETE",
          terminal: true,
          exitCode: 0,
          queue: state.queue,
          merged: complete.merged,
        }),
      };
    }
    const context =
      state.work.kind === "whole-stack-sweep"
        ? state.work.remaining[0]
        : state.work.frontier;
    const snapshot = await readSnapshot({
      reader: args.dependencies.reader,
      context,
      pendingHistory: "omit",
      allowDraft: args.options.allowDraft,
      confirmNoChecks,
    });
    const applied = applyQueueSnapshot(
      state,
      snapshot,
      args.dependencies.clock.now(),
      args.options
    );
    state = applied.state;
    if (applied.completedSweepRows !== null)
      args.dependencies.emit(
        stamp({
          kind: "STATUS",
          terminal: false,
          reason: "whole-stack-sweep",
          rows: applied.completedSweepRows,
        })
      );
    if (state.work !== null) return { kind: "continue" };
    const evaluation = evaluateQueue(state, args.options);
    state = evaluation.state;
    switch (evaluation.kind) {
      case "complete":
        return {
          kind: "terminal",
          verdict: stamp({
            kind: "COMPLETE",
            terminal: true,
            exitCode: 0,
            queue: state.queue,
            merged: evaluation.merged,
          }),
        };
      case "blocker":
        return {
          kind: "terminal",
          verdict: blockerVerdict(stamp, evaluation.blocker),
        };
      case "advance":
        args.dependencies.emit(
          stamp({
            kind: "ADVANCE",
            terminal: false,
            merged: evaluation.merged,
            frontier: evaluation.frontier,
            remaining: evaluation.remaining,
          })
        );
        return { kind: "continue" };
      case "waiting":
        if (evaluation.emit)
          args.dependencies.emit(
            stamp({
              kind: "WAITING",
              terminal: false,
              frontier: evaluation.frontier,
              reason: evaluation.reason,
            })
          );
        return {
          kind: "sleep",
          seconds: args.options.interval,
          onDeadline: () =>
            stamp({
              kind: "TIMEOUT",
              terminal: true,
              exitCode: 5,
              reason: {
                kind: "queued-stack",
                frontier: evaluation.frontier,
                unmergedCount: activeRows(state).length,
              },
            }),
        };
      default: {
        const exhaustive: never = evaluation;
        return exhaustive;
      }
    }
  };
  return pollUntilTerminal({
    dependencies: args.dependencies,
    options: args.options,
    stamp,
    step,
  });
}
