import { describe, it, expect, vi } from "vitest";
import { registerWalletCommands } from "./wallet.js";
import { CommandRegistry } from "../registry/index.js";
import type { ExecutionContext } from "../contracts/index.js";
import type { WalletService } from "../../../../application/use-cases/wallet-service.js";

const OLD = "OldPw1!aa";
const NEW = "NewPw2@bb";

// This harness bypasses dispatch, which enforces TTY-only secret input.
function setup(opts: { newPrompt?: string; confirm?: boolean } = {}) {
  const changePassword = vi.fn(() => ({ wallets: ["seed", "hot"], count: 2 }));
  const wallets = {
    changePassword,
    list: () => [
      { accountId: "wlt_seed.0", type: "seed" },
      { accountId: "wlt_hot", type: "privateKey" },
    ],
  } as unknown as WalletService;
  const secrets = { read: (kind: string) => (kind === "password" ? OLD : undefined) };
  const prompt = {
    isTTY: () => true,
    hidden: vi.fn(async () => opts.newPrompt ?? NEW),
    confirm: vi.fn(async () => opts.confirm ?? true),
  };
  const ctx = { secrets, prompt } as unknown as ExecutionContext;
  const registry = new CommandRegistry();
  registerWalletCommands(registry, { walletService: wallets });
  const command = registry.resolveNeutral(["change-password"]!);
  if (!command) throw new Error("change-password command not registered");
  return { command, ctx, changePassword, prompt };
}

describe("change-password command (TTY-only)", () => {
  it("prompts for the new password and returns the changePassword receipt", async () => {
    const { command, ctx, changePassword } = setup();
    await expect(command.run(ctx, undefined, { yes: true })).resolves.toEqual({
      wallets: ["seed", "hot"],
      count: 2,
    });
    expect(changePassword).toHaveBeenCalledWith(OLD, NEW);
  });

  it("rejects a new password equal to the old password", async () => {
    const { command, ctx } = setup({ newPrompt: OLD });
    await expect(command.run(ctx, undefined, { yes: true })).rejects.toMatchObject({
      code: "invalid_value",
    });
  });

  it("returns aborted when the confirmation is declined", async () => {
    const { command, ctx } = setup({ confirm: false });
    await expect(command.run(ctx, undefined, { yes: false })).rejects.toMatchObject({
      code: "aborted",
    });
  });

  it("skips the confirmation prompt with --yes", async () => {
    const { command, ctx, prompt } = setup();
    await command.run(ctx, undefined, { yes: true });
    expect(prompt.confirm).not.toHaveBeenCalled();
  });
});
