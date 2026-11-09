import { describe, it, expect } from "vitest";
import { accountActivateSpec, accountSetSpec } from "./account.js";
import { permissionUpdateSpec } from "./permission.js";

describe("help for the irreversible commands says so", () => {
  it("account set warns the field can never be changed, and is not a local rename", () => {
    const text = accountSetSpec.description ?? "";
    expect(text).toMatch(/only once|never be changed/i);
    expect(text).toMatch(/--dry-run/);
    expect(text).toMatch(/rename/);
  });

  it("account activate points out that a plain transfer already activates the target", () => {
    const text = accountActivateSpec.description ?? "";
    expect(text).toMatch(/transfer/i);
    expect(text).toMatch(/only when/i);
  });

  it("permission update says where the input shape comes from", () => {
    expect(permissionUpdateSpec.description ?? "").toMatch(/permission show/);
  });

  it("permission update says the lockout warning does not stop the submission", () => {
    const text = permissionUpdateSpec.description ?? "";
    expect(text).toMatch(/warns/i);
    expect(text).toMatch(/does not (block|stop)/i);
    expect(text).toMatch(/no confirmation prompt/i);
  });
});
