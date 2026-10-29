import type { AgentService } from "../../application/use-cases/agent-service.js";
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerEvmChainCommands } from "./evm.js";
import { main } from "../runner.js";
import { CommandRegistry } from "../../adapters/inbound/cli/registry/index.js";
import type { SignerResolver } from "../../application/services/signer/index.js";
import type { ChainGatewayProvider } from "../../application/ports/chain/gateway-provider.js";
import type { AccountBalanceService } from "../../application/use-cases/account-balance-service.js";
import type { TokenBookService } from "../../application/use-cases/token-book-service.js";
import type { TokenRepository } from "../../application/ports/token-repository.js";
import type { PriceProvider } from "../../application/ports/price-provider.js";
import type { TxPipeline } from "../../application/services/pipeline/index.js";
import type { RecipientResolver } from "../../application/services/recipient-resolver.js";
import type { SigningService } from "../../application/services/signing/signing-service.js";

function registry(): CommandRegistry {
  const reg = new CommandRegistry();
  registerEvmChainCommands(reg, {
    agents: {} as AgentService,
    signers: {} as SignerResolver,
    signing: {} as SigningService,
    gateways: {} as ChainGatewayProvider,
    balances: {} as AccountBalanceService,
    tokens: {} as TokenRepository,
    prices: {} as PriceProvider,
    tokenBook: {} as TokenBookService,
    transactions: {} as TxPipeline,
    recipients: {} as RecipientResolver,
  });
  return reg;
}

describe("registerEvmChainCommands", () => {
  it("owns all 29 EVM bindings including identity commands", () => {
    const commands = registry().all();
    expect(
      commands.filter((command) => "families" in command && command.families.evm),
    ).toHaveLength(29);
  });
  it("binds message sign and typed-data sign to the evm family", () => {
    const reg = registry();
    expect(reg.resolveChain(["message", "sign"])?.families.evm).toBeDefined();
    expect(reg.resolveChain(["typed-data", "sign"])?.families.evm).toBeDefined();
  });

  it("binds the read commands to the evm family", () => {
    const reg = registry();
    for (const path of [
      ["account", "balance"],
      ["account", "info"],
      ["account", "portfolio"],
      ["block"],
      ["chain", "node"],
      ["chain", "prices"],
      ["token", "balance"],
      ["token", "info"],
      ["token", "add"],
      ["token", "list"],
      ["token", "remove"],
      ["contract", "call"],
      ["contract", "send"],
      ["contract", "deploy"],
      ["tx", "send"],
      ["tx", "sign"],
      ["tx", "broadcast"],
      ["tx", "status"],
      ["tx", "info"],
    ]) {
      expect(reg.resolveChain(path)?.families.evm, path.join(" ")).toBeDefined();
    }
  });

  it("reports the signing capabilities under evm", () => {
    expect(registry().capabilityKeysByFamily().get("evm")).toEqual(
      expect.arrayContaining(["message.sign", "typedData.sign"]),
    );
  });

  it("declares no evm-only flags on the signing commands", () => {
    const reg = registry();
    expect(reg.resolveChain(["message", "sign"])?.families.evm?.fields).toBeUndefined();
    expect(reg.resolveChain(["typed-data", "sign"])?.families.evm?.fields).toBeUndefined();
  });
});

describe("EVM commands reach the assembled CLI", () => {
  async function catalog() {
    const previous = process.env.WALLET_CLI_HOME;
    process.env.WALLET_CLI_HOME = mkdtempSync(join(tmpdir(), "wcli-evm-catalog-"));
    const chunks: string[] = [];
    const out = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      chunks.push(String(chunk));
      return true;
    });
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      await main(["node", "wallet-cli", "--json-schema"]);
      return JSON.parse(chunks.join("")) as {
        commands: Array<{ id: string; families?: string[] }>;
      };
    } finally {
      out.mockRestore();
      err.mockRestore();
      if (previous === undefined) delete process.env.WALLET_CLI_HOME;
      else process.env.WALLET_CLI_HOME = previous;
    }
  }

  it("advertises the signing commands under both families", async () => {
    const byId = new Map((await catalog()).commands.map((c) => [c.id, c.families ?? []]));
    for (const id of [
      "message.sign",
      "typed-data.sign",
      "account.balance",
      "account.info",
      "account.portfolio",
      "block",
      "chain.node",
      "chain.prices",
      "token.balance",
      "token.info",
      "token.add",
      "token.list",
      "token.remove",
      "contract.call",
      "contract.send",
      "contract.deploy",
      "tx.send",
      "tx.sign",
      "tx.broadcast",
      "tx.status",
      "tx.info",
    ]) {
      expect(byId.get(id), id).toEqual(expect.arrayContaining(["tron", "evm"]));
    }
  });
});
