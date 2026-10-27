import {
  baseRefTargetOid,
  flag,
  nullableText,
  object,
  oneOf,
  text,
  parseLandingRevision,
  sameLandingRevision,
  type LandingRevision,
} from "./landing.ts";
import type { PrContext } from "./types.ts";

export interface LandingRecord {
  readonly revision: LandingRevision;
  readonly pullRequestId: string;
  readonly state: "OPEN" | "CLOSED" | "MERGED";
  readonly pending: {
    readonly autoMerge: boolean;
    readonly queueEntryId: string | null;
  };
  readonly mergeCommitOid: string | null;
}

export interface ShippingService {
  inspect(context: PrContext): Promise<LandingRecord>;
  disableAutoMerge(pullRequestId: string): Promise<void>;
  dequeue(pullRequestId: string): Promise<void>;
}

export type ShippingResult =
  | { readonly kind: "inspected" | "cancelled"; readonly record: LandingRecord }
  | {
      readonly kind: "changed";
      readonly expected: LandingRecord;
      readonly observed: LandingRecord;
    }
  | {
      readonly kind: "not-open" | "still-pending";
      readonly record: LandingRecord;
    }
  | { readonly kind: "unavailable"; readonly detail: string };

const STATES = ["OPEN", "CLOSED", "MERGED"] as const;

export function parseLandingRecord(value: unknown): LandingRecord {
  const record = object(value, "landing record");
  const pending = object(record.pending, "pending merges");
  const autoMerge = flag(pending.autoMerge, "autoMerge state");
  return {
    revision: parseLandingRevision(record.revision),
    pullRequestId: text(record.pullRequestId, "pullRequestId"),
    state: oneOf(record.state, STATES, "PR state"),
    pending: {
      autoMerge,
      queueEntryId: nullableText(pending.queueEntryId, "queueEntryId"),
    },
    mergeCommitOid: nullableText(record.mergeCommitOid, "mergeCommitOid"),
  };
}

function unavailable(error: unknown): ShippingResult {
  return {
    kind: "unavailable",
    detail: error instanceof Error ? error.message : String(error),
  };
}

export async function inspectLanding(
  service: ShippingService,
  context: PrContext
): Promise<ShippingResult> {
  try {
    return { kind: "inspected", record: await service.inspect(context) };
  } catch (error) {
    return unavailable(error);
  }
}

export async function cancelPending(
  service: ShippingService,
  expected: LandingRecord
): Promise<ShippingResult> {
  const mismatch = (record: LandingRecord): ShippingResult | null => {
    if (record.state !== "OPEN") return { kind: "not-open", record };
    if (
      record.pullRequestId !== expected.pullRequestId ||
      !sameLandingRevision(record.revision, expected.revision)
    )
      return { kind: "changed", expected, observed: record };
    return null;
  };
  if (expected.state !== "OPEN") return { kind: "not-open", record: expected };
  try {
    let record = await service.inspect(expected.revision.context);
    let refusal = mismatch(record);
    if (refusal) return refusal;
    if (record.pending.autoMerge) {
      await service.disableAutoMerge(record.pullRequestId);
      record = await service.inspect(expected.revision.context);
      refusal = mismatch(record);
      if (refusal) return refusal;
    }
    if (record.pending.queueEntryId !== null) {
      await service.dequeue(record.pullRequestId);
    }
    record = await service.inspect(expected.revision.context);
    refusal = mismatch(record);
    if (refusal) return refusal;
    if (record.pending.autoMerge || record.pending.queueEntryId !== null)
      return { kind: "still-pending", record };
    return { kind: "cancelled", record };
  } catch (error) {
    return unavailable(error);
  }
}

const INSPECT_QUERY = `query Landing($owner:String!,$repo:String!,$pr:Int!) {
  repository(owner:$owner,name:$repo) {
    pullRequest(number:$pr) {
      id state headRefOid baseRefName baseRefOid
      baseRef { target { oid } }
      autoMergeRequest { enabledAt }
      mergeQueueEntry { id }
      mergeCommit { oid }
    }
  }
}`;

function data(value: unknown): Record<string, unknown> {
  const response = object(value, "GraphQL response");
  if (response.errors !== undefined) throw new Error("GraphQL returned errors");
  return object(response.data, "GraphQL data");
}

export class GhShippingService implements ShippingService {
  constructor(
    private readonly execute: (
      argv: readonly [string, ...string[]]
    ) => Promise<unknown>
  ) {}

  async inspect(context: PrContext): Promise<LandingRecord> {
    const response = data(
      await this.execute([
        "gh",
        "api",
        "graphql",
        "-f",
        `query=${INSPECT_QUERY}`,
        "-f",
        `owner=${context.owner}`,
        "-f",
        `repo=${context.repo}`,
        "-F",
        `pr=${context.number}`,
      ])
    );
    const fields = object(
      object(response.repository, "repository").pullRequest,
      "pullRequest"
    );
    const state = oneOf(fields.state, STATES, "PR state");
    const currentBaseOid = baseRefTargetOid(fields.baseRef);
    const autoMerge =
      fields.autoMergeRequest === null
        ? false
        : Boolean(
            text(
              object(fields.autoMergeRequest, "autoMergeRequest").enabledAt,
              "enabledAt"
            )
          );
    const queueEntryId =
      fields.mergeQueueEntry === null
        ? null
        : text(
            object(fields.mergeQueueEntry, "mergeQueueEntry").id,
            "queue entry id"
          );
    return {
      revision: {
        context,
        headRefOid: text(fields.headRefOid, "headRefOid"),
        baseRefName: text(fields.baseRefName, "baseRefName"),
        baseRefOid: text(
          state === "OPEN"
            ? currentBaseOid
            : (currentBaseOid ?? fields.baseRefOid),
          "baseRef.target.oid"
        ),
      },
      pullRequestId: text(fields.id, "pull request id"),
      state,
      pending: { autoMerge, queueEntryId },
      mergeCommitOid:
        fields.mergeCommit === null
          ? null
          : text(
              object(fields.mergeCommit, "mergeCommit").oid,
              "merge commit oid"
            ),
    };
  }

  async disableAutoMerge(id: string): Promise<void> {
    const result = data(
      await this.execute([
        "gh",
        "api",
        "graphql",
        "-f",
        "query=mutation($id:ID!) { disablePullRequestAutoMerge(input:{pullRequestId:$id}) { clientMutationId } }",
        "-f",
        `id=${id}`,
      ])
    );
    object(result.disablePullRequestAutoMerge, "disablePullRequestAutoMerge");
  }

  async dequeue(id: string): Promise<void> {
    const result = data(
      await this.execute([
        "gh",
        "api",
        "graphql",
        "-f",
        "query=mutation($id:ID!) { dequeuePullRequest(input:{id:$id}) { clientMutationId } }",
        "-f",
        `id=${id}`,
      ])
    );
    object(result.dequeuePullRequest, "dequeuePullRequest");
  }
}
