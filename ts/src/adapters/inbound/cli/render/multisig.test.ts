import { describe, expect, it } from "vitest";
import type { TronLinkMultisigListView } from "../../../../domain/types/index.js";
import { MultisigFormatters } from "./multisig.js";

const A = "TLZz5XKerAAebbRdScB3jmSPr5DHSpGJJP";

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    txId: "ab".repeat(32),
    state: "pending",
    contractType: "TransferContract",
    originator: A,
    owner: A,
    permission: { id: 2, name: "finance", threshold: 2 },
    currentWeight: 1,
    missingWeight: 1,
    thresholdReached: false,
    awaitingMySignature: true,
    signedByCurrentAccount: false,
    createdAt: 1_900_000_000_000,
    expiration: 1_900_000_600_000,
    expired: false,
    signatures: 1,
    signatureProgress: [],
    from: A,
    rawAmount: "1000000",
    verified: true,
    ...overrides,
  };
}

function render(...transactions: unknown[]): string {
  return MultisigFormatters.txTronLinkMultisig({
    address: A,
    total: transactions.length,
    transactions,
  } as unknown as TronLinkMultisigListView);
}

describe("TronLink multi-sig list rendering", () => {
  // An unverified row's service-claimed state is exactly what must not be acted on, so the row
  // stays visible but says so, and it never counts toward the co-sign prompt.
  it("marks a chain-unverified row and keeps it out of the co-sign hint", () => {
    const output = render(transaction({
      verified: false,
      unverifiedReason: "TronLink transaction metadata or signatures disagree with the selected network",
    }));
    expect(output).toContain("unverified");
    expect(output).not.toContain("awaiting you");
    expect(output).not.toContain("--sign <txId>");
    expect(output).toContain("disagree");
  });

  it("still prompts to co-sign when a verified row awaits this account", () => {
    const output = render(transaction(), transaction({ verified: false, txId: "cd".repeat(32) }));
    expect(output).toContain("awaiting you");
    expect(output).toContain("--sign <txId>");
  });
});

function receipt(action: "create" | "sign", thresholdReached: boolean): string {
  return MultisigFormatters.txTronLinkMultisig({
    action,
    accepted: true,
    signer: A,
    signerWeight: 1,
    hex: "0a02cafe",
    transaction: {
      txId: "ab".repeat(32),
      contractType: "TransferContract",
      operation: "Transfer TRX",
      from: A,
      rawAmount: "1000000",
      permission: { id: 2, name: "finance", threshold: 2 },
      currentWeight: thresholdReached ? 2 : 1,
      missingWeight: thresholdReached ? 0 : 1,
      thresholdReached,
      approved: [{ address: A, weight: 1 }],
      expiration: 1_900_000_600_000,
      expired: false,
      signatures: thresholdReached ? 2 : 1,
    },
  } as never);
}

describe("TronLink multi-sig receipts", () => {
  // --create is the originator's signature, so the receipt has to name the signer and its weight
  // the way --sign does; the collection opens at 1 of N, never at 0.
  it("reports the originator's own signature on create and points at the co-signers", () => {
    const output = receipt("create", false);
    expect(output).toContain("Created on TronLink multi-sig service");
    expect(output).toContain(`Signer  ${A}  (weight 1)`);
    expect(output).toContain("0a02cafe");
    expect(output).toContain("! Each co-signer signs it with: wallet-cli tx multisig --sign");
    expect(output).not.toContain("tx broadcast");
  });

  // The service broadcasts once the threshold is met, so an unconditional "broadcast it" would
  // send the user at a call that fails with "Transaction already exists."
  it("tells both create and sign to confirm on chain before broadcasting at threshold", () => {
    for (const action of ["create", "sign"] as const) {
      const output = receipt(action, true);
      expect(output).toContain("Threshold reached — the service broadcasts it. Confirm:");
      expect(output).toContain("wallet-cli tx info --txid ab");
      expect(output).toContain("Not on chain: wallet-cli tx broadcast --hex 0a02cafe");
    }
  });
});
