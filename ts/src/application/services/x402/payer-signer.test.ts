import { describe, it, expect, vi } from "vitest";
import { createPayerSigner } from "./payer-signer.js";
import type { SignerResolver } from "../signer/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { Signer, TypedDataPayload } from "../../../domain/types/index.js";
import { WalletError } from "../../../domain/errors/index.js";
import { SigningService } from "../signing/signing-service.js";
import type { PayerPolicy } from "./payer-policy.js";

const PAYER = "0x000000000000000000000000000000000000dEaD";

const NETWORK = { id: "eip155:56", family: "evm", chainId: "56" } as never;
const TOKEN = "0x55d398326f99059fF775485246999027B3197955";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const POLICY: PayerPolicy = { family: "evm", approveIntent: { spender: PERMIT2, tokens: [TOKEN] } };
const APPROVE = { token: TOKEN, valueWei: "0", unlimitedApproveSpender: PERMIT2 };

// The EVM gateway reads the chain id a transaction names.
const signingOn = (chainId: string | undefined) =>
  new SigningService({ get: () => ({ transactionChainId: () => chainId }) } as never);

const payerFor = (signers: SignerResolver, s = scope(), signing = signingOn("56")) =>
  createPayerSigner(signers, signing, s, NETWORK, POLICY);

const PAYLOAD: TypedDataPayload = {
  domain: { name: "x402" },
  types: { Transfer: [{ name: "from", type: "address" }] },
  primaryType: "Transfer",
  message: { from: PAYER },
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
  resolveAddress: () => PAYER,
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
    expect(() => payerFor(signers)).toThrow(
      expect.objectContaining({ code: "watch_only_no_signer" }),
    );
    expect(resolve).not.toHaveBeenCalled();
  });

  it("exposes the resolved signer's address", () => {
    const signer = { kind: "software", address: PAYER } as unknown as Signer;
    expect(payerFor(resolverOf(signer)).address).toBe(PAYER);
  });

  it("calls assertCanSign and resolve with the active account and family, in that order", () => {
    const signer = { kind: "software", address: PAYER } as unknown as Signer;
    const assertCanSign = vi.fn();
    const signers = resolverOf(signer, assertCanSign);
    payerFor(signers);
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
    const signer = { kind: "software", address: PAYER, signTypedData } as unknown as Signer;
    const s = scope();
    const out = await payerFor(resolverOf(signer), s).signTypedData(PAYLOAD);
    expect(out.signature).toBe("0xsig");
    expect(signTypedData).toHaveBeenCalledWith(PAYLOAD, {});
    expect(s.emitted).toEqual([]);
  });

  it("runs the device ceremony for a device signer", async () => {
    const precheck = vi.fn(async () => {});
    const signer = {
      kind: "device",
      address: PAYER,
      precheck,
      signTypedData: async () => ({ signature: "0xsig", digest: "0xdig", primaryType: "Transfer" }),
    } as unknown as Signer;
    const s = scope();
    await payerFor(resolverOf(signer), s).signTypedData(PAYLOAD);
    expect(precheck).toHaveBeenCalledOnce();
    expect(s.emitted).toEqual([{ type: "awaiting_device", reason: "sign" }]);
  });

  it("runs one ceremony per signature", async () => {
    const precheck = vi.fn(async () => {});
    const signer = {
      kind: "device",
      address: PAYER,
      precheck,
      sign: async () => ({ raw: "0xraw", hash: "0xhash" }),
      signTypedData: async () => ({ signature: "0xsig", digest: "0xdig", primaryType: "Transfer" }),
    } as unknown as Signer;
    const s = scope();
    const payer = payerFor(resolverOf(signer), s);
    await payer.signTransaction({ to: TOKEN }, APPROVE);
    await payer.signTypedData(PAYLOAD);
    expect(precheck).toHaveBeenCalledTimes(2);
    expect(s.emitted).toHaveLength(2);
  });

  it("returns what the signer returned for a transaction", async () => {
    const sign = vi.fn(async () => ({ raw: "0xraw", hash: "0xhash" }));
    const signer = { kind: "software", address: PAYER, sign } as unknown as Signer;
    const tx = { to: TOKEN };
    const out = await payerFor(resolverOf(signer)).signTransaction(tx, APPROVE);
    expect(sign).toHaveBeenCalledWith(tx, {});
    expect(out).toEqual({ raw: "0xraw", hash: "0xhash" });
  });

  it("refuses SDK typed data for another chain before the signer runs", async () => {
    const signTypedData = vi.fn();
    const signer = { kind: "software", address: PAYER, signTypedData } as unknown as Signer;
    const payload = { ...PAYLOAD, domain: { name: "x402", chainId: 1 } };
    await expect(payerFor(resolverOf(signer)).signTypedData(payload)).rejects.toMatchObject({
      code: "chain_id_mismatch",
    });
    expect(signTypedData).not.toHaveBeenCalled();
  });

  it.each([
    ["another chain", "1"],
    ["no chain", undefined],
  ])("refuses an SDK transaction for %s before the signer runs", async (_label, chainId) => {
    const sign = vi.fn();
    const signer = { kind: "software", address: PAYER, sign } as unknown as Signer;
    const payer = payerFor(resolverOf(signer), scope(), signingOn(chainId));
    await expect(payer.signTransaction({ to: TOKEN }, APPROVE)).rejects.toMatchObject({
      code: "chain_id_mismatch",
    });
    expect(sign).not.toHaveBeenCalled();
  });
});
