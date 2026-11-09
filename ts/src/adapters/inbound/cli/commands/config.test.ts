import { expect, it, vi } from "vitest";
import { registerConfigCommands } from "./config.js";
import { CommandRegistry } from "../registry/index.js";
import type { ConfigService } from "../../../../application/use-cases/config-service.js";

function fixture(hasKey: boolean) {
  const execute = vi.fn(() => ({ value: "********" }));
  const registry = new CommandRegistry();
  registerConfigCommands(registry, { execute } as unknown as ConfigService);
  const ctx = {
    secrets: { has: () => hasKey, require: () => "fake-credential" },
    config: {},
    networkRegistry: {},
  };
  return { command: registry.resolveNeutral(["config"])!, ctx, execute };
}

const CREDENTIAL_KEYS = [
  "tronlinkSecretId",
  "tronlinkSecretKey",
  "gasfreeApiKey",
  "gasfreeApiSecret",
  "baiApiKey",
  "networks.nile.apiKey",
];

it.each(CREDENTIAL_KEYS)("rejects a %s value given on the command line", async (key) => {
  const { command, ctx, execute } = fixture(false);
  await expect(
    command.run(ctx as never, undefined, { key, value: "fake-credential" }),
  ).rejects.toMatchObject({ code: "invalid_option" });
  expect(execute).not.toHaveBeenCalled();
});

it.each(CREDENTIAL_KEYS)("sets %s from --api-key-stdin", async (key) => {
  const { command, ctx, execute } = fixture(true);
  await command.run(ctx as never, undefined, { key });
  expect(execute).toHaveBeenCalledWith(
    { key, value: "fake-credential" },
    ctx.config,
    ctx.networkRegistry,
  );
});

it.each(["tronlinkChannel", "timeoutMs", "networks.nile.httpEndpoint", undefined])(
  "refuses --api-key-stdin for the non-credential key %s",
  async (key) => {
    const { command, ctx, execute } = fixture(true);
    await expect(command.run(ctx as never, undefined, { key })).rejects.toMatchObject({
      code: "invalid_option",
    });
    expect(execute).not.toHaveBeenCalled();
  },
);

it("still accepts a non-credential value on the command line", async () => {
  const { command, ctx, execute } = fixture(false);
  await command.run(ctx as never, undefined, { key: "tronlinkChannel", value: "wallet-cli" });
  expect(execute).toHaveBeenCalledWith(
    { key: "tronlinkChannel", value: "wallet-cli" },
    ctx.config,
    ctx.networkRegistry,
  );
});
