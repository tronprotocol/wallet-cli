import { describe, it, expect, vi } from "vitest";
import { createPayerSigner } from "./payer-signer.js";
import type { SignerResolver } from "../signer/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { Signer, TypedDataPayload } from "../../../domain/types/index.js";
import { WalletError } from "../../../domain/errors/index.js";

const PAYLOAD: TypedDataPayload = {
  domain: { name: "x402" },
  types: { Transfer: [{ name: "from", type: "address" }] },
  primaryType: "Transfer",
  message: { from: "0xabc" },
};

const scope = (): TransactionScope & { emitted: unknown[] } => ({
  activeAccount: "wlt_k",
  timeoutMs: 50,
  wait: false,
  waitTimeoutMs: 50,
  emitted: [] as unknown[],
  emit(e: unknown) {
    (this.emitted as unknown[]).push(e);
  },
  warn() {},
  resolveAddress: () => "0xdead",
});

const resolverOf = (signer: Signer, assertCanSign = vi.fn()) => {
  const resolve = vi.fn(() => signer);
  return { assertCanSign, resolve } as unknown as SignerResolver;
};

describe("createPayerSigner", () => {
  it("refuses a watch-only account before resolving a signer", () => {
    const assertCanSign = vi.fn(() => {
      throw new WalletError("watch_only_no_signer", "watch-only account cannot sign");
    });
    const resolve = vi.fn();
    const signers = { assertCanSign, resolve } as unknown as SignerResolver;
    expect(() => createPayerSigner(signers, scope(), "evm")).toThrow(
      expect.objectContaining({ code: "watch_only_no_signer" }),
    );
    expect(resolve).not.toHaveBeenCalled();
  });

  it("exposes the resolved signer's address", () => {
    const signer = { kind: "software", address: "0xdead" } as unknown as Signer;
    expect(createPayerSigner(resolverOf(signer), scope(), "evm").address).toBe("0xdead");
  });

  // Finding 8: `resolverOf` used to ignore its arguments entirely, so all six tests stayed green
  // even if `payer-signer.ts` transposed the two arguments to `assertCanSign`/`resolve`.
  it("calls assertCanSign and resolve with the active account and family, in that order", () => {
    const signer = { kind: "software", address: "0xdead" } as unknown as Signer;
    const assertCanSign = vi.fn();
    const signers = resolverOf(signer, assertCanSign);
    createPayerSigner(signers, scope(), "evm");
    expect(assertCanSign).toHaveBeenCalledWith("wlt_k", "evm");
    expect(signers.resolve).toHaveBeenCalledWith("wlt_k", "evm");
    const resolveOrder = (signers.resolve as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(assertCanSign.mock.invocationCallOrder[0]).toBeLessThan(resolveOrder as number);
  });

  it("passes a software signature straight through with no device event", async () => {
    const signTypedData = vi.fn(async () => ({
      signature: "0xsig",
      digest: "0xdig",
      primaryType: "Transfer",
    }));
    const signer = { kind: "software", address: "0xdead", signTypedData } as unknown as Signer;
    const s = scope();
    const out = await createPayerSigner(resolverOf(signer), s, "evm").signTypedData(PAYLOAD);
    expect(out.signature).toBe("0xsig");
    expect(signTypedData).toHaveBeenCalledWith(PAYLOAD, {});
    expect(s.emitted).toEqual([]);
  });

  it("runs the device ceremony for a device signer", async () => {
    const precheck = vi.fn(async () => {});
    const signer = {
      kind: "device",
      address: "0xdead",
      precheck,
      signTypedData: async () => ({ signature: "0xsig", digest: "0xdig", primaryType: "Transfer" }),
    } as unknown as Signer;
    const s = scope();
    await createPayerSigner(resolverOf(signer), s, "evm").signTypedData(PAYLOAD);
    expect(precheck).toHaveBeenCalledOnce();
    expect(s.emitted).toEqual([{ type: "awaiting_device", reason: "sign" }]);
  });

  // The TRON allowanceMode "auto" path may sign an approve transaction before the payment
  // itself; each signature must get its own precheck and its own prompt.
  it("runs one ceremony per signature", async () => {
    const precheck = vi.fn(async () => {});
    const signer = {
      kind: "device",
      address: "0xdead",
      precheck,
      sign: async () => ({ raw: "0xraw", hash: "0xhash" }),
      signTypedData: async () => ({ signature: "0xsig", digest: "0xdig", primaryType: "Transfer" }),
    } as unknown as Signer;
    const s = scope();
    const payer = createPayerSigner(resolverOf(signer), s, "evm");
    await payer.signTransaction({ to: "0xdead" });
    await payer.signTypedData(PAYLOAD);
    expect(precheck).toHaveBeenCalledTimes(2);
    expect(s.emitted).toHaveLength(2);
  });

  it("returns what the signer returned for a transaction", async () => {
    const sign = vi.fn(async () => ({ raw: "0xraw", hash: "0xhash" }));
    const signer = { kind: "software", address: "0xdead", sign } as unknown as Signer;
    const tx = { to: "0xdead" };
    const out = await createPayerSigner(resolverOf(signer), scope(), "evm").signTransaction(tx);
    expect(sign).toHaveBeenCalledWith(tx, {});
    expect(out).toEqual({ raw: "0xraw", hash: "0xhash" });
  });
});
