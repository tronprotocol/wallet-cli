import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { sunpumpLaunchSpec, sunpumpLaunchTronBinding } from "./launch.js";
import { chainInputSchema } from "../../shell/index.js";
import type { SunPumpTokenLaunchService } from "../../../../../application/use-cases/sunpump/token-launch-service.js";
import type { NetworkDescriptor } from "../../../../../domain/types/index.js";
import type { ExecutionContext } from "../../contracts/execution-context.js";

interface SafeParse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { issues: (z.core.$ZodIssue & { params?: { errorCode?: string } })[] };
}

const schema = chainInputSchema(
  sunpumpLaunchSpec,
  sunpumpLaunchTronBinding({} as SunPumpTokenLaunchService),
).input as unknown as { safeParse: (value: unknown) => SafeParse };

function refusals(value: Record<string, unknown>): { path: string; code?: string }[] {
  return (schema.safeParse(value).error?.issues ?? []).map((issue) => ({
    path: String(issue.path[0]),
    code: issue.params?.errorCode,
  }));
}

const BASE = { name: "Test Token", symbol: "TST", description: "demo" };

describe("the required options", () => {
  it("takes the three the service requires, and defaults --dry-run to off", () => {
    const parsed = schema.safeParse(BASE);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ ...BASE, dryRun: false });
  });

  it.each(["name", "symbol", "description"])("requires --%s", (field) => {
    const value = { ...BASE } as Record<string, unknown>;
    delete value[field];
    expect(refusals(value)).toEqual([{ path: field, code: undefined }]);
  });

  it("leaves the name and symbol rules to the service", () => {
    expect(
      schema.safeParse({ ...BASE, name: "a".repeat(300), symbol: "lower case $$" }).success,
    ).toBe(true);
  });
});

describe("the optional options", () => {
  it.each(["twitterUrl", "telegramUrl", "websiteUrl"])(
    "refuses a %s that is not http(s)",
    (field) => {
      expect(refusals({ ...BASE, [field]: "example.com" })).toEqual([
        { path: field, code: undefined },
      ]);
      expect(refusals({ ...BASE, [field]: "ftp://example.com" })).toEqual([
        { path: field, code: undefined },
      ]);
      expect(schema.safeParse({ ...BASE, [field]: "http://example.com" }).success).toBe(true);
      expect(schema.safeParse({ ...BASE, [field]: "https://example.com" }).success).toBe(true);
    },
  );

  it("refuses --image and --image-base64 together as invalid_option", () => {
    expect(refusals({ ...BASE, image: "./logo.png", imageBase64: "QQ==" })).toEqual([
      { path: "image", code: "invalid_option" },
    ]);
    expect(schema.safeParse({ ...BASE, image: "./logo.png" }).success).toBe(true);
    expect(schema.safeParse({ ...BASE, imageBase64: "QQ==" }).success).toBe(true);
  });

  it("treats a missing logo as valid — the token is created without one", () => {
    expect(schema.safeParse(BASE).success).toBe(true);
  });
});

describe("what the command declares", () => {
  it("needs no account, no password and no broadcast", () => {
    expect(sunpumpLaunchSpec.wallet).toBe("none");
    expect(sunpumpLaunchSpec.auth).toBe("none");
    expect(sunpumpLaunchSpec.broadcasts).toBeUndefined();
  });

  it("refuses --account, and says why", () => {
    expect(sunpumpLaunchSpec.rejectsAccount).toMatch(/created by SunPump/);
  });

  it("is gated on its own capability, so a network that may be listed is not one that may mint", () => {
    expect(sunpumpLaunchSpec.capability).toBe("sunpump.launch");
  });

  it("has no --wait, --build-only or --quote flag to offer", () => {
    const flags = Object.keys(sunpumpLaunchSpec.baseFields.shape);
    expect(flags).not.toContain("buildOnly");
    expect(flags).not.toContain("wait");
    expect(flags).not.toContain("quote");
    expect(flags).not.toContain("feeLimit");
  });

  it("offers exactly the documented flags", () => {
    expect(Object.keys(sunpumpLaunchSpec.baseFields.shape).sort()).toEqual([
      "description",
      "dryRun",
      "image",
      "imageBase64",
      "name",
      "symbol",
      "telegramUrl",
      "twitterUrl",
      "websiteUrl",
    ]);
  });

  it("says in its help that the new token is not the local account's", () => {
    expect(sunpumpLaunchSpec.description).toMatch(/not tied to any local account/);
    expect(sunpumpLaunchSpec.description).toMatch(
      /chosen by SunPump and is NOT your active account/,
    );
  });
});

describe("reading the logo file", () => {
  const net = { id: "tron:728126428", family: "tron" } as NetworkDescriptor;
  const ctx = {} as ExecutionContext;

  function bindingCapturing() {
    const calls: Record<string, unknown>[] = [];
    const service = {
      launch: async (_n: NetworkDescriptor, input: Record<string, unknown>) => {
        calls.push(input);
        return { kind: "sunpump-launch", mode: "dry-run" };
      },
    } as unknown as SunPumpTokenLaunchService;
    return { calls, binding: sunpumpLaunchTronBinding(service) };
  }

  it("reads --image during a dry run, and reports a missing file as file_not_found", async () => {
    const { calls, binding } = bindingCapturing();
    await expect(
      binding.run(ctx, net, { ...BASE, image: "./no-such-logo.png", dryRun: true }),
    ).rejects.toMatchObject({ code: "file_not_found" });
    expect(calls).toEqual([]);
  });

  it("passes a base64 logo through untouched", async () => {
    const { calls, binding } = bindingCapturing();
    await binding.run(ctx, net, { ...BASE, imageBase64: "QUJDRA==", dryRun: true });
    expect(calls[0]).toMatchObject({ image: { source: "base64", base64: "QUJDRA==" } });
  });

  it("encodes the file's own bytes, and reports its size on disk", async () => {
    const { calls, binding } = bindingCapturing();
    const path = fileURLToPath(new URL("./__fixtures__/logo.txt", import.meta.url));
    await binding.run(ctx, net, { ...BASE, image: path, dryRun: true });
    expect(calls[0]).toMatchObject({
      image: { source: "file", path, bytes: 4, base64: Buffer.from("ABCD").toString("base64") },
    });
  });
});
