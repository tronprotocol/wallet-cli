import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { composeCliRuntime } from "./composition.js";
import type { NetworkDescriptor } from "../domain/types/index.js";
import { SdkAgentRegistry } from "../adapters/outbound/erc8004/sdk-registry.js";
import { X402FacilitatorClient } from "../adapters/outbound/x402/facilitator-client.js";
import { paywallTerms } from "../application/use-cases/x402-paywall.js";
import { sunpumpApiBaseUrl } from "../adapters/outbound/sunpump/api-transport.js";
import { SunPumpLaunchpadContracts } from "../adapters/outbound/sunpump/launchpad-contracts.js";
import { requireBaiChain } from "../application/use-cases/bai-wallet-binding.js";

// Every builtin network × capability: the shell gate follows the predicate, and an adapter gate never refuses
// a network the predicate supports.

const PAY_TO = { tron: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb", evm: `0x${"0".repeat(39)}1` };
const ASSET = { tron: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", evm: `0x${"0".repeat(39)}2` };

type Probe = (network: NetworkDescriptor, explicitInputs: boolean) => void;

// Execution checks past the shell that can refuse a network without any I/O.
const ADAPTER_GATES: Record<string, Probe> = {
  "erc8004.identity.read": (n) => new SdkAgentRegistry({} as never, {} as never).registry(n),
  "erc8004.identity.write": (n) => new SdkAgentRegistry({} as never, {} as never).registry(n),
  "bai.recharge": (n) => requireBaiChain(n),
  "sunpump.market": (n) => sunpumpApiBaseUrl(n),
  "sunpump.launch": (n) => sunpumpApiBaseUrl(n),
  "sunpump.curve": (n) => new SunPumpLaunchpadContracts({} as never).launchpadAddress(n),
  "x402.serve": (n, explicit) => {
    paywallTerms(
      n,
      {
        payTo: PAY_TO[n.family],
        scheme: "exact",
        host: "127.0.0.1",
        port: 4020,
        facilitatorUrl: "https://facilitator.example",
        ...(explicit ? { asset: ASSET[n.family], decimals: 6 } : {}),
      },
      new X402FacilitatorClient(),
    );
  },
};

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
  it("covers every builtin network and the conditional capabilities", () => {
    const { rows } = matrix();
    expect(new Set(rows.map((r) => r.network.id)).size).toBe(9);
    for (const key of Object.keys(ADAPTER_GATES))
      expect(
        rows.some((r) => r.key === key),
        key,
      ).toBe(true);
  });

  it("supported and unsupported", () => {
    const { caps, rows } = matrix();
    for (const { network, key } of rows) {
      const supported = caps.supports(network.id, key);
      const gate = outcome(() => caps.check({ capability: key, path: ["x"] }, network));
      const adapter = ADAPTER_GATES[key] ? outcome(() => ADAPTER_GATES[key]!(network, true)) : gate;
      const label = `${key} on ${network.id}`;
      if (supported) {
        expect(gate, label).toBe("pass");
        expect(adapter, label).toBe("pass");
      } else {
        expect(gate, label).toBe("unsupported_network_capability");
      }
    }
  });

  it("needs-inputs: passes the gate, and the adapter needs the explicit inputs", () => {
    const { caps, rows } = matrix();
    const conditional = rows.filter((r) => caps.support(r.network.id, r.key) === "needs-inputs");
    expect(conditional.length).toBeGreaterThan(0);
    for (const { network, key } of conditional) {
      const label = `${key} on ${network.id}`;
      expect(
        outcome(() => caps.check({ capability: key, path: ["x"] }, network)),
        label,
      ).toBe("pass");
      expect(
        outcome(() => ADAPTER_GATES[key]!(network, false)),
        label,
      ).not.toBe("pass");
      expect(
        outcome(() => ADAPTER_GATES[key]!(network, true)),
        label,
      ).toBe("pass");
    }
    for (const { network, key } of rows.filter(
      (r) => caps.support(r.network.id, r.key) === "supported",
    )) {
      if (ADAPTER_GATES[key])
        expect(
          outcome(() => ADAPTER_GATES[key]!(network, false)),
          `${key} on ${network.id}`,
        ).toBe("pass");
    }
  });
});
