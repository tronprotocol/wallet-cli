import { describe, it, expect } from "vitest";
import { typedDataSignSpec, typedDataSignBinding } from "./typed-data.js";

const ctx = { activeAccount: "main" } as never;
const net = { family: "tron", id: "nile", chainId: "728126428" } as never;

const PAYLOAD = JSON.stringify({
  domain: { name: "SunPerp", version: "1", chainId: 728126428 },
  types: { EIP712Domain: [{ name: "name", type: "string" }], Order: [{ name: "size", type: "uint256" }] },
  message: { size: "1" },
});

const stubResult = { address: "T1", primaryType: "Order", digest: "0xd", signature: "0xs" };

describe("typed-data sign spec", () => {
  it("is its own group and never broadcasts", () => {
    expect(typedDataSignSpec.path).toEqual(["typed-data", "sign"]);
    expect(typedDataSignSpec.broadcasts).toBeFalsy();
    expect(typedDataSignSpec.auth).toBe("required");
  });

  // the payload is not a secret, so argv is the only channel — no --typed-data-stdin exists.
  it("declares no stdin channel", () => {
    expect(typedDataSignSpec.stdin).toBeUndefined();
  });

  it("requires --typed-data", () => {
    expect(typedDataSignSpec.baseFields.safeParse({}).success).toBe(false);
    expect(typedDataSignSpec.baseFields.safeParse({ typedData: PAYLOAD }).success).toBe(true);
  });
});

describe("typed-data sign binding", () => {
  it("normalizes the payload before signing", async () => {
    let seen: any;
    const svc = {
      sign: async (_c: unknown, _f: unknown, _a: unknown, payload: unknown) => {
        seen = payload;
        return stubResult;
      },
    };
    const out = await typedDataSignBinding(svc as never).run(ctx, net, { typedData: PAYLOAD });
    expect(seen.types.EIP712Domain).toBeUndefined();
    expect(seen.types.Order).toBeDefined();
    expect(out).toEqual(stubResult);
  });

  it("rejects malformed JSON with invalid_value", async () => {
    const svc = { sign: async () => stubResult };
    await expect(typedDataSignBinding(svc as never).run(ctx, net, { typedData: "nope" }))
      .rejects.toMatchObject({ code: "invalid_value" });
  });

  it("rejects a structurally invalid payload with invalid_value", async () => {
    const svc = { sign: async () => stubResult };
    await expect(
      typedDataSignBinding(svc as never).run(ctx, net, { typedData: '{"domain":{},"types":{}}' }),
    ).rejects.toMatchObject({ code: "invalid_value" });
  });
});
