import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { tarball } from "../../../../test/plugins/tarball.js";
import { parseRegistrySpec } from "../../../domain/plugins/index.js";
import { metadataUrl, RegistryClient, verifyIntegrity } from "./registry.js";

const REGISTRY = "https://registry.test";
const PACKAGE = tarball([
  { name: "package/package.json", body: JSON.stringify({ name: "x", version: "1.2.0" }) },
  { name: "package/dist/index.mjs", body: "export default {};" },
]);
const INTEGRITY = `sha512-${createHash("sha512").update(PACKAGE).digest("base64")}`;

const check = () => ({ signal: new AbortController().signal, assertDispatchable: vi.fn() });

function registry(integrity = INTEGRITY, status = 200) {
  const metadata = {
    name: "@tron-walletcli/plugin-demo",
    "dist-tags": { latest: "1.2.0", beta: "2.0.0-beta.1" },
    versions: {
      "1.2.0": { dist: { tarball: `${REGISTRY}/demo-1.2.0.tgz`, integrity } },
    },
  };
  return vi.fn(async (url: string | URL | Request) => {
    const href = String(url);
    if (href.endsWith(".tgz")) return new Response(PACKAGE, { status: 200 });
    if (status !== 200) return new Response("{}", { status });
    return Response.json(metadata);
  });
}

describe("verifyIntegrity", () => {
  it("accepts the SHA-512 value of the download and refuses any other", () => {
    expect(verifyIntegrity(PACKAGE, `sha1-abc ${INTEGRITY}`, "demo@1")).toBe(INTEGRITY);
    expect(() => verifyIntegrity(Buffer.from("other"), INTEGRITY, "demo@1")).toThrow(
      expect.objectContaining({ code: "plugin_integrity" }),
    );
    expect(() => verifyIntegrity(PACKAGE, "sha1-abc", "demo@1")).toThrow(
      expect.objectContaining({
        code: "plugin_integrity",
        message: expect.stringContaining("no SHA-512"),
      }),
    );
  });
});

describe("RegistryClient", () => {
  it("encodes scoped names as npm does", () => {
    expect(metadataUrl(REGISTRY, "@tron-walletcli/plugin-demo")).toBe(
      `${REGISTRY}/@tron-walletcli%2Fplugin-demo`,
    );
  });

  it("resolves the latest tag, checks integrity, and reads the package", async () => {
    const fetchImpl = registry();
    const dispatch = check();
    const pkg = await new RegistryClient(fetchImpl as never).fetch(
      REGISTRY,
      parseRegistrySpec("demo"),
      dispatch,
    );
    expect(pkg.packageJson).toEqual({ name: "x", version: "1.2.0" });
    expect(pkg.integrity).toBe(INTEGRITY);
    expect(pkg.source).toEqual({
      type: "registry",
      spec: "@tron-walletcli/plugin-demo",
      registry: REGISTRY,
    });
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      `${REGISTRY}/@tron-walletcli%2Fplugin-demo`,
      `${REGISTRY}/demo-1.2.0.tgz`,
    ]);
    expect(dispatch.assertDispatchable).toHaveBeenCalledTimes(2);
  });

  it("refuses a download whose integrity does not match, before reading it", async () => {
    const wrong = `sha512-${createHash("sha512").update("other").digest("base64")}`;
    await expect(
      new RegistryClient(registry(wrong) as never).fetch(
        REGISTRY,
        parseRegistrySpec("demo"),
        check(),
      ),
    ).rejects.toMatchObject({ code: "plugin_integrity" });
  });

  it("reports a missing package or version as not_found", async () => {
    await expect(
      new RegistryClient(registry(INTEGRITY, 404) as never).fetch(
        REGISTRY,
        parseRegistrySpec("demo"),
        check(),
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      new RegistryClient(registry() as never).fetch(
        REGISTRY,
        parseRegistrySpec("demo@9.9.9"),
        check(),
      ),
    ).rejects.toMatchObject({ code: "not_found", message: expect.stringContaining("9.9.9") });
  });

  it("sends nothing when the deadline refuses the dispatch", async () => {
    const fetchImpl = registry();
    const refusing = {
      signal: new AbortController().signal,
      assertDispatchable: () => {
        throw Object.assign(new Error("expired"), { code: "timeout" });
      },
    };
    await expect(
      new RegistryClient(fetchImpl as never).fetch(REGISTRY, parseRegistrySpec("demo"), refusing),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
