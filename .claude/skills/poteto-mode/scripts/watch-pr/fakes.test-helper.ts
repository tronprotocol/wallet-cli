import type {
  Check,
  ChecksFastPath,
  CommitRollup,
  GitHubReader,
  OpenPullRequest,
  PrContext,
  PullRequestFacts,
  Repository,
  RawReviewThread,
  ReviewThread,
  ReviewThreadPage,
  RollupPage,
} from "./types.ts";
import { parsePullRequest } from "./github.ts";
import { parsePrNumber } from "./types.ts";

export interface FakeReaderOptions {
  readonly facts?: Partial<Omit<PullRequestFacts, "context">>;
  readonly factsOnReread?: Partial<Omit<PullRequestFacts, "context">>;
  readonly fastPath?: ChecksFastPath;
  readonly rollupPages?: readonly RollupPage[];
  readonly threads?: readonly ReviewThread[];
  readonly threadPages?: readonly ReviewThreadPage[];
  readonly commitRollups?: readonly CommitRollup[];
  readonly openPullRequests?: readonly OpenPullRequest[];
  readonly defaultBranch?: string;
  readonly origin?: Repository | null;
  readonly current?: PrContext;
}

function toRawThread(thread: ReviewThread): RawReviewThread {
  return { id: thread.id, firstComment: thread.firstComment, resolved: false };
}

export function passingCheck(name = "ci"): Check {
  return {
    kind: "passed",
    name,
    reportedState: "SUCCESS",
    description: "",
    link: "",
    workflow: "",
  };
}

export function pendingCheck(name = "ci"): Check {
  return {
    kind: "pending",
    name,
    reportedState: "PENDING",
    description: "",
    link: "",
    workflow: "",
  };
}

export function failedCheck(name = "ci"): Check {
  return {
    kind: "failed",
    name,
    reportedState: "FAILURE",
    description: "",
    link: "",
    workflow: "",
  };
}

export function fakeReader(
  options: FakeReaderOptions = {}
): GitHubReader & { readonly calls: readonly string[] } {
  const calls: string[] = [];
  const context = options.current ?? {
    owner: "owner",
    repo: "repo",
    number: parsePrNumber(1),
  };
  const defaults: PullRequestFacts = {
    context,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    headRefOid: "head",
    baseRefOid: "base",
    headRefName: "feature",
    baseRefName: "main",
    state: "OPEN",
    mergedAt: null,
    isDraft: false,
  };
  let page = 0;
  let reads = 0;
  let threadPage = 0;
  return {
    calls,
    async originRepo() {
      calls.push("originRepo");
      return options.origin === undefined
        ? { owner: "owner", repo: "repo" }
        : options.origin;
    },
    async currentPr(pr) {
      calls.push("currentPr");
      return { ...context, number: pr ?? context.number };
    },
    async pullRequest(requested) {
      calls.push("pullRequest");
      reads += 1;
      const facts = {
        ...defaults,
        ...options.facts,
        ...(reads > 1 ? options.factsOnReread : {}),
      };
      return parsePullRequest(
        {
          ...facts,
          baseRef: { target: { oid: facts.baseRefOid } },
        },
        requested
      );
    },
    async openPullRequests() {
      calls.push("openPullRequests");
      return options.openPullRequests ?? [];
    },
    async defaultBranch() {
      calls.push("defaultBranch");
      return options.defaultBranch ?? "main";
    },
    async checksFastPath() {
      calls.push("checksFastPath");
      return options.fastPath ?? { kind: "checks", checks: [passingCheck()] };
    },
    async checkRollupPage(_requested, after) {
      calls.push(`checkRollupPage:${after ?? "null"}`);
      const pages = options.rollupPages ?? [];
      return (
        pages[Math.min(page++, pages.length - 1)] ?? {
          kind: "contexts",
          checks: [],
          endCursor: null,
        }
      );
    },
    async reviewThreadPage(_requested, after) {
      calls.push(`reviewThreadPage:${after ?? "null"}`);
      return options.threadPages?.[threadPage++] ?? {
        threads: (options.threads ?? []).map(toRawThread),
        endCursor: null,
      };
    },
    async commitRollups() {
      calls.push("commitRollups");
      return options.commitRollups ?? [{ oid: "head", state: "SUCCESS" }];
    },
  };
}
