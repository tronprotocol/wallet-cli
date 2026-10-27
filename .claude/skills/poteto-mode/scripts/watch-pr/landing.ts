import { WatcherQueryError } from "./github.ts";
import { parsePrNumber, type PrContext } from "./types.ts";

export interface LandingRevision {
  readonly context: PrContext;
  readonly headRefOid: string;
  readonly baseRefName: string;
  readonly baseRefOid: string;
}

function invalid(detail: string): never {
  throw new WatcherQueryError({ kind: "missing-key", retryable: true, detail });
}

export function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    invalid(`${label} must be an object`);
  return value as Record<string, unknown>;
}

export function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0)
    invalid(`${label} must be a non-empty string`);
  return value;
}

export const nullableText = (value: unknown, label: string): string | null =>
  value === null ? null : text(value, label);

export function baseRefTargetOid(value: unknown): string | null {
  if (value === null) return null;
  const baseRef = object(value, "baseRef");
  if (baseRef.target === null) return null;
  const target = object(baseRef.target, "baseRef.target");
  return nullableText(target.oid, "baseRef.target.oid");
}

export function oneOf<const V extends readonly string[]>(
  value: unknown,
  values: V,
  label: string
): V[number] {
  for (const candidate of values) if (candidate === value) return candidate;
  return invalid(`missing or invalid ${label}`);
}

export function flag(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") invalid(`missing ${label}`);
  return value;
}

export function parseContext(value: unknown): PrContext {
  const fields = object(value, "PR context");
  const owner = text(fields.owner, "owner");
  const repo = text(fields.repo, "repo");
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo))
    invalid("owner and repo must be individual repository names");
  return { owner, repo, number: parsePrNumber(fields.number) };
}

export function parseLandingRevision(value: unknown): LandingRevision {
  const fields = object(value, "landing revision");
  return {
    context: parseContext(fields.context),
    headRefOid: text(fields.headRefOid, "headRefOid"),
    baseRefName: text(fields.baseRefName, "baseRefName"),
    baseRefOid: text(fields.baseRefOid, "baseRefOid"),
  };
}

export function landingRevision(source: LandingRevision): LandingRevision {
  const { context, headRefOid, baseRefName, baseRefOid } = source;
  return { context, headRefOid, baseRefName, baseRefOid };
}

export function sameLandingRevision(
  a: LandingRevision,
  b: LandingRevision
): boolean {
  return (
    a.context.owner.toLowerCase() === b.context.owner.toLowerCase() &&
    a.context.repo.toLowerCase() === b.context.repo.toLowerCase() &&
    a.context.number === b.context.number &&
    a.headRefOid === b.headRefOid &&
    a.baseRefName === b.baseRefName &&
    a.baseRefOid === b.baseRefOid
  );
}
