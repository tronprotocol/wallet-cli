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
  return renderWith(0, ...transactions);
}

function renderWith(unreadable: number, ...transactions: unknown[]): string {
  return MultisigFormatters.txTronLinkMultisig({
    address: A,
    total: transactions.length + unreadable,
    unreadable,
    transactions,
  } as unknown as TronLinkMultisigListView);
}

describe("TronLink multi-sig list rendering", () => {
  // History and actionability are separate concerns: preserve the service's state for an
  // informational list, but surface the failed chain check independently and never invite action.
  it("preserves service state while marking a chain-unverified row and keeping it out of the co-sign hint", () => {
    const output = render(
      transaction({
        state: "success",
        verified: false,
        unverifiedReason:
          "TronLink transaction metadata or signatures disagree with the selected network",
      }),
    );
    expect(output).toContain("State");
    expect(output).toContain("Validation");
    expect(output).toMatch(/\|\s+success\s+\|\s+unverified\s+\|/);
    expect(output).not.toContain("awaiting you");
    expect(output).not.toContain("--sign <txId>");
    expect(output).not.toContain("disagree");
  });

  // A shorter table than the total is a silent lie about the queue — say what was dropped.
  it("reports records that were omitted because they could not be decoded", () => {
    expect(renderWith(2, transaction())).toContain("2 record");
    expect(render(transaction())).not.toMatch(/could not be decoded/i);
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
