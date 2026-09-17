import { expect, it, vi } from "vitest";
import { registerConfigCommands } from "./config.js";
import { CommandRegistry } from "../registry/index.js";
import type { ConfigService } from "../../../../application/use-cases/config-service.js";
function fixture(hasKey = true) {
  const execute = vi.fn(() => ({ value: "********" }));
  const registry = new CommandRegistry();
  registerConfigCommands(registry, { execute } as unknown as ConfigService);
  const ctx = {
    secrets: { has: () => hasKey, require: () => "new-secret" },
    config: {},
    networkRegistry: {},
  };
  return { command: registry.resolveNeutral(["config"])!, ctx, execute };
}
it("saves the key without a wallet, network, unlock or binding dependency", async () => {
  const { command, ctx, execute } = fixture();
  await command.run(ctx as never, undefined, { key: "baiApiKey" });
  expect(execute).toHaveBeenCalledWith(
    { key: "baiApiKey", value: "new-secret" },
    ctx.config,
    ctx.networkRegistry,
  );
});
it("reads the key without modifying it", async () => {
  const { command, ctx, execute } = fixture(false);
  await command.run(ctx as never, undefined, { key: "baiApiKey" });
  expect(execute).toHaveBeenCalledWith({ key: "baiApiKey" }, ctx.config, ctx.networkRegistry);
});
it("still rejects API keys supplied as positional arguments", async () => {
  const { command, ctx, execute } = fixture(false);
  await expect(
    command.run(ctx as never, undefined, { key: "baiApiKey", value: "secret" }),
  ).rejects.toMatchObject({ code: "invalid_option" });
  expect(execute).not.toHaveBeenCalled();
});
