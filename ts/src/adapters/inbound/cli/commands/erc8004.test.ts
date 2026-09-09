import { describe, expect, it } from "vitest";
import { CommandRegistry } from "../registry/index.js";
import {
  registerEvmChainCommands,
  type EvmChainCommandDependencies,
} from "../../../../bootstrap/families/evm.js";
import {
  registerTronChainCommands,
  type TronChainCommandDependencies,
} from "../../../../bootstrap/families/tron.js";
function registerAgentCommands(registry: CommandRegistry, agents: AgentService) {
  registerEvmChainCommands(registry, { agents } as EvmChainCommandDependencies);
  registerTronChainCommands(registry, { agents } as TronChainCommandDependencies);
}
import type { AgentService } from "../../../../application/use-cases/agent-service.js";

describe("ERC-8004 command surface", () => {
  it("registers exactly eight commands for EVM and TRON", () => {
    const registry = new CommandRegistry();
    registerAgentCommands(registry, {} as AgentService);
    const verbs = [
      "show",
      "register",
      "update",
      "transfer",
      "approve",
      "operator-add",
      "operator-remove",
      "operator-check",
    ];
    for (const verb of verbs) {
      const command = registry.resolveChain(["8004", verb]);
      expect(command?.spec.path).toEqual(["8004", verb]);
      expect(Object.keys(command?.families ?? {}).sort()).toEqual(["evm", "tron"]);
    }
    expect(
      registry.all().filter((command) => "spec" in command && command.spec.path[0] === "8004"),
    ).toHaveLength(8);
  });

  it("register takes only the externally-built URI plus transaction controls", () => {
    const registry = new CommandRegistry();
    registerAgentCommands(registry, {} as AgentService);
    const spec = registry.resolveChain(["8004", "register"])!.spec;
    expect(spec.positionals).toEqual([{ field: "uri" }]);
    expect(Object.keys(spec.baseFields.shape)).toEqual(["uri", "dryRun", "signOnly", "buildOnly"]);
  });
});

it("accepts a data JSON registration URI and rejects local file schemes", () => {
  const registry = new CommandRegistry();
  registerAgentCommands(registry, {} as AgentService);
  const schema = registry.resolveChain(["8004", "register"])!.spec.baseFields;
  expect(schema.safeParse({ uri: "data:application/json;base64,eyJuYW1lIjoiQSJ9" }).success).toBe(
    true,
  );
  expect(schema.safeParse({ uri: "file:///etc/passwd" }).success).toBe(false);
  expect(schema.safeParse({ uri: "https://user:password@example.com/agent.json" }).success).toBe(
    false,
  );
});
