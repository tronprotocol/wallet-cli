/**
 * Everything `sunpump launch` refuses before a byte is sent, and the declarations that keep it out
 * of the transaction machinery.
 *
 * Every refusal here depends on nothing remote, so it belongs to the schema. The reason is this
 * service's defining behaviour: it does not reject what it does not understand, it stores it. A
 * link that is not a URL is therefore not an error but a permanent token with a broken link, and a
 * refusal that is not made here is never made at all.
 */
import { describe, expect, it } from "vitest";
import type { ZodIssue } from "zod";
import { sunpumpLaunchSpec, sunpumpLaunchTronBinding } from "./launch.js";
import type { SunPumpTokenLaunchService } from "../../../../../application/use-cases/tron/sunpump/token-launch-service.js";
import type { NetworkDescriptor } from "../../../../../domain/types/index.js";
import type { ExecutionContext } from "../../contracts/execution-context.js";

interface SafeParse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { issues: (ZodIssue & { params?: { errorCode?: string } })[] };
}

const schema = (
  sunpumpLaunchSpec.baseFields as unknown as {
    superRefine: (refine: unknown) => { safeParse: (value: unknown) => SafeParse };
  }
).superRefine(sunpumpLaunchSpec.baseRefine as unknown);

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

  // Absent → `missing_option` (exit 2), which the shell derives from the field being required and
  // missing from argv. The schema's job is only to declare it required.
  it.each(["name", "symbol", "description"])("requires --%s", (field) => {
    const value = { ...BASE } as Record<string, unknown>;
    delete value[field];
    expect(refusals(value)).toEqual([{ path: field, code: undefined }]);
  });

  /**
   * No local rule on the name or the symbol.
   *
   * Their limits are the service's and are not published. A local guess would refuse names SunPump
   * accepts; a rejection comes back as `provider_error` carrying the service's own message.
   */
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

  // Two logos, one token: whichever won would be a coin toss the caller did not know they made.
  it("refuses --image and --image-base64 together as invalid_option", () => {
    expect(refusals({ ...BASE, image: "./logo.png", imageBase64: "QQ==" })).toEqual([
      { path: "imageBase64", code: "invalid_option" },
    ]);
    expect(schema.safeParse({ ...BASE, image: "./logo.png" }).success).toBe(true);
    expect(schema.safeParse({ ...BASE, imageBase64: "QQ==" }).success).toBe(true);
  });

  it("treats a missing logo as valid — the token is created without one", () => {
    expect(schema.safeParse(BASE).success).toBe(true);
  });
});

/**
 * The declarations, checked because each one of them is load-bearing.
 *
 * Nothing about this command signs, broadcasts or belongs to an account, and each of those facts is
 * carried by one field. `broadcasts` would hand it `--wait` and a three-stage receipt it has no
 * transaction for; `auth` would demand a master password to run a remote create; `rejectsAccount` is
 * what makes `--account` an error instead of a silently ignored flag that implies ownership.
 */
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

  // The SDK's `tweetUsername` is deliberately not exposed as a flag.
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

  // A preview whose file does not exist has validated nothing, so the file is read even for a dry
  // run — and a path that is not there is `file_not_found`, not a provider failure.
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
    const path = new URL("./__fixtures__/logo.txt", import.meta.url).pathname;
    await binding.run(ctx, net, { ...BASE, image: path, dryRun: true });
    expect(calls[0]).toMatchObject({
      image: { source: "file", path, bytes: 4, base64: Buffer.from("ABCD").toString("base64") },
    });
  });
});
