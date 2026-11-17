import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { composeCliRuntime } from "./composition.js";
import { CapabilityRegistry } from "../application/services/capability/index.js";
import { CommandRegistry } from "../adapters/inbound/cli/registry/index.js";
import { buildCatalog } from "../adapters/inbound/cli/help/catalog.js";
import type { NetworkDescriptor } from "../domain/types/index.js";

// Every builtin network × capability: the shell gate follows the predicate.

let previousHome: string | undefined;

beforeAll(() => {
  previousHome = process.env.WALLET_CLI_HOME;
  process.env.WALLET_CLI_HOME = mkdtempSync(join(tmpdir(), "wallet-cli-capability-"));
});

afterAll(() => {
  if (previousHome === undefined) delete process.env.WALLET_CLI_HOME;
  else process.env.WALLET_CLI_HOME = previousHome;
});

function matrix() {
  const runtime = composeCliRuntime({
    globals: { output: "json", verbose: false },
    secretPaths: {},
    startedAt: Date.now(),
    monotonicStart: performance.now(),
  });
  const families = runtime.registry.capabilityKeysByFamily();
  const keys = [
    ...new Set([...families.values()].flat().concat(runtime.registry.neutralCapabilityKeys())),
  ];
  const networks = Object.values(runtime.config.networks);
  const rows = networks.flatMap((network) =>
    keys
      .filter(
        (key) =>
          (families.get(network.family) ?? []).includes(key) ||
          runtime.registry.neutralCapabilityKeys().includes(key),
      )
      .map((key) => ({ network, key })),
  );
  return { caps: runtime.capabilities, rows };
}

function outcome(run: () => void): string {
  try {
    run();
    return "pass";
  } catch (error) {
    return (error as { code?: string }).code ?? "error";
  }
}

describe("capability predicate and execution gates agree on every builtin network", () => {
  it("covers every builtin network", () => {
    const { rows } = matrix();
    expect(new Set(rows.map((r) => r.network.id)).size).toBe(9);
  });

  it("supported and unsupported", () => {
    const { caps, rows } = matrix();
    for (const { network, key } of rows) {
      const supported = caps.supports(network.id, key);
      const gate = outcome(() => caps.check({ capability: key, path: ["x"] }, network));
      const label = `${key} on ${network.id}`;
      if (supported) {
        expect(gate, label).toBe("pass");
      } else {
        expect(gate, label).toBe("unsupported_network_capability");
      }
    }
  });
});

describe("a capability that needs inputs on a network", () => {
  const NILE = "tron:3448148188";
  const nile = { id: NILE, family: "tron", capabilities: [] } as unknown as NetworkDescriptor;

  function fixture() {
    const caps = new CapabilityRegistry();
    caps.addPredicates({ "demo.inputs": () => "needs-inputs" });
    caps.register(nile, ["demo.inputs"]);
    return caps;
  }

  it("is supported and passes the execution gate", () => {
    const caps = fixture();
    expect(caps.supports(NILE, "demo.inputs")).toBe(true);
    expect(() =>
      caps.check({ capability: "demo.inputs", path: ["demo", "read"] }, nile),
    ).not.toThrow();
  });

  it("is listed as needs-inputs in the catalog", () => {
    const registry = new CommandRegistry();
    registry.addChain(
      {
        path: ["demo", "read"],
        network: "optional",
        wallet: "none",
        auth: "none",
        capability: "demo.inputs",
        examples: [],
        baseFields: z.object({}),
      },
      "tron",
      { run: async () => ({}) },
    );
    const catalog = JSON.parse(buildCatalog(registry, "0.0.0", undefined, fixture())) as {
      commands: { id: string; support?: Record<string, string> }[];
    };
    expect(catalog.commands.find((c) => c.id === "demo.read")?.support).toEqual({
      [NILE]: "needs-inputs",
    });
  });
});
