import { describe, it, expect } from "vitest";
import { accountActivateSpec, accountSetSpec } from "./account.js";
import { permissionUpdateSpec } from "./permission.js";

// Both commands are one-way doors, and neither help text said so. `account set` is rejected with
// name_already_set / id_already_set on a second attempt (account-service.ts), and `permission
// update` only warns about a lockout — permissionSafetyWarnings goes to scope.warn and execution
// continues, with no confirmation prompt anywhere. A reader has to learn that before running, not
// from the error afterwards.
describe("help for the irreversible commands says so", () => {
  it("account set warns the field can never be changed, and is not a local rename", () => {
    const text = accountSetSpec.description ?? "";
    expect(text).toMatch(/only once|never be changed/i);
    expect(text).toMatch(/--dry-run/);
    // `rename` changes the local label and is the command people actually mean most of the time
    expect(text).toMatch(/rename/);
  });

  // Activation is a paid transaction, and a plain transfer to an unactivated address already
  // activates it. Someone who is going to send funds anyway does not need this command at all —
  // without the hint they pay for two transactions where one would do.
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
