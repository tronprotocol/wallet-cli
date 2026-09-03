/**
 * MessageService — the response contract and the pre-flight capability gate.
 *
 * The service itself is family-agnostic: the family only chooses which SignStrategy hashes the
 * message, so the same binding serves TRON and EVM and the envelope must not vary between them.
 */
import { describe, it, expect, vi } from "vitest";
import { MessageService } from "./message-service.js";
import { WalletError } from "../../domain/errors/index.js";
import type { SignerResolver } from "../services/signer/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";

const scope = { timeoutMs: 1000, emit: () => {} } as unknown as TransactionScope;

function resolverStub(overrides: Partial<Record<"assertCanSign" | "resolve", unknown>> = {}) {
  return {
    assertCanSign: vi.fn(),
    resolve: vi.fn(() => ({
      kind: "software" as const,
      address: "0xabc",
      signMessage: async () => "0xsig",
    })),
    ...overrides,
  } as unknown as SignerResolver & { assertCanSign: ReturnType<typeof vi.fn> };
}

describe("MessageService.sign", () => {
  it("returns address, message and signature", async () => {
    const out = await new MessageService(resolverStub()).sign(scope, "evm", "acct", "hello");
    expect(out).toEqual({ address: "0xabc", message: "hello", signature: "0xsig" });
  });

  it("returns the same field set for either family", async () => {
    const service = new MessageService(resolverStub());
    const tron = await service.sign(scope, "tron", "acct", "hello");
    const evm = await service.sign(scope, "evm", "acct", "hello");
    expect(Object.keys(evm)).toEqual(Object.keys(tron));
  });

  it("refuses a watch-only account before resolving a signer", async () => {
    // The gate belongs ahead of the keystore work, as it already is in TypedDataService: a
    // "cannot sign" failure must win over anything the resolve path might report first.
    const signers = resolverStub({
      assertCanSign: vi.fn(() => {
        throw new WalletError("watch_only_no_signer", "watch-only account cannot sign");
      }),
    });
    await expect(
      new MessageService(signers).sign(scope, "evm", "acct", "hi"),
    ).rejects.toMatchObject({ code: "watch_only_no_signer" });
    expect(signers.resolve).not.toHaveBeenCalled();
  });
});
