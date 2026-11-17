import { expect, it, vi } from "vitest";
import { registerConfigCommands } from "./config.js";
import { CommandRegistry } from "../registry/index.js";
import { ConfigService } from "../../../../application/use-cases/config-service.js";
import { BUILTIN_CREDENTIALS } from "../../../../bootstrap/plugins/__test-support__/credentials.js";
function fixture(hasKey = true) {
  const execute = vi.fn(() => ({ value: "********" }));
  const registry = new CommandRegistry();
  const service = Object.assign(new ConfigService({} as never, BUILTIN_CREDENTIALS), { execute });
  registerConfigCommands(registry, service);
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
