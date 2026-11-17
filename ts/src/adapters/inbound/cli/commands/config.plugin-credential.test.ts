import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerConfigCommands } from "./config.js";
import { CommandRegistry } from "../registry/index.js";
import { ConfigService } from "../../../../application/use-cases/config-service.js";
import { ConfigLoader, NetworkRegistry } from "../../../outbound/config/index.js";
import { YamlConfigDocument } from "../../../outbound/config/yaml-config-document.js";
import { AtomicFileStore } from "../../../outbound/persistence/fs/index.js";
import type { PluginCredentialManifest } from "../../../../domain/plugins/index.js";

const QAPROBE: PluginCredentialManifest = { key: "qaprobeApiKey", summary: "QA probe API key" };
const VALUE = "fictional-qaprobe-key-0001";

// The config command over a real home; `declared` stands for the plugins present.
function setup(declared: readonly PluginCredentialManifest[], yaml?: string) {
  const home = mkdtempSync(join(tmpdir(), "wcli-plugin-credential-"));
  const env = { ...process.env, WALLET_CLI_HOME: home };
  const path = ConfigLoader.configPath(env);
  if (yaml !== undefined) writeFileSync(path, yaml, { mode: 0o600 });
  const run = (input: { key?: string; value?: string }, stdin?: string) => {
    const config = ConfigLoader.load(
      env,
      declared.map((c) => c.key),
    );
    const registry = new CommandRegistry();
    const service = new ConfigService(
      new YamlConfigDocument(path, new AtomicFileStore()),
      declared,
    );
    registerConfigCommands(registry, service);
    const ctx = {
      secrets: { has: () => stdin !== undefined, require: () => stdin },
      config,
      networkRegistry: new NetworkRegistry(config),
    };
    const command = registry.resolveNeutral(["config"])!;
    return { result: command.run(ctx as never, undefined, input), command };
  };
  return { path, run };
}

describe("config with a plugin that declares a credential key", () => {
  it("writes the key from stdin only, with mode 0600, and masks it everywhere", async () => {
    const { path, run } = setup([QAPROBE]);
    const written = await run({ key: "qaprobeApiKey" }, VALUE).result;
    expect(written).toEqual({ key: "qaprobeApiKey", value: "********", input: "********" });
    expect(readFileSync(path, "utf8")).toContain(`qaprobeApiKey: ${VALUE}`);
    if (process.platform !== "win32") expect(statSync(path).mode & 0o777).toBe(0o600);

    expect(await run({ key: "qaprobeApiKey" }).result).toEqual({
      key: "qaprobeApiKey",
      value: "********",
    });
    const listing = (await run({}).result) as Record<string, unknown>;
    expect(listing.qaprobeApiKey).toBe("********");
    expect(JSON.stringify(listing)).not.toContain(VALUE);
  });

  it("refuses the value on the command line", async () => {
    const { path, run } = setup([QAPROBE]);
    await expect(run({ key: "qaprobeApiKey", value: VALUE }).result).rejects.toMatchObject({
      code: "invalid_option",
    });
    expect(() => readFileSync(path)).toThrow();
  });

  it("lists the key with its summary in the help", () => {
    const { command } = setup([QAPROBE]).run({});
    expect(command.description).toContain("qaprobeApiKey: QA probe API key");
  });
});

describe("config without a plugin that declares the key", () => {
  it("fails as an unknown key on read and on write, and writes nothing", async () => {
    const { path, run } = setup([]);
    await expect(run({ key: "qaprobeApiKey" }, VALUE).result).rejects.toMatchObject({
      code: "invalid_value",
      message: "unknown config key: qaprobeApiKey",
    });
    await expect(run({ key: "qaprobeApiKey" }).result).rejects.toMatchObject({
      code: "invalid_value",
    });
    expect(() => readFileSync(path)).toThrow();
  });

  it("does not list the key and keeps a value left in the file through other writes", async () => {
    const { path, run } = setup([], `qaprobeApiKey: ${VALUE}\n`);
    const listing = (await run({}).result) as Record<string, unknown>;
    expect(listing).not.toHaveProperty("qaprobeApiKey");
    await run({ key: "timeoutMs", value: "5000" }).result;
    expect(readFileSync(path, "utf8")).toContain(`qaprobeApiKey: ${VALUE}`);
  });
});
