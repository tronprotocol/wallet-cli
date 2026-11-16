// Fetches a plugin package from an npm registry over HTTP, without npm.
import { createHash } from "node:crypto";
import type { DispatchCheck } from "../../../application/contracts/deadline.js";
import type { PluginPackage } from "../../../application/ports/plugin-source.js";
import { ChainError, ExecutionError, TransportError } from "../../../domain/errors/index.js";
import { formatRegistrySpec, type RegistrySpec } from "../../../domain/plugins/index.js";
import { fetchBounded } from "../http/http-response.js";
import { requestJson } from "../http/json-service.js";
import { MAX_ARCHIVE_BYTES } from "./tar.js";
import { archivePackage } from "./package.js";

type Fetch = typeof fetch;

const SERVICE = "plugin registry";

const errors = (what: string) => ({
  timeout: () => new TransportError("timeout", `the ${SERVICE} did not answer in time (${what})`),
  unreachable: () =>
    new TransportError("provider_error", `the ${SERVICE} could not be reached (${what})`),
  malformed: () => new TransportError("provider_error", `the ${SERVICE} sent malformed ${what}`),
});

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function notFound(message: string): ChainError {
  return new ChainError("not_found", message);
}

// Scoped names keep their `@` and encode the slash, as npm does.
export function metadataUrl(registry: string, name: string): string {
  return `${registry}/${name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name)}`;
}

// Checks the download against the registry's SHA-512 value before anything reads it.
export function verifyIntegrity(bytes: Uint8Array, integrity: string, spec: string): string {
  const declared = integrity
    .trim()
    .split(/\s+/)
    .find((value) => value.startsWith("sha512-"));
  if (declared === undefined) {
    throw new ExecutionError(
      "plugin_integrity",
      `the registry gives no SHA-512 integrity value for ${spec}`,
    );
  }
  const actual = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  if (actual !== declared) {
    throw new ExecutionError(
      "plugin_integrity",
      `the download of ${spec} does not match the registry's integrity value; nothing was installed`,
      { expected: declared, actual },
    );
  }
  return declared;
}

export class RegistryClient {
  constructor(private readonly fetchImpl: Fetch = globalThis.fetch) {}

  async fetch(registry: string, spec: RegistrySpec, check: DispatchCheck): Promise<PluginPackage> {
    const label = formatRegistrySpec(spec);
    const { body } = await requestJson(
      this.fetchImpl,
      metadataUrl(registry, spec.name),
      { method: "GET", headers: { Accept: "application/json" } },
      {
        service: SERVICE,
        check,
        errors: errors("package metadata"),
        refuse: (response) =>
          response.status === 404
            ? notFound(`package ${spec.name} was not found in the registry ${registry}`)
            : new TransportError(
                "provider_error",
                `the ${SERVICE} answered ${response.status} for ${spec.name}`,
              ),
      },
    );
    const metadata = record(body);
    const versions = record(metadata?.versions);
    const tags = record(metadata?.["dist-tags"]);
    const requested = spec.version ?? "latest";
    const version = versions && Object.hasOwn(versions, requested) ? requested : tags?.[requested];
    const manifest =
      typeof version === "string" && versions && Object.hasOwn(versions, version)
        ? record(versions[version])
        : undefined;
    if (manifest === undefined) {
      throw notFound(`version ${requested} of ${spec.name} was not found in the registry`);
    }
    const dist = record(manifest.dist);
    if (typeof dist?.tarball !== "string" || typeof dist.integrity !== "string") {
      throw errors("package metadata").malformed();
    }
    const tarball = await this.#download(dist.tarball, label, check);
    const integrity = verifyIntegrity(tarball, dist.integrity, `${spec.name}@${version}`);
    return archivePackage(tarball, {
      source: { type: "registry", spec: label, registry },
      integrity,
    });
  }

  async #download(url: string, label: string, check: DispatchCheck): Promise<Uint8Array> {
    let response: Response;
    try {
      response = await fetchBounded(
        this.fetchImpl,
        url,
        { method: "GET", redirect: "follow" },
        check,
        MAX_ARCHIVE_BYTES,
      );
    } catch (error) {
      if (error instanceof TransportError && error.code === "response_too_large") {
        throw new ExecutionError("plugin_invalid", `the package ${label} is too large`);
      }
      if (error instanceof TransportError || error instanceof ExecutionError) throw error;
      throw errors(`the package ${label}`).unreachable();
    }
    if (response.status === 404) throw notFound(`the package file of ${label} was not found`);
    if (!response.ok) {
      throw new TransportError(
        "provider_error",
        `the ${SERVICE} answered ${response.status} for the package ${label}`,
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}
