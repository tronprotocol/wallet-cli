import { baseRefTargetOid, text } from "./landing.ts";
import { spawn } from "node:child_process";
import { DeadlineExceeded, type WatchDeadline } from "./deadline.ts";
import type * as T from "./types.ts";
import { nonEmpty, parsePrNumber } from "./types.ts";
export const REVIEW_THREADS_QUERY =
  "\nquery ReviewThreads($owner: String!, $repo: String!, $pr: Int!, $after: String) {\n  repository(owner: $owner, name: $repo) {\n    pullRequest(number: $pr) {\n      reviewThreads(first: 100, after: $after) {\n        pageInfo {\n          hasNextPage\n          endCursor\n        }\n        nodes {\n          id\n          isResolved\n          comments(first: 10) {\n            nodes {\n              body\n              createdAt\n              path\n              line\n              author { login }\n            }\n          }\n        }\n      }\n    }\n  }\n}\n";
export const PR_COMMIT_STATUS_QUERY =
  "\nquery PrCommitStatuses($owner: String!, $repo: String!, $pr: Int!) {\n  repository(owner: $owner, name: $repo) {\n    pullRequest(number: $pr) {\n      commits(last: 50) {\n        nodes {\n          commit {\n            oid\n            statusCheckRollup {\n              state\n            }\n          }\n        }\n      }\n    }\n  }\n}\n";
export const PR_FACTS_QUERY = `query PullRequestFacts($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      mergeable
      mergeStateStatus
      reviewDecision
      headRefOid
      headRefName
      baseRefName
      baseRef { target { oid } }
      state
      mergedAt
      isDraft
    }
  }
}`;
export const PR_CHECK_ROLLUP_QUERY =
  "\nquery PrCheckRollup($owner: String!, $repo: String!, $pr: Int!, $after: String) {\n  repository(owner: $owner, name: $repo) {\n    pullRequest(number: $pr) {\n      commits(last: 1) {\n        nodes {\n          commit {\n            statusCheckRollup {\n              contexts(first: 100, after: $after) {\n                pageInfo {\n                  hasNextPage\n                  endCursor\n                }\n                nodes {\n                  __typename\n                  ... on CheckRun {\n                    name\n                    status\n                    conclusion\n                    detailsUrl\n                  }\n                  ... on StatusContext {\n                    context\n                    state\n                    targetUrl\n                  }\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n}\n";

interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}
export class WatcherQueryError extends Error {
  readonly failure: T.QueryFailure;
  constructor(failure: T.QueryFailure) {
    super(failure.detail);
    this.name = "WatcherQueryError";
    this.failure = failure;
  }
}
export class ChecksUnavailable extends WatcherQueryError {
  constructor(detail: string) {
    super({ kind: "checks-unavailable", retryable: true, detail });
    this.name = "ChecksUnavailable";
  }
}
const firstLine = (value: string): string =>
  value.trim().split(/\r?\n/, 1)[0]?.slice(0, 240) ?? "";
function run(
  argv: readonly [string, ...string[]],
  deadline: WatchDeadline
): Promise<CommandResult> {
  if (deadline.remaining() === 0) return Promise.reject(new DeadlineExceeded());
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleDeadline = (): void => {
      const seconds = deadline.remaining();
      if (!Number.isFinite(seconds)) return;
      if (seconds === 0) {
        expired = true;
        child.kill("SIGKILL");
      } else {
        timer = setTimeout(
          scheduleDeadline,
          Math.min(seconds * 1_000, 2_147_483_647)
        );
      }
    };
    scheduleDeadline();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new WatcherQueryError({
          kind: "spawn-failed",
          retryable: false,
          detail: `could not run ${argv[0]}: ${error.message}`,
        })
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (expired) reject(new DeadlineExceeded());
      else resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}
function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new WatcherQueryError({
      kind: "json-parse",
      retryable: true,
      detail: `${label}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
export async function runJson(
  argv: readonly [string, ...string[]],
  deadline: WatchDeadline
): Promise<unknown> {
  const result = await run(argv, deadline);
  if (result.code !== 0)
    throw new WatcherQueryError({
      kind: "command-exit",
      retryable: true,
      code: result.code,
      detail:
        firstLine(result.stderr) || `${argv.join(" ")} exited ${result.code}`,
    });
  return parseJson(result.stdout, argv.join(" "));
}
function raw(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
function missing(path: string, value?: unknown): never {
  throw new WatcherQueryError({
    kind: "missing-key",
    retryable: true,
    detail:
      value === undefined
        ? `missing ${path}`
        : `invalid ${path}: ${raw(value)}`,
    ...(value === undefined ? {} : { rawValue: raw(value) }),
  });
}
function advanceCursor(cursors: Set<string>, after: string, label: string) {
  if (cursors.has(after))
    missing(`${label}.pageInfo.endCursor must advance`, after);
  cursors.add(after);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) missing(path, value);
  return value;
}
function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) missing(path, value);
  return value;
}
function at(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    const object = record(current, path.join("."));
    if (!(key in object)) missing(path.join("."));
    current = object[key];
  }
  return current;
}
function string(value: unknown, path: string): string {
  if (typeof value !== "string") missing(path, value);
  return value;
}
const optionalString = (value: unknown, path: string): string | null =>
  value === null ? null : string(value, path);
function enumValue<const V extends readonly string[]>(
  value: unknown,
  values: V,
  path: string
): V[number] {
  if (typeof value === "string")
    for (const candidate of values) if (candidate === value) return candidate;
  return missing(path, value);
}
const nullableEnum = <const V extends readonly string[]>(
  value: unknown,
  values: V,
  path: string
): V[number] | null => (value === null ? null : enumValue(value, values, path));
const MERGE_STATES = [
  "BEHIND",
  "BLOCKED",
  "CLEAN",
  "CONFLICTING",
  "DIRTY",
  "DRAFT",
  "HAS_HOOKS",
  "UNKNOWN",
  "UNSTABLE",
] as const satisfies readonly T.MergeStateStatus[];
const ROLLUP_STATES = [
  "ERROR",
  "EXPECTED",
  "FAILURE",
  "PENDING",
  "SUCCESS",
] as const;
const OPEN_PR_LIMIT = 300;
const REVIEW_DECISIONS = [
  "APPROVED",
  "CHANGES_REQUESTED",
  "REVIEW_REQUIRED",
] as const;
const reviewDecision = (value: unknown): T.ReviewDecision =>
  nullableEnum(value, REVIEW_DECISIONS, "pull request.reviewDecision");
function parseRemote(value: string): T.Repository | null {
  let normalized = value.trim();
  if (normalized.startsWith("git@github.com:"))
    normalized = `https://github.com/${normalized.slice(15)}`;
  if (normalized.startsWith("ssh://git@github.com/"))
    normalized = `https://github.com/${normalized.slice(21)}`;
  try {
    const url = new URL(normalized);
    const parts = url.pathname
      .replace(/\.git$/, "")
      .split("/")
      .filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      parts.length !== 2
    )
      return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}
function parsePrUrl(value: string): T.PrContext {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      parts.length !== 4 ||
      parts[2] !== "pull"
    )
      throw new Error("not a canonical GitHub pull URL");
    return {
      owner: parts[0],
      repo: parts[1],
      number: parsePrNumber(Number(parts[3])),
    };
  } catch (error) {
    throw new WatcherQueryError({
      kind: "invalid-context-url",
      retryable: false,
      rawValue: value,
      detail: `could not infer owner/repo from PR URL: ${value} (${error instanceof Error ? error.message : String(error)})`,
    });
  }
}
function checkDetails(value: Record<string, unknown>, nameKey: string) {
  return {
    name: string(value[nameKey], nameKey),
    description: typeof value.description === "string" ? value.description : "",
    link:
      typeof value.link === "string"
        ? value.link
        : typeof value.detailsUrl === "string"
          ? value.detailsUrl
          : "",
    workflow: typeof value.workflow === "string" ? value.workflow : "",
  };
}
// gh buckets every state it does not name as pending, including completed
// conclusions like STALE and STARTUP_FAILURE. Only these are in flight, the
// same states mapRollupNode treats as pending.
const IN_FLIGHT_STATES = new Set([
  "EXPECTED",
  "REQUESTED",
  "WAITING",
  "QUEUED",
  "PENDING",
  "IN_PROGRESS",
]);
export function parseFastCheck(value: unknown): T.Check {
  const object = record(value, "check");
  const details = checkDetails(object, "name");
  const state = string(object.state, "check.state").toUpperCase();
  const bucket = string(object.bucket, "check.bucket");
  if (state === "ACTION_REQUIRED") return gateOr("failed", details, state);
  if (bucket === "fail" || ["FAILURE", "ERROR"].includes(state))
    return { ...details, kind: "failed", reportedState: state };
  if (bucket === "pending" && IN_FLIGHT_STATES.has(state))
    return gateOr("pending", details, state);
  if (bucket === "pass")
    return { ...details, kind: "passed", reportedState: state };
  if (bucket === "skipping")
    return { ...details, kind: "skipped", reportedState: state };
  return { ...details, kind: "failed", reportedState: state };
}
// Every read path classifies the owner-approval gate here, so the rule has one
// home. A gate that is pending or waits on an owner approval must not count as
// pending or failed, or the watcher waits on a human.
function gateOr(
  kind: "pending" | "failed",
  details: {
    readonly name: string;
    readonly description: string;
    readonly link: string;
    readonly workflow: string;
  },
  reportedState: string
): T.Check {
  return details.name === "Code Review Gate"
    ? {
        ...details,
        kind: "code-review-gate",
        name: "Code Review Gate",
        reportedState,
      }
    : { ...details, kind, reportedState };
}
export function mapRollupNode(value: unknown): T.Check | null {
  const object = record(value, "rollup node");
  const typename = object.__typename;
  if (typename !== "CheckRun" && typename !== "StatusContext") return null;
  const details = checkDetails(
    object,
    typename === "CheckRun" ? "name" : "context"
  );
  const link =
    typeof object.targetUrl === "string" ? object.targetUrl : details.link;
  if (typename === "CheckRun") {
    const status =
      typeof object.status === "string" ? object.status.toUpperCase() : "";
    const conclusion =
      typeof object.conclusion === "string"
        ? object.conclusion.toUpperCase()
        : "";
    if (status !== "COMPLETED")
      return gateOr("pending", { ...details, link }, "PENDING");
    if (conclusion === "SUCCESS")
      return { ...details, link, kind: "passed", reportedState: "SUCCESS" };
    if (conclusion === "NEUTRAL" || conclusion === "SKIPPED")
      return { ...details, link, kind: "skipped", reportedState: conclusion };
    if (conclusion === "ACTION_REQUIRED")
      return gateOr("failed", { ...details, link }, conclusion);
    return { ...details, link, kind: "failed", reportedState: "FAILURE" };
  }
  const state =
    typeof object.state === "string" ? object.state.toUpperCase() : "";
  if (state === "PENDING" || state === "EXPECTED")
    return gateOr("pending", { ...details, link }, "PENDING");
  return state === "SUCCESS"
    ? { ...details, link, kind: "passed", reportedState: state }
    : { ...details, link, kind: "failed", reportedState: state || "FAILURE" };
}
function parseComment(value: unknown): T.ReviewComment {
  const object = record(value, "review comment");
  const author =
    object.author === null
      ? null
      : record(object.author, "review comment.author");
  return {
    authorLogin:
      author === null
        ? null
        : optionalString(author.login, "review comment.author.login"),
    body: string(object.body, "review comment.body"),
    path: optionalString(object.path, "review comment.path"),
    line:
      object.line === null
        ? null
        : Number.isInteger(object.line)
          ? Number(object.line)
          : missing("review comment.line", object.line),
    createdAt: string(object.createdAt, "review comment.createdAt"),
  };
}
function isBugbot(comment: T.ReviewComment | null): boolean {
  if (comment === null) return false;
  const author = (comment.authorLogin ?? "").toLowerCase();
  const body = comment.body.toLowerCase();
  return (
    author.includes("bugbot") ||
    (author === "cursor" &&
      [
        "bugbot",
        "cursor_automation_id",
        "agentic security review",
        "description start",
        "severity",
      ].some((token) => body.includes(token)))
  );
}
function passKey(comment: T.ReviewComment | null): string | null {
  if (comment === null) return null;
  for (const pattern of [
    /RUN_ID:\s*([a-zA-Z0-9_.:-]+)/,
    /CURSOR_AUTOMATION_ID:\s*([a-zA-Z0-9_.:-]+)/,
  ]) {
    const match = pattern.exec(comment.body);
    if (match?.[1]) return match[1];
  }
  return null;
}
export function parseReviewThreadPage(value: unknown): T.ReviewThreadPage {
  const reviewThreads = record(
    at(value, ["data", "repository", "pullRequest", "reviewThreads"]),
    "reviewThreads"
  );
  const nodes = list(reviewThreads.nodes, "reviewThreads.nodes");
  const threads: T.RawReviewThread[] = [];
  for (const node of nodes) {
    const thread = record(node, "review thread");
    if (typeof thread.isResolved !== "boolean")
      missing("review thread.isResolved", thread.isResolved);
    const comments = list(
      at(thread, ["comments", "nodes"]),
      "review thread.comments.nodes"
    );
    threads.push({
      id: string(thread.id, "review thread.id"),
      firstComment: comments.length === 0 ? null : parseComment(comments[0]),
      resolved: thread.isResolved,
    });
  }
  const page = record(reviewThreads.pageInfo, "reviewThreads.pageInfo");
  if (typeof page.hasNextPage !== "boolean")
    missing("reviewThreads.pageInfo.hasNextPage", page.hasNextPage);
  const cursor = optionalString(
    page.endCursor,
    "reviewThreads.pageInfo.endCursor"
  );
  if (page.hasNextPage && !cursor)
    missing("reviewThreads.pageInfo.endCursor", cursor);
  return { threads, endCursor: page.hasNextPage && cursor ? cursor : null };
}
export function buildReviewThreads(
  threads: readonly T.RawReviewThread[]
): readonly T.ReviewThread[] {
  const keys = new Set<string>();
  let keyless = false;
  for (const thread of threads) {
    if (!isBugbot(thread.firstComment)) continue;
    const key = passKey(thread.firstComment);
    if (key === null) keyless = true;
    else keys.add(key);
  }
  const passes = keys.size > 0 ? keys.size : keyless ? 1 : 0;
  return threads
    .filter((thread) => !thread.resolved)
    .map(({ id, firstComment }) => ({
      id,
      firstComment,
      isBugbot: isBugbot(firstComment),
      bugbotReviewPasses: passes,
    }));
}
export function parsePullRequest(
  value: unknown,
  context: T.PrContext
): T.PullRequestFacts {
  const object = record(value, "pull request");
  if (typeof object.isDraft !== "boolean")
    missing("pull request.isDraft", object.isDraft);
  const facts = {
    context,
    mergeable: enumValue(
      object.mergeable,
      ["MERGEABLE", "CONFLICTING", "UNKNOWN"] as const,
      "pull request.mergeable"
    ),
    mergeStateStatus: enumValue(
      object.mergeStateStatus,
      MERGE_STATES,
      "pull request.mergeStateStatus"
    ),
    reviewDecision: reviewDecision(object.reviewDecision),
    headRefOid: optionalString(object.headRefOid, "pull request.headRefOid"),
    baseRefOid: baseRefTargetOid(object.baseRef),
    headRefName: string(object.headRefName, "pull request.headRefName"),
    baseRefName: string(object.baseRefName, "pull request.baseRefName"),
    state: enumValue(
      object.state,
      ["OPEN", "CLOSED", "MERGED"] as const,
      "pull request.state"
    ),
    mergedAt: optionalString(object.mergedAt, "pull request.mergedAt"),
    isDraft: object.isDraft,
  };
  return facts.state === "OPEN"
    ? {
        ...facts,
        state: facts.state,
        headRefOid: text(facts.headRefOid, "headRefOid"),
        baseRefName: text(facts.baseRefName, "baseRefName"),
        baseRefOid: text(facts.baseRefOid, "baseRefOid"),
      }
    : { ...facts, state: facts.state };
}
function graphqlArgs(
  query: string,
  context: T.PrContext
): [string, ...string[]] {
  return [
    "gh",
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-f",
    `owner=${context.owner}`,
    "-f",
    `repo=${context.repo}`,
    "-F",
    `pr=${context.number}`,
  ];
}

export class GhGitHubReader implements T.GitHubReader {
  constructor(private readonly deadline: WatchDeadline) {}
  private run(argv: readonly [string, ...string[]]): Promise<CommandResult> {
    return run(argv, this.deadline);
  }
  private runJson(argv: readonly [string, ...string[]]): Promise<unknown> {
    return runJson(argv, this.deadline);
  }
  async originRepo(): Promise<T.Repository | null> {
    const result = await this.run(["git", "remote", "get-url", "origin"]);
    return result.code === 0 ? parseRemote(result.stdout) : null;
  }
  async currentPr(pr: T.PrNumber | null): Promise<T.PrContext> {
    const argv: [string, ...string[]] = ["gh", "pr", "view"];
    if (pr !== null) argv.push(String(pr));
    argv.push("--json", "number,url");
    const object = record(await this.runJson(argv), "current PR");
    const parsed = parsePrUrl(string(object.url, "current PR.url"));
    return {
      ...parsed,
      number: pr ?? parsePrNumber(object.number, "current PR.number"),
    };
  }
  private async graphql(
    query: string,
    context: T.PrContext,
    after: string | null = null
  ): Promise<Record<string, unknown>> {
    const argv = graphqlArgs(query, context);
    if (after !== null) argv.push("-f", `after=${after}`);
    const response = record(await this.runJson(argv), "GraphQL response");
    if (response.errors !== undefined)
      missing("GraphQL errors", response.errors);
    return record(
      at(response, ["data", "repository", "pullRequest"]),
      "data.repository.pullRequest"
    );
  }
  async pullRequest(context: T.PrContext): Promise<T.PullRequestFacts> {
    return parsePullRequest(
      await this.graphql(PR_FACTS_QUERY, context),
      context
    );
  }
  async openPullRequests(
    repository: T.Repository
  ): Promise<readonly T.OpenPullRequest[]> {
    const value = await this.runJson([
      "gh",
      "pr",
      "list",
      "--repo",
      `${repository.owner}/${repository.repo}`,
      "--state",
      "open",
      "--limit",
      String(OPEN_PR_LIMIT),
      "--json",
      "number,headRefName,baseRefName,headRepository,headRepositoryOwner",
    ]);
    return list(value, "open PRs").map((item, index) => {
      const object = record(item, `open PRs[${index}]`);
      const headRepository =
        object.headRepository === null
          ? null
          : record(object.headRepository, "headRepository");
      const headOwner =
        object.headRepositoryOwner === null
          ? null
          : record(object.headRepositoryOwner, "headRepositoryOwner");
      return {
        number: parsePrNumber(object.number, `open PRs[${index}].number`),
        headRepository:
          headRepository === null || headOwner === null
            ? null
            : {
                owner: string(headOwner.login, "headRepositoryOwner.login"),
                repo: string(headRepository.name, "headRepository.name"),
              },
        headRefName: string(
          object.headRefName,
          `open PRs[${index}].headRefName`
        ),
        baseRefName: string(
          object.baseRefName,
          `open PRs[${index}].baseRefName`
        ),
      };
    });
  }
  async defaultBranch(repository: T.Repository): Promise<string> {
    const value = await this.runJson([
      "gh",
      "repo",
      "view",
      `${repository.owner}/${repository.repo}`,
      "--json",
      "defaultBranchRef",
    ]);
    return string(
      at(value, ["defaultBranchRef", "name"]),
      "defaultBranchRef.name"
    );
  }
  async checksFastPath(context: T.PrContext): Promise<T.ChecksFastPath> {
    const result = await this.run([
      "gh",
      "pr",
      "checks",
      String(context.number),
      "--repo",
      `${context.owner}/${context.repo}`,
      "--json",
      "name,state,description,link,workflow,bucket",
    ]);
    if ([0, 1, 8].includes(result.code) && result.stdout.trim()) {
      try {
        const value = parseJson(result.stdout, "gh pr checks");
        if (Array.isArray(value))
          return { kind: "checks", checks: value.map(parseFastCheck) };
      } catch (error) {
        if (!(error instanceof WatcherQueryError)) throw error;
      }
    }
    // Only this stderr line means gh read the head commit and found no checks.
    // Any other exit 1 is a failed query.
    if (
      result.code === 1 &&
      firstLine(result.stderr).startsWith("no checks reported on the ")
    )
      return { kind: "none-reported" };
    return { kind: "unusable", exitCode: result.code, stderr: result.stderr };
  }
  async checkRollupPage(
    context: T.PrContext,
    after: string | null
  ): Promise<T.RollupPage> {
    const pullRequest = await this.graphql(
      PR_CHECK_ROLLUP_QUERY,
      context,
      after
    );
    const commits = list(
      at(pullRequest, ["commits", "nodes"]),
      "commits.nodes"
    );
    if (commits.length === 0)
      return { kind: "contexts", checks: [], endCursor: null };
    const commit = record(
      at(commits[commits.length - 1], ["commit"]),
      "commit"
    );
    if (commit.statusCheckRollup === null) return { kind: "no-rollup" };
    const contexts = record(
      at(commit, ["statusCheckRollup", "contexts"]),
      "contexts"
    );
    const checks = list(contexts.nodes, "contexts.nodes")
      .map(mapRollupNode)
      .filter((check): check is T.Check => check !== null);
    const page = record(contexts.pageInfo, "contexts.pageInfo");
    if (typeof page.hasNextPage !== "boolean")
      missing("contexts.pageInfo.hasNextPage", page.hasNextPage);
    const cursor = optionalString(
      page.endCursor,
      "contexts.pageInfo.endCursor"
    );
    return {
      kind: "contexts",
      checks,
      endCursor: page.hasNextPage && cursor ? cursor : null,
    };
  }
  async reviewThreadPage(
    context: T.PrContext,
    after: string | null
  ): Promise<T.ReviewThreadPage> {
    const argv = graphqlArgs(REVIEW_THREADS_QUERY, context);
    if (after !== null) argv.push("-f", `after=${after}`);
    return parseReviewThreadPage(await this.runJson(argv));
  }
  async commitRollups(
    context: T.PrContext
  ): Promise<readonly T.CommitRollup[]> {
    const pullRequest = await this.graphql(PR_COMMIT_STATUS_QUERY, context);
    const commits = list(
      at(pullRequest, ["commits", "nodes"]),
      "commits.nodes"
    );
    return commits.map((item, index) => {
      const commit = record(at(item, ["commit"]), `commits[${index}].commit`);
      const rollup = commit.statusCheckRollup;
      return {
        oid: string(commit.oid, `commits[${index}].oid`),
        state:
          rollup === null
            ? null
            : nullableEnum(
                at(rollup, ["state"]),
                ROLLUP_STATES,
                `commits[${index}].statusCheckRollup.state`
              ),
      };
    });
  }
}

export async function resolveChecks(
  reader: T.GitHubReader,
  context: T.PrContext
): Promise<T.CheckRead> {
  const fast = await reader.checksFastPath(context);
  const direct = fast.kind === "checks" ? nonEmpty(fast.checks) : null;
  if (direct !== null)
    return { kind: "reported", source: "gh-pr-checks", checks: direct };
  const checks: T.Check[] = [];
  const cursors = new Set<string>();
  let after: string | null = null;
  let headHasRollup = true;
  do {
    const page = await reader.checkRollupPage(context, after);
    if (page.kind === "no-rollup") {
      headHasRollup = false;
      break;
    }
    checks.push(...page.checks);
    after = page.endCursor;
    if (after !== null) advanceCursor(cursors, after, "contexts");
  } while (after !== null);
  const fallback = nonEmpty(checks);
  if (fallback !== null)
    return { kind: "reported", source: "graphql-rollup", checks: fallback };
  // Both reads have to say it. A null rollup beside a failed fast path can be a
  // credential that cannot see checks, and a rollup that exists but maps to no
  // check can hold a context type this reader does not know.
  if (fast.kind === "none-reported" && !headHasRollup)
    return { kind: "no-checks" };
  const suffix =
    fast.kind === "unusable"
      ? `fast path exit=${fast.exitCode}; GraphQL rollup was empty${firstLine(fast.stderr) ? `; ${firstLine(fast.stderr)}` : ""}`
      : fast.kind === "none-reported"
        ? "fast path reported no checks; GraphQL rollup exists but listed no readable check"
        : "fast path and GraphQL rollup were empty";
  throw new ChecksUnavailable(`could not read PR checks: ${suffix}`);
}
export async function resolveReviewThreads(
  reader: T.GitHubReader,
  context: T.PrContext
): Promise<readonly T.ReviewThread[]> {
  const threads: T.RawReviewThread[] = [];
  const cursors = new Set<string>();
  let after: string | null = null;
  do {
    const page = await reader.reviewThreadPage(context, after);
    threads.push(...page.threads);
    after = page.endCursor;
    if (after !== null) advanceCursor(cursors, after, "reviewThreads");
  } while (after !== null);
  return buildReviewThreads(threads);
}
export async function resolveContext(args: {
  readonly reader: T.GitHubReader;
  readonly owner: string | null;
  readonly repo: string | null;
  readonly pr: T.PrNumber | null;
}): Promise<T.PrContext> {
  if (args.pr !== null && args.owner !== null && args.repo !== null)
    return { owner: args.owner, repo: args.repo, number: args.pr };
  if (args.pr !== null) {
    const origin = await args.reader.originRepo();
    if (origin !== null)
      return {
        owner: args.owner ?? origin.owner,
        repo: args.repo ?? origin.repo,
        number: args.pr,
      };
  }
  const inferred = await args.reader.currentPr(args.pr);
  if (args.pr === null) {
    // The checkout's PR number means nothing in another repository.
    const found = `${inferred.owner}/${inferred.repo}`;
    const requested = `${args.owner ?? inferred.owner}/${args.repo ?? inferred.repo}`;
    if (requested.toLowerCase() !== found.toLowerCase()) {
      const url = `https://github.com/${found}/pull/${inferred.number}`;
      throw new WatcherQueryError({
        kind: "invalid-context-url",
        retryable: false,
        rawValue: url,
        detail: `the current branch's PR ${url} is not in ${requested}; pass --pr`,
      });
    }
  }
  return {
    owner: args.owner ?? inferred.owner,
    repo: args.repo ?? inferred.repo,
    number: args.pr ?? inferred.number,
  };
}
export function orderStack(
  context: T.PrContext,
  trunk: string,
  everyOpen: readonly T.OpenPullRequest[]
): T.NonEmpty<T.PrContext> {
  const localHead = (pr: T.OpenPullRequest): boolean =>
    pr.headRepository !== null &&
    pr.headRepository.owner.toLowerCase() === context.owner.toLowerCase() &&
    pr.headRepository.repo.toLowerCase() === context.repo.toLowerCase();
  const open = everyOpen.filter(
    (pr) => !(localHead(pr) && pr.headRefName === trunk)
  );
  const byNumber = new Map(open.map((pr) => [pr.number, pr]));
  const byHead = new Map<string, T.OpenPullRequest[]>();
  const invalid = (detail: string): never => {
    throw new WatcherQueryError({
      kind: "invalid-stack",
      retryable: true,
      detail,
    });
  };
  for (const pr of open.filter(localHead)) {
    byHead.set(pr.headRefName, [...(byHead.get(pr.headRefName) ?? []), pr]);
  }
  const parentFor = (branch: string): T.OpenPullRequest | undefined => {
    const candidates = byHead.get(branch) ?? [];
    if (candidates.length > 1)
      invalid(`multiple PRs have the same repository branch: ${branch}`);
    return candidates[0];
  };
  const children = new Map<string, T.OpenPullRequest[]>();
  for (const pr of open)
    children.set(pr.baseRefName, [...(children.get(pr.baseRefName) ?? []), pr]);
  for (const values of children.values())
    values.sort((a, b) => a.number - b.number);
  const start = byNumber.get(context.number);
  if (start === undefined) return [context];
  const down: T.OpenPullRequest[] = [];
  const ancestors = new Set<T.PrNumber>([start.number]);
  let current = start;
  while (byHead.has(current.baseRefName)) {
    const parent = parentFor(current.baseRefName);
    if (parent === undefined) break;
    if (ancestors.has(parent.number))
      invalid(`cycle in PR stack at #${parent.number}`);
    ancestors.add(parent.number);
    down.push(parent);
    current = parent;
  }
  const seen = new Set<T.PrNumber>([
    ...down.map((pr) => pr.number),
    start.number,
  ]);
  const up: T.OpenPullRequest[] = [];
  const visit = (parent: T.OpenPullRequest): void => {
    if (!localHead(parent)) return;
    const descendants = children.get(parent.headRefName) ?? [];
    if (descendants.length > 0) parentFor(parent.headRefName);
    for (const child of descendants) {
      if (seen.has(child.number)) continue;
      seen.add(child.number);
      up.push(child);
      visit(child);
    }
  };
  visit(start);
  return (
    nonEmpty(
      [...down.reverse(), start, ...up].map((pr) => ({
        ...context,
        number: pr.number,
      }))
    ) ?? [context]
  );
}
export async function discoverStack(
  reader: T.GitHubReader,
  context: T.PrContext
): Promise<T.NonEmpty<T.PrContext>> {
  const open = await reader.openPullRequests(context);
  // gh returns the newest PRs with no truncation signal, so a full page may
  // have dropped an older PR from the bottom of the stack.
  if (open.length >= OPEN_PR_LIMIT)
    throw new WatcherQueryError({
      kind: "invalid-stack",
      retryable: true,
      detail: `open PR list reached the ${OPEN_PR_LIMIT}-PR limit, so the stack may be incomplete`,
    });
  return orderStack(context, await reader.defaultBranch(context), open);
}
