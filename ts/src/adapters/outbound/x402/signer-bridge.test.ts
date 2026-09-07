import { describe, it, expect, vi } from "vitest";
import { toX402Wallet } from "./signer-bridge.js";
import type { PayerSigner } from "../../../application/contracts/x402-payer.js";
import type { TypedDataPayload } from "../../../domain/types/index.js";

const EVM_ADDRESS = "0xaB5801a7D398351b8bE11C439e05C5B3259aeC9B";
const TRON_ADDRESS = "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ";
// The same TRON address in the 41-prefixed hex form a counterparty may send instead.
const TRON_HEX = "4119e7e376e7c213b7e7e7e46cc70a5dd086daff2a";

const payerOf = (address: string, signature = "sig", primaryType = "Transfer"): PayerSigner => ({
  address,
  signTypedData: vi.fn(async () => ({ signature, digest: "0xdig", primaryType })),
  signTransaction: vi.fn(async (tx: unknown) => tx),
});

const evmPayload = (from: string): TypedDataPayload => ({
  domain: { name: "x402" },
  types: { Transfer: [{ name: "from", type: "address" }] },
  primaryType: "Transfer",
  message: { from },
});

const permitPayload = (user: string, maxFee: string): TypedDataPayload => ({
  domain: { name: "GasFreeController" },
  types: {
    PermitTransfer: [
      { name: "user", type: "address" },
      { name: "maxFee", type: "uint256" },
    ],
  },
  primaryType: "PermitTransfer",
  message: { user, maxFee },
});

// Same structs as permitPayload/evmPayload but with `primaryType` OMITTED — the shape a well-formed
// single-root payload is allowed to arrive in (see domain/typed-data). The bridge must still resolve
// the root and run every guard against it, not skip the guards because the field is absent.
const permitPayloadNoPrimaryType = (user: string, maxFee: string): TypedDataPayload => ({
  domain: { name: "GasFreeController" },
  types: {
    PermitTransfer: [
      { name: "user", type: "address" },
      { name: "maxFee", type: "uint256" },
    ],
  },
  message: { user, maxFee },
});

const evmPayloadNoPrimaryType = (from: string): TypedDataPayload => ({
  domain: { name: "x402" },
  types: { Transfer: [{ name: "from", type: "address" }] },
  message: { from },
});

describe("toX402Wallet", () => {
  it("reports the payer's address", () => {
    expect(toX402Wallet(payerOf(EVM_ADDRESS), { family: "evm" }).getAddress()).toBe(EVM_ADDRESS);
  });

  // Finding 2: TRON's scheme (createClientTronSigner) calls getAddress(); EVM's (toClientEvmSigner)
  // reads a viem-account-shaped `address` property. Both spellings must carry the same value.
  it("exposes the payer's address under both spellings the two schemes read, for evm", () => {
    const wallet = toX402Wallet(payerOf(EVM_ADDRESS), { family: "evm" });
    expect(wallet.address).toBe(wallet.getAddress());
    expect(wallet.address).toBe(EVM_ADDRESS);
  });

  it("exposes the payer's address under both spellings the two schemes read, for tron", () => {
    const wallet = toX402Wallet(payerOf(TRON_ADDRESS), { family: "tron" });
    expect(wallet.address).toBe(wallet.getAddress());
    expect(wallet.address).toBe(TRON_ADDRESS);
  });

  it("returns a 0x-prefixed signature even when the signer omits the prefix", async () => {
    const wallet = toX402Wallet(payerOf(EVM_ADDRESS, "abcd"), { family: "evm" });
    expect(await wallet.signTypedData(evmPayload(EVM_ADDRESS))).toBe("0xabcd");
  });

  it("keeps a signature that is already prefixed", async () => {
    const wallet = toX402Wallet(payerOf(EVM_ADDRESS, "0xabcd"), { family: "evm" });
    expect(await wallet.signTypedData(evmPayload(EVM_ADDRESS))).toBe("0xabcd");
  });

  it("accepts an EVM payer that differs only in case", async () => {
    const wallet = toX402Wallet(payerOf(EVM_ADDRESS), { family: "evm" });
    await expect(
      wallet.signTypedData(evmPayload(EVM_ADDRESS.toLowerCase())),
    ).resolves.toBeDefined();
  });

  it("refuses to sign for a different EVM payer", async () => {
    const payer = payerOf(EVM_ADDRESS);
    const wallet = toX402Wallet(payer, { family: "evm" });
    await expect(
      wallet.signTypedData(evmPayload("0x2222222222222222222222222222222222222222")),
    ).rejects.toMatchObject({ code: "payer_mismatch" });
    expect(payer.signTypedData).not.toHaveBeenCalled();
  });

  it("accepts a TRON payer given in hex form", async () => {
    const wallet = toX402Wallet(payerOf(TRON_ADDRESS, "sig", "PermitTransfer"), { family: "tron" });
    await expect(wallet.signTypedData(permitPayload(TRON_HEX, "100"))).resolves.toBeDefined();
  });

  it("refuses to sign for a different TRON payer", async () => {
    const wallet = toX402Wallet(payerOf(TRON_ADDRESS, "sig", "PermitTransfer"), { family: "tron" });
    await expect(
      wallet.signTypedData(permitPayload("TBvJUBXorwBPzqvV38vjDgegj5Eh6g2Tsq", "100")),
    ).rejects.toMatchObject({ code: "payer_mismatch" });
  });

  it("signs a PermitTransfer whose fee is within the ceiling", async () => {
    const wallet = toX402Wallet(payerOf(TRON_ADDRESS, "sig", "PermitTransfer"), {
      family: "tron",
      maxGasfreeFeeRaw: "100",
    });
    await expect(wallet.signTypedData(permitPayload(TRON_ADDRESS, "100"))).resolves.toBeDefined();
  });

  it("refuses a PermitTransfer whose fee exceeds the ceiling", async () => {
    const payer = payerOf(TRON_ADDRESS, "sig", "PermitTransfer");
    const wallet = toX402Wallet(payer, { family: "tron", maxGasfreeFeeRaw: "100" });
    await expect(wallet.signTypedData(permitPayload(TRON_ADDRESS, "101"))).rejects.toMatchObject({
      code: "fee_cap_exceeded",
    });
    expect(payer.signTypedData).not.toHaveBeenCalled();
  });

  it("refuses a PermitTransfer whose fee is not a whole number", async () => {
    const wallet = toX402Wallet(payerOf(TRON_ADDRESS, "sig", "PermitTransfer"), {
      family: "tron",
      maxGasfreeFeeRaw: "100",
    });
    await expect(wallet.signTypedData(permitPayload(TRON_ADDRESS, "ten"))).rejects.toMatchObject({
      code: "fee_cap_exceeded",
    });
  });

  // Finding 4: BigInt(maxGasfreeFeeRaw) used to sit outside the try block, so an unparseable
  // ceiling threw a bare, uncoded SyntaxError instead of a ChainError.
  it("refuses a PermitTransfer when the policy's own fee ceiling will not parse", async () => {
    const wallet = toX402Wallet(payerOf(TRON_ADDRESS, "sig", "PermitTransfer"), {
      family: "tron",
      maxGasfreeFeeRaw: "1e6",
    });
    await expect(wallet.signTypedData(permitPayload(TRON_ADDRESS, "100"))).rejects.toMatchObject({
      code: "fee_cap_exceeded",
    });
  });

  it("ignores the fee ceiling for a struct that is not a PermitTransfer", async () => {
    const wallet = toX402Wallet(payerOf(EVM_ADDRESS), { family: "evm", maxGasfreeFeeRaw: "0" });
    await expect(wallet.signTypedData(evmPayload(EVM_ADDRESS))).resolves.toBeDefined();
  });

  it("refuses a signature produced for a different struct", async () => {
    const wallet = toX402Wallet(payerOf(EVM_ADDRESS, "sig", "SomethingElse"), { family: "evm" });
    await expect(wallet.signTypedData(evmPayload(EVM_ADDRESS))).rejects.toMatchObject({
      code: "signed_payload_mismatch",
    });
  });

  // Finding 1: an absent `primaryType` must not disable the guards. `declaredPayer`,
  // `assertFeeWithinCap` and `assertSignedTheRequest` all branched on `payload.primaryType`
  // directly, so a payload that simply omitted the field slipped past every one of them.
  it("still rejects a payer mismatch and an over-cap fee when primaryType is omitted", async () => {
    const payer = payerOf(TRON_ADDRESS, "sig", "PermitTransfer");
    const wallet = toX402Wallet(payer, { family: "tron", maxGasfreeFeeRaw: "100" });
    await expect(
      wallet.signTypedData(
        permitPayloadNoPrimaryType("TBvJUBXorwBPzqvV38vjDgegj5Eh6g2Tsq", "999999999"),
      ),
    ).rejects.toMatchObject({ code: "payer_mismatch" });
    expect(payer.signTypedData).not.toHaveBeenCalled();
  });

  it("resolves the root and signs a PermitTransfer with omitted primaryType when payer and fee are fine", async () => {
    const wallet = toX402Wallet(payerOf(TRON_ADDRESS, "sig", "PermitTransfer"), {
      family: "tron",
      maxGasfreeFeeRaw: "100",
    });
    await expect(
      wallet.signTypedData(permitPayloadNoPrimaryType(TRON_ADDRESS, "100")),
    ).resolves.toBeDefined();
  });

  it("rejects an EVM payer mismatch when primaryType is omitted", async () => {
    const payer = payerOf(EVM_ADDRESS);
    const wallet = toX402Wallet(payer, { family: "evm" });
    await expect(
      wallet.signTypedData(evmPayloadNoPrimaryType("0x2222222222222222222222222222222222222222")),
    ).rejects.toMatchObject({ code: "payer_mismatch" });
    expect(payer.signTypedData).not.toHaveBeenCalled();
  });

  it("passes a TRON transaction through untouched", async () => {
    const payer = payerOf(TRON_ADDRESS);
    const tx = { raw_data: {}, txID: "abc" };
    expect(await toX402Wallet(payer, { family: "tron" }).signTransaction(tx)).toEqual(tx);
    expect(payer.signTransaction).toHaveBeenCalledWith(tx);
  });

  it("unwraps an EVM signature to the raw serialisation x402 broadcasts", async () => {
    const payer: PayerSigner = {
      address: EVM_ADDRESS,
      signTypedData: vi.fn(),
      signTransaction: vi.fn(async () => ({ raw: "0xraw", hash: "0xhash" })),
    };
    expect(await toX402Wallet(payer, { family: "evm" }).signTransaction({})).toBe("0xraw");
  });

  it("refuses an EVM signature that carries no raw transaction", async () => {
    const payer: PayerSigner = {
      address: EVM_ADDRESS,
      signTypedData: vi.fn(),
      signTransaction: vi.fn(async () => ({ hash: "0xhash" })),
    };
    await expect(toX402Wallet(payer, { family: "evm" }).signTransaction({})).rejects.toMatchObject({
      code: "signed_payload_mismatch",
    });
  });
});
