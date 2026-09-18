import { describe, it, expect, vi } from "vitest";
import { toX402Wallet } from "./signer-bridge.js";
import type { PayerSigner } from "../../../application/contracts/x402-payer.js";
import type { TypedDataPayload } from "../../../domain/types/index.js";
import { tronHexAddress } from "../../../domain/address/index.js";

const EVM_ADDRESS = "0xaB5801a7D398351b8bE11C439e05C5B3259aeC9B";
const TRON_ADDRESS = "TCLBgkbfVkJroVBJVqBEsxtPNQEQMTQCLQ";
// The same TRON address in the 41-prefixed hex form a counterparty may send instead.
const TRON_HEX = "4119e7e376e7c213b7e7e7e46cc70a5dd086daff2a";

it.each([
  [{ gas: 65000n }, 65000n],
  [{ gasLimit: 70000n }, 70000n],
  [{ gas: 65000n, gasLimit: 70000n }, 70000n],
])(
  "normalizes EVM gas without mutating the SDK transaction (case %#)",
  async (fields, expected) => {
    const tx = Object.freeze({ to: EVM_ADDRESS, ...fields });
    const signTransaction = vi.fn(async () => ({ raw: "0xraw" }));
    const payer = { ...payerOf(EVM_ADDRESS), signTransaction };
    await toX402Wallet(payer, { family: "evm" }).signTransaction(tx);
    expect(signTransaction).toHaveBeenCalledWith({ to: EVM_ADDRESS, gasLimit: expected });
    expect(tx).toEqual({ to: EVM_ADDRESS, ...fields });
  },
);

it.each([null, "0x1234", []])(
  "rejects invalid EVM transaction input before signing %j",
  async (tx) => {
    const payer = payerOf(EVM_ADDRESS);
    await expect(toX402Wallet(payer, { family: "evm" }).signTransaction(tx)).rejects.toThrow(
      "must be an object",
    );
    expect(payer.signTransaction).not.toHaveBeenCalled();
  },
);

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

it.each(["Transfer", "PermitTransfer"])(
  "accepts the TRON SDK's 20-byte payer for %s",
  async (primaryType) => {
    const wallet = toX402Wallet(payerOf(TRON_ADDRESS, "sig", primaryType), {
      family: "tron",
      maxGasfreeFeeRaw: "10",
    });
    const address = `0x${TRON_HEX.slice(2)}`;
    await expect(
      wallet.signTypedData(
        primaryType === "Transfer" ? evmPayload(address) : permitPayload(address, "1"),
      ),
    ).resolves.toBe("0xsig");
  },
);

it("warns about an uncapped high GasFree fee before requesting the signature", async () => {
  const warn = vi.fn();
  const payer = payerOf(TRON_ADDRESS, "sig", "PermitTransfer");
  const wallet = toX402Wallet(payer, { family: "tron", warn });
  const payload = permitPayload(TRON_HEX, "1300000");
  payload.message.value = "10000";
  await wallet.signTypedData(payload);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("13000.00%"));
  expect(warn.mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(payer.signTypedData).mock.invocationCallOrder[0]!,
  );
});

/**
 * A human-unit fee ceiling (`--max-gasfree-fee 1`) has no meaning until the token is known, and
 * the token is only known once the SDK has chosen the requirement and filled the PermitTransfer.
 * Converting the ceiling up front, with whichever candidate the CLI saw first, let a 1 USDD
 * (18 decimals) ceiling authorise 1.3 USDT (6 decimals) of fees.
 */
describe("toX402Wallet converts a human fee ceiling with the SIGNED token's precision", () => {
  const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
  const USDT_HEX = "0xa614f803b6fd780986a42c78ec9c7f77e6ded13c"; // the same address as TIP-712 spells it
  const withToken = (maxFee: string, token = USDT_HEX): TypedDataPayload => ({
    ...permitPayload(TRON_ADDRESS, maxFee),
    message: { user: TRON_ADDRESS, maxFee, token },
  });
  const policy = {
    family: "tron" as const,
    maxGasfreeFee: "1",
    gasfreeFeeDecimals: (token: string) => (token === USDT ? 6 : undefined),
  };

  it("refuses a fee above the ceiling in the signed token's units", async () => {
    const payer = payerOf(TRON_ADDRESS, "sig", "PermitTransfer");
    const wallet = toX402Wallet(payer, policy);
    await expect(wallet.signTypedData(withToken("1300000"))).rejects.toMatchObject({
      code: "fee_cap_exceeded",
      details: { fee: "1300000", cap: "1000000" },
    });
    expect(payer.signTypedData).not.toHaveBeenCalled();
  });

  it("signs a fee within the ceiling in the signed token's units", async () => {
    const wallet = toX402Wallet(payerOf(TRON_ADDRESS, "sig", "PermitTransfer"), policy);
    await expect(wallet.signTypedData(withToken("1000000"))).resolves.toBeDefined();
  });

  it("refuses rather than guess when the signed token's precision is unknown", async () => {
    const payer = payerOf(TRON_ADDRESS, "sig", "PermitTransfer");
    const wallet = toX402Wallet(payer, policy);
    await expect(
      wallet.signTypedData(withToken("1", "0x0000000000000000000000000000000000000001")),
    ).rejects.toMatchObject({ code: "fee_cap_exceeded" });
    expect(payer.signTypedData).not.toHaveBeenCalled();
  });
});

/**
 * A payment authorization carries its own deadline (Permit2 `deadline`, EIP-3009 `validBefore`,
 * GasFree `deadline`). The SDK computes it before waiting for an approve to confirm, so by the
 * time it asks for the signature — or by the time a device returns one — the window can already
 * be gone. An expired authorization must be refused before it reaches the device, and a signature
 * that expired while the device was open must not be handed on to be sent.
 */
describe("toX402Wallet refuses expired payment authorizations", () => {
  const EVM = "0x1111111111111111111111111111111111111111";
  const NOW = 1_700_000_000;
  const permit2 = (deadline: number): TypedDataPayload => ({
    domain: { name: "Permit2" },
    types: {
      PermitWitnessTransferFrom: [
        { name: "spender", type: "address" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "PermitWitnessTransferFrom",
    message: { spender: EVM, deadline: String(deadline) },
  });
  const eip3009 = (validBefore: number): TypedDataPayload => ({
    domain: { name: "USD Coin" },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "validBefore", type: "uint256" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: { from: EVM, validBefore: String(validBefore) },
  });

  it("refuses a Permit2 authorization whose deadline has passed, before signing", async () => {
    const payer = payerOf(EVM, "sig", "PermitWitnessTransferFrom");
    const wallet = toX402Wallet(payer, { family: "evm", now: () => NOW });
    await expect(wallet.signTypedData(permit2(NOW - 1))).rejects.toMatchObject({
      code: "tx_expired",
    });
    expect(payer.signTypedData).not.toHaveBeenCalled();
  });

  it("refuses an EIP-3009 authorization whose validBefore has passed", async () => {
    const payer = payerOf(EVM, "sig", "TransferWithAuthorization");
    const wallet = toX402Wallet(payer, { family: "evm", now: () => NOW });
    await expect(wallet.signTypedData(eip3009(NOW))).rejects.toMatchObject({ code: "tx_expired" });
  });

  it("refuses a GasFree PermitTransfer whose deadline has passed", async () => {
    const payer = payerOf(TRON_ADDRESS, "sig", "PermitTransfer");
    const wallet = toX402Wallet(payer, { family: "tron", now: () => NOW });
    const payload = {
      ...permitPayload(TRON_ADDRESS, "1"),
      message: { user: TRON_ADDRESS, maxFee: "1", deadline: String(NOW - 5) },
    };
    await expect(wallet.signTypedData(payload)).rejects.toMatchObject({ code: "tx_expired" });
  });

  it("signs an authorization whose deadline is still ahead", async () => {
    const wallet = toX402Wallet(payerOf(EVM, "sig", "PermitWitnessTransferFrom"), {
      family: "evm",
      now: () => NOW,
    });
    await expect(wallet.signTypedData(permit2(NOW + 30))).resolves.toBe("0xsig");
  });

  it("does not hand on a signature whose deadline passed while the device was open", async () => {
    let clock = NOW;
    const payer = payerOf(EVM, "sig", "PermitWitnessTransferFrom");
    (payer.signTypedData as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      clock = NOW + 61;
      return { signature: "0xsig", digest: "0xdig", primaryType: "PermitWitnessTransferFrom" };
    });
    const wallet = toX402Wallet(payer, { family: "evm", now: () => clock });
    await expect(wallet.signTypedData(permit2(NOW + 60))).rejects.toMatchObject({
      code: "tx_expired",
    });
  });
});

/**
 * The x402 TRON approve is the one transaction this wallet signs that a remote RPC built. The
 * generic integrity check proves the JSON and the bytes are the same transaction — not that it is
 * the approve that was asked for. A compromised RPC can return any self-consistent, owner-only
 * transaction and the signature is handed over. The bridge therefore only ever signs the exact
 * `approve(Permit2, MaxUint256)` the SDK requested, checked before any device prompt.
 */
describe("toX402Wallet signs only the Permit2 approve it was asked for (TRON)", () => {
  const PERMIT2 = "TTJxU3P8rHycAyFY4kVtGNfmnMH4ezcuM9";
  const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
  const hex20 = (base58: string) => tronHexAddress(base58).slice(2);
  const approveData = (spender: string, amount = "f".repeat(64)) =>
    `095ea7b3${"0".repeat(24)}${hex20(spender)}${amount}`;
  const approveTx = (
    over: Record<string, unknown> = {},
    valueOver: Record<string, unknown> = {},
  ) => ({
    txID: "ab".repeat(32),
    raw_data_hex: "0a",
    raw_data: {
      fee_limit: 100_000_000,
      contract: [
        {
          type: "TriggerSmartContract",
          parameter: {
            type_url: "type.googleapis.com/protocol.TriggerSmartContract",
            value: {
              owner_address: tronHexAddress(TRON_ADDRESS),
              contract_address: tronHexAddress(USDT),
              data: approveData(PERMIT2),
              ...valueOver,
            },
          },
        },
      ],
      ...over,
    },
  });
  const policy = {
    family: "tron" as const,
    approveIntent: { spender: PERMIT2, tokens: [USDT] },
  };

  it("signs the approve the SDK asked for, passing the transaction through untouched", async () => {
    const payer = payerOf(TRON_ADDRESS);
    const tx = approveTx();
    expect(await toX402Wallet(payer, policy).signTransaction(tx)).toEqual(tx);
    expect(payer.signTransaction).toHaveBeenCalledWith(tx);
  });

  it.each([
    [
      "an owner-only contract type substituted by the RPC",
      {
        contract: [
          {
            type: "WithdrawBalanceContract",
            parameter: { value: { owner_address: tronHexAddress(TRON_ADDRESS) } },
          },
        ],
      },
      {},
    ],
    [
      "a second contract appended",
      { contract: [approveTx().raw_data.contract[0], approveTx().raw_data.contract[0]] },
      {},
    ],
    ["a different spender", {}, { data: approveData(TRON_ADDRESS) }],
    ["an amount other than MaxUint256", {}, { data: approveData(PERMIT2, "0".repeat(63) + "1") }],
    ["a token this wallet does not know", {}, { contract_address: tronHexAddress(PERMIT2) }],
    ["a different owner", {}, { owner_address: tronHexAddress(PERMIT2) }],
    ["TRX attached to the call", {}, { call_value: 1 }],
    ["a fee limit above the approve budget", { fee_limit: 100_000_001 }, {}],
    ["no fee limit at all", { fee_limit: undefined }, {}],
  ])("refuses %s before the signer is asked", async (_label, over, valueOver) => {
    const payer = payerOf(TRON_ADDRESS);
    await expect(
      toX402Wallet(payer, policy).signTransaction(approveTx(over, valueOver)),
    ).rejects.toMatchObject({ code: "signed_payload_mismatch" });
    expect(payer.signTransaction).not.toHaveBeenCalled();
  });

  it("refuses any TRON transaction when no approve intent was declared", async () => {
    const payer = payerOf(TRON_ADDRESS);
    await expect(
      toX402Wallet(payer, { family: "tron" }).signTransaction(approveTx()),
    ).rejects.toMatchObject({ code: "signed_payload_mismatch" });
    expect(payer.signTransaction).not.toHaveBeenCalled();
  });
});
