// Format results and progress; errors are written through the streams port.
import type { NetworkDescriptor, OutputMode } from "../../../../domain/types/index.js";
import type { ProgressEvent } from "../../../../application/contracts/index.js";
import type { Pagination, QueryEcho, StreamManager, TextFormatter } from "../contracts/index.js";
import type { CliError } from "../../../../domain/errors/index.js";
import { OutputEnvelope, toJson } from "./envelope.js";
import { renderErrorDetails, renderGenericText } from "../render/index.js";
import { sanitizeText } from "../render/scalars.js";

export interface OutputFormatter {
  // Return the result frame for streams.result.
  success(
    command: string,
    net: NetworkDescriptor | undefined,
    data: unknown,
    formatText?: TextFormatter,
    accountLabel?: string,
  ): string;
  // Write JSON errors to stdout or human errors to stderr.
  error(err: CliError, ctx?: { commandId?: string; net?: NetworkDescriptor }): void;
  // Return a progress frame for streams.event; null suppresses it.
  event(e: ProgressEvent): string | null;
}

abstract class BaseOutputFormatter {
  constructor(
    protected readonly streams: StreamManager,
    protected readonly startedAt: number,
  ) {}

  protected meta() {
    return { durationMs: Date.now() - this.startedAt, warnings: this.streams.warnings() };
  }
}

class JsonOutputFormatter extends BaseOutputFormatter implements OutputFormatter {
  success(command: string, net: NetworkDescriptor | undefined, data: unknown): string {
    const paged = extractPagination(stripView(data));
    const ordered = extractQuery(paged.data);
    return toJson(
      OutputEnvelope.success(command, net, ordered.data, {
        ...this.meta(),
        ...(paged.pagination ? { pagination: paged.pagination } : {}),
        ...(ordered.query ? { query: ordered.query } : {}),
      }),
    );
  }

  error(err: CliError, ctx?: { commandId?: string; net?: NetworkDescriptor }): void {
    const env = OutputEnvelope.error(ctx?.commandId ?? "", ctx?.net, err.toEnvelope(), this.meta());
    this.streams.result(toJson(env));
  }

  event(e: ProgressEvent): string {
    return JSON.stringify(e);
  }
}

// Move query metadata only in JSON mode; text renderers retain the original view.
function extractQuery(data: unknown): { data: unknown; query?: QueryEcho } {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { data };
  const source = data as Record<string, unknown>;
  const value = source.query;
  if (!value || typeof value !== "object" || Array.isArray(value)) return { data };
  const { orderBy, sort } = value as Record<string, unknown>;
  if (typeof orderBy !== "string" || typeof sort !== "string") return { data };
  const rest = { ...source };
  delete rest.query;
  return { data: rest, query: { orderBy, sort } };
}

// The reserved view key holds text-only data and must not appear in JSON.
function stripView(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  if (!("view" in (data as Record<string, unknown>))) return data;
  const { view: _view, ...rest } = data as Record<string, unknown>;
  return rest;
}

function extractPagination(data: unknown): { data: unknown; pagination?: Pagination } {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { data };
  const source = data as Record<string, unknown>;
  const value = source.pagination;
  if (!value || typeof value !== "object" || Array.isArray(value)) return { data };
  const pagination = value as Record<string, unknown>;
  // Leave unrelated pagination fields in the payload.
  if (
    !Number.isInteger(pagination.offset) ||
    !(pagination.limit === null || Number.isInteger(pagination.limit))
  )
    return { data };
  const normalized: Pagination = {
    offset: Number(pagination.offset),
    limit: pagination.limit === null ? null : Number(pagination.limit),
    total: Number.isInteger(pagination.total) ? Number(pagination.total) : null,
    ...(typeof pagination.hasMore === "boolean" ? { hasMore: pagination.hasMore } : {}),
    ...(typeof pagination.nextCursor === "string" || pagination.nextCursor === null
      ? { nextCursor: pagination.nextCursor }
      : {}),
  };
  const clean = { ...source };
  delete clean.pagination;
  return { data: clean, pagination: normalized };
}

class HumanOutputFormatter extends BaseOutputFormatter implements OutputFormatter {
  // Sanitize text frames against terminal injection; JSON retains raw values.
  success(
    command: string,
    net: NetworkDescriptor | undefined,
    data: unknown,
    formatText?: TextFormatter,
    accountLabel?: string,
  ): string {
    const env = OutputEnvelope.success(command, net, data, this.meta());
    const custom = formatText?.(env.data, { command: env.command, net, accountLabel });
    return sanitizeText(custom ?? renderGenericText(env.command, net, env.data));
  }

  error(err: CliError): void {
    const line = `error [${err.code}]: ${err.textMessage}`;
    const candidates = renderErrorDetails(err.details);
    this.streams.errorLine(sanitizeText(candidates ? `${line}\n${candidates}` : line));
  }

  event(e: ProgressEvent): string {
    return sanitizeText(renderEvent(e));
  }
}

export function createOutputFormatter(
  output: OutputMode,
  streams: StreamManager,
  startedAt: number,
): OutputFormatter {
  return output === "json"
    ? new JsonOutputFormatter(streams, startedAt)
    : new HumanOutputFormatter(streams, startedAt);
}

function renderEvent(e: ProgressEvent): string {
  switch (e.type) {
    case "activity":
      return `⏳ ${e.message}`;
    case "awaiting_device":
      switch (e.reason) {
        case "sign":
          return "⧖ review and approve the transaction on your device";
        case "open_app":
          return "⧖ confirm on your device to open the app";
        case "unlock":
          return "⧖ unlock your device with your PIN";
      }
    // eslint-disable-next-line no-fallthrough
    case "deriving-address":
      return "deriving address from your device…";
    case "pre-verify-address":
      return `compare with your device: ${e.address}`;
    case "signed":
      return "✓ signed; broadcasting…";
    case "broadcasting":
      return "broadcasting…";
    case "dry-run":
      return "dry run (transaction not broadcast)";
  }
}
