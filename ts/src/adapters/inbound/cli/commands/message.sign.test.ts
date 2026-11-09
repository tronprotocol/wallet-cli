import { describe, it, expect } from "vitest";
import { messageSignSpec, messageSignBinding } from "./shared.js";

describe("message sign exclusive group", () => {
  it("declares the inline flag and the stdin channel as jointly required", () => {
    expect(messageSignSpec.exclusive).toEqual([
      { label: "the message to sign", flags: ["message", "message-stdin"], select: "exactly-one" },
    ]);
  });

  it("states the constraint once — in the group, not also in the field description", () => {
    const description =
      (messageSignSpec.baseFields.shape.message as { description?: string }).description ?? "";
    expect(description).not.toMatch(/exactly one|OR --message-stdin/i);
    expect(description).toBeTruthy();
  });

  it("still routes the resolved message to the service", async () => {
    let received: unknown;
    const service = {
      sign: async (_ctx: unknown, _family: unknown, _account: unknown, message: string) => {
        received = message;
        return { kind: "message-sign" };
      },
    };
    const ctx = {
      activeAccount: "main",
      secrets: { pick: (inline: string | undefined) => inline ?? "from-stdin" },
    } as never;
    await messageSignBinding(service as never).run(
      ctx,
      { family: "tron", nativeSymbol: "TRX" } as never,
      {
        message: "hello",
      },
    );
    expect(received).toBe("hello");
  });
});
