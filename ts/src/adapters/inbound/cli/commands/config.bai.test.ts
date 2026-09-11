import { expect, it, vi } from "vitest";
import { registerConfigCommands } from "./config.js";
import { CommandRegistry } from "../registry/index.js";
import type { ConfigService } from "../../../../application/use-cases/config-service.js";
function fixture(check = vi.fn(async (_key: string) => {})) {
  const execute = vi.fn(() => ({ value: "********" }));
  const registry = new CommandRegistry();
  registerConfigCommands(registry, { execute } as unknown as ConfigService, { execute: check });
  const ctx = {
    secrets: { has: () => true, require: () => "new-secret" },
    config: {},
    networkRegistry: {},
  };
  return { command: registry.resolveNeutral(["config"])!, ctx, execute, check };
}
it("confirms the candidate key before saving it", async () => {
  const { command, ctx, execute, check } = fixture();
  await command.run(ctx as never, undefined, { key: "baiApiKey" });
  expect(check).toHaveBeenCalledWith("new-secret");
  expect(check.mock.invocationCallOrder[0]).toBeLessThan(execute.mock.invocationCallOrder[0]!);
});
it("does not overwrite the saved key when confirmation fails", async () => {
  const { command, ctx, execute } = fixture(
    vi.fn(async () => {
      throw new Error("not bound");
    }),
  );
  await expect(command.run(ctx as never, undefined, { key: "baiApiKey" })).rejects.toThrow(
    "not bound",
  );
  expect(execute).not.toHaveBeenCalled();
});
it("does not check binding for config reads", async () => {
  const { command, ctx, check } = fixture();
  ctx.secrets.has = () => false;
  await command.run(ctx as never, undefined, { key: "baiApiKey" });
  expect(check).not.toHaveBeenCalled();
});
