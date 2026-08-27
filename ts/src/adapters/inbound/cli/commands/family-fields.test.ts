/**
 * Family-scoped command fields.
 *
 * A ChainSpec's `baseFields` is shared by every family, so it may only declare what every family
 * actually has. Two consequences this file pins down:
 *
 *  - TRC10 (`--asset-id`) is a TRON concept. It belongs to the TRON binding, not to the base.
 *  - An address flag stays a plain string in the base and is validated by the family's own
 *    `refine`, so help/catalog show one flag while each family still rejects the other's format.
 *    (Merging two same-named family fields would collapse in help — `mergedFields` is
 *    last-writer-wins — so the base-plus-refine shape is the one that survives EVM registration.)
 */
import { describe, it, expect } from "vitest";
import { composeRefines } from "../shell/index.js";
import {
  tokenBalanceSpec,
  tokenBalanceTronBinding,
  tokenInfoSpec,
  tokenInfoTronBinding,
} from "./token.js";
import { txSendSpec, txSendTronBinding } from "./tx.js";
import { contractCallSpec, contractCallTronBinding } from "./contract.js";
import type { ChainSpec, FamilyBinding } from "../contracts/index.js";

const TRON_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const EVM_CONTRACT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

/** the schema dispatch actually parses against: base + family fields + both refines. */
function effectiveSchema(spec: ChainSpec, binding: FamilyBinding) {
  const fields = binding.fields ? spec.baseFields.extend(binding.fields.shape) : spec.baseFields;
  return composeRefines(fields, spec.baseRefine, binding.refine);
}

const svc = {} as never;

describe("token selector fields", () => {
  it("keeps --asset-id out of the shared base (TRC10 is TRON-only)", () => {
    expect(Object.keys(tokenBalanceSpec.baseFields.shape)).not.toContain("assetId");
    expect(Object.keys(tokenInfoSpec.baseFields.shape)).not.toContain("assetId");
  });

  it("declares --asset-id on the TRON binding instead", () => {
    expect(Object.keys(tokenBalanceTronBinding(svc).fields?.shape ?? {})).toContain("assetId");
    expect(Object.keys(tokenInfoTronBinding(svc).fields?.shape ?? {})).toContain("assetId");
  });

  it("still requires exactly one selector on TRON once the refine moved to the binding", () => {
    const schema = effectiveSchema(tokenBalanceSpec, tokenBalanceTronBinding(svc));
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ contract: TRON_CONTRACT, assetId: "1002000" }).success).toBe(false);
    expect(schema.safeParse({ contract: TRON_CONTRACT }).success).toBe(true);
    expect(schema.safeParse({ assetId: "1002000" }).success).toBe(true);
  });
});

describe("address flags shared across families", () => {
  const cases: Array<[string, ChainSpec, FamilyBinding, Record<string, unknown>]> = [
    ["token balance", tokenBalanceSpec, tokenBalanceTronBinding(svc), {}],
    ["tx send", txSendSpec, txSendTronBinding(svc), { to: TRON_CONTRACT, amount: "1" }],
    ["contract call", contractCallSpec, contractCallTronBinding(svc), { method: "balanceOf()" }],
  ];

  it.each(cases)("%s leaves the base --contract family-neutral", (_name, spec) => {
    const parsed = spec.baseFields.pick({ contract: true }).safeParse({ contract: EVM_CONTRACT });
    expect(parsed.success && parsed.data.contract).toBe(EVM_CONTRACT);
  });

  it.each(cases)(
    "%s rejects a non-TRON --contract on the TRON binding",
    (_n, spec, binding, base) => {
      const result = effectiveSchema(spec, binding).safeParse({ ...base, contract: EVM_CONTRACT });
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain("invalid tron address");
    },
  );

  it.each(cases)("%s accepts a TRON --contract on the TRON binding", (_n, spec, binding, base) => {
    const result = effectiveSchema(spec, binding).safeParse({ ...base, contract: TRON_CONTRACT });
    expect(result.success).toBe(true);
  });
});
