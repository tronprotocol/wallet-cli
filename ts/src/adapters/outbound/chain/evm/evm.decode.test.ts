import { describe, expect, it } from "vitest";
import { Transaction, Wallet } from "ethers";
import { decodeEvmRawTransaction, evmTransactionChainId } from "./evm.js";
import { evmSignStrategy } from "./signing-strategy.js";
import { SigningService } from "../../../../application/services/signing/signing-service.js";
import { classifyError } from "../../../../domain/errors/index.js";
import { CommandDeadline } from "../../../../application/services/command-deadline.js";

const NO_DEADLINE = new CommandDeadline(0);

// Sepolia, nonce 0, 0.001 ETH to 0x…dEaD, no signature.
const UNSIGNED =
  "0x02f083aa36a780830f4240847944848282520894000000000000000000000000000000000000dead87038d7ea4c6800080c0";
// Mainnet, signed.
const SIGNED_MAINNET =
  "0x02f8700180830f42408478fbb08282520894000000000000000000000000000000000000dead87038d7ea4c6800080c080a0bf5dda9670fd52be2346cdb74cdd238a51a4ae67ac7513fd7540fd78eca31d25a026903a9fcb8d75c83ff1e0177a8dd7061e0ddc7051500a6f1a041be1a2e32ca3";

describe("decodeEvmRawTransaction", () => {
  it("reads an unsigned transaction's chain and fields", () => {
    const tx = decodeEvmRawTransaction(UNSIGNED);
    expect(tx).toMatchObject({
      chainId: "11155111",
      signed: false,
      to: "0x000000000000000000000000000000000000dEaD",
      nonce: 0,
      valueWei: "1000000000000000",
    });
    expect(tx).not.toHaveProperty("hash");
  });

  it("reads a signed transaction's sender, hash and serialisation", () => {
    const tx = decodeEvmRawTransaction(SIGNED_MAINNET);
    expect(tx).toMatchObject({ chainId: "1", signed: true, serialized: SIGNED_MAINNET });
    expect(tx.from).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(tx.hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("refuses bytes that are not a transaction", () => {
    expect(() => decodeEvmRawTransaction("0x1234")).toThrow(
      expect.objectContaining({ code: "invalid_transaction" }),
    );
  });
});

describe("evmTransactionChainId", () => {
  it("reads the chain id of a decoded transaction", () => {
    expect(evmTransactionChainId(decodeEvmRawTransaction(UNSIGNED).transaction)).toBe("11155111");
  });

  it("reports a legacy transaction without a chain id as naming none", () => {
    expect(
      evmTransactionChainId({
        type: 0,
        gasPrice: "1",
        to: "0x000000000000000000000000000000000000dEaD",
      }),
    ).toBe(undefined);
  });

  it("reads an untyped payload as the typed transaction ethers signs, bound to chain 0", () => {
    expect(evmTransactionChainId({ to: "0x000000000000000000000000000000000000dEaD" })).toBe("0");
  });
});

describe("chain id 0", () => {
  const BASE = {
    chainId: 0n,
    nonce: 0,
    to: "0x000000000000000000000000000000000000dEaD",
    value: 0n,
    gasLimit: 21000n,
  };
  const TYPED = [
    ["type 1", { ...BASE, type: 1, gasPrice: 1n }],
    ["type 2", { ...BASE, type: 2, maxFeePerGas: 2n, maxPriorityFeePerGas: 1n }],
  ] as const;

  it.each(TYPED)("keeps the explicit chain id of a %s transaction", (_label, fields) => {
    const decoded = decodeEvmRawTransaction(Transaction.from(fields).unsignedSerialized);

    expect(decoded.chainId).toBe("0");
    expect(evmTransactionChainId(decoded.transaction)).toBe("0");
  });

  it("reports an unsigned legacy transaction without EIP-155 as naming no chain", () => {
    const decoded = decodeEvmRawTransaction(
      Transaction.from({ ...BASE, type: 0, gasPrice: 1n }).unsignedSerialized,
    );

    expect(decoded).not.toHaveProperty("chainId");
    expect(evmTransactionChainId(decoded.transaction)).toBe(undefined);
  });

  it("reports a signed legacy transaction without EIP-155 as naming no chain", async () => {
    const signed = await Wallet.createRandom().signTransaction({ ...BASE, type: 0, gasPrice: 1n });
    const decoded = decodeEvmRawTransaction(signed);

    expect(decoded.signed).toBe(true);
    expect(decoded).not.toHaveProperty("chainId");
  });
});

describe("invalid fee fields", () => {
  const TO = "0x000000000000000000000000000000000000dEaD";
  const FEES = {
    chainId: "1",
    to: TO,
    gasLimit: "21000",
    maxFeePerGas: "1",
    maxPriorityFeePerGas: "2",
  };

  it("leaves a typed transaction's fee error to the signer, as signing_rejected", async () => {
    const signer = {
      kind: "software",
      address: TO,
      sign: (payload: never) => evmSignStrategy.sign("01".repeat(32), payload),
    };
    const signing = new SigningService({
      get: () => ({ transactionChainId: evmTransactionChainId }),
    } as never);

    const error = await signing
      .sign({ deadline: NO_DEADLINE, timeoutMs: 1000, emit() {} } as never, {
        network: { family: "evm", id: "eip155:1", chainId: "1" } as never,
        origin: "service",
        signer: signer as never,
        payload: { kind: "transaction", transaction: { type: 2, ...FEES } as never },
      })
      .catch((e: unknown) => e);
    expect(classifyError(error).code).toBe("signing_rejected");
  });

  it("reports an untyped payload whose fees ethers cannot type as invalid_payload", () => {
    expect(() => evmTransactionChainId(FEES as never)).toThrow(
      expect.objectContaining({ code: "invalid_payload" }),
    );
  });
});
