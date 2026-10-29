import { describe, it, expect, vi } from "vitest";
import { MessageService } from "./message-service.js";
import { WalletError } from "../../domain/errors/index.js";
import type { SignerResolver } from "../services/signer/index.js";
import type { TransactionScope } from "../contracts/execution-scope.js";
import { SigningService } from "../services/signing/signing-service.js";

const TRON = { id: "tron:3448148188", family: "tron", chainId: "3448148188" } as never;
const EVM = { id: "eip155:1", family: "evm", chainId: "1" } as never;
const signing = new SigningService({} as never);

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
    const out = await new MessageService(resolverStub(), signing).sign(scope, EVM, "acct", "hello");
    expect(out).toEqual({ address: "0xabc", message: "hello", signature: "0xsig" });
  });

  it("returns the same field set for either family", async () => {
    const service = new MessageService(resolverStub(), signing);
    const tron = await service.sign(scope, TRON, "acct", "hello");
    const evm = await service.sign(scope, EVM, "acct", "hello");
    expect(Object.keys(evm)).toEqual(Object.keys(tron));
  });

  it("refuses a watch-only account before resolving a signer", async () => {
    const signers = resolverStub({
      assertCanSign: vi.fn(() => {
        throw new WalletError("watch_only_no_signer", "watch-only account cannot sign");
      }),
    });
    await expect(
      new MessageService(signers, signing).sign(scope, EVM, "acct", "hi"),
    ).rejects.toMatchObject({ code: "watch_only_no_signer" });
    expect(signers.resolve).not.toHaveBeenCalled();
  });
});
