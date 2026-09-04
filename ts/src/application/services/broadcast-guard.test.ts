import { describe, expect, it } from "vitest";
import { assertBroadcastAllowed, barBroadcasts } from "./broadcast-guard.js";

describe("broadcast guard", () => {
  it("allows broadcasting outside a barred section", () => {
    expect(() => assertBroadcastAllowed()).not.toThrow();
  });

  it("rejects a broadcast attempted inside a barred section", async () => {
    await barBroadcasts("tx broadcast --dry-run", async () => {
      expect(() => assertBroadcastAllowed()).toThrowError(/dry run|reached the broadcast path/i);
    });
  });

  it("names the caller so the report says which command misbehaved", async () => {
    await barBroadcasts("tx broadcast --dry-run", async () => {
      try {
        assertBroadcastAllowed();
        expect.unreachable("the guard should have thrown");
      } catch (e) {
        expect((e as Error).message).toContain("tx broadcast --dry-run");
        expect((e as { code?: string }).code).toBe("dry_run_violation");
      }
    });
  });

  // A bar that outlived its section would turn every later broadcast in the same process into a
  // false bug report — the failure mode of a guard is that it fires when it should not.
  it("lifts the bar once the section returns", async () => {
    await barBroadcasts("tx broadcast --dry-run", async () => {});
    expect(() => assertBroadcastAllowed()).not.toThrow();
  });

  it("lifts the bar when the section throws", async () => {
    await expect(
      barBroadcasts("tx broadcast --dry-run", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(() => assertBroadcastAllowed()).not.toThrow();
  });
});
