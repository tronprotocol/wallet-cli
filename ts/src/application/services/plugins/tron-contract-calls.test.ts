import { describe, expect, it, vi } from "vitest";
import type { NetworkDescriptor, Signer } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import type { DispatchCheck } from "../../contracts/deadline.js";
import type { ChainGatewayProvider } from "../../ports/chain/gateway-provider.js";
import type { TronGateway } from "../../ports/chain/tron/tron-gateway.js";
import type { SignerResolver } from "../signer/index.js";
import { TxPipeline } from "../pipeline/index.js";
import { SigningService } from "../signing/signing-service.js";
import { CommandDeadline } from "../command-deadline.js";
import { TronContractCalls, type TronCallOptions } from "./tron-contract-calls.js";
import { sunAmount } from "../../../domain/amounts/index.js";
import { TransportError } from "../../../domain/errors/index.js";
import { DEFAULT_FEE_LIMIT_SUN } from "../../../domain/fees/tron.js";

const NOW = 1_700_000_000_000;
const OWNER = "TNmoJ3Be59WFEq5dsW6eCkZjveiL3G8HVB";
const NET: NetworkDescriptor = {
  id: "tron:3448148188",
  family: "tron",
  nativeSymbol: "TRX",
  chainId: "3448148188",
  capabilities: [],
};
const PAYLOAD = {
  target: "TPgmqJ9ixVReY2Zc5FSYiC8qp4yZybbMhU",
  method: "approve(address,uint256)",
  parameters: [{ type: "uint256", value: "1" }],
};

// Only a submitting mode accepts a wait intent.
function scope(wait?: boolean): TransactionScope {
  return {
    activeAccount: "wlt_test.0" as never,
    resolveAddress: () => OWNER,
    deadline: new CommandDeadline(0),
    wait,
    emit: () => {},
    warn: () => {},
  };
}

function harness(broadcast?: TronGateway["broadcast"]) {
  const order: string[] = [];
  const built = {
    txID: "tx-1",
    raw_data: {
      timestamp: NOW,
      expiration: NOW + 60_000,
      contract: [{ type: "TriggerSmartContract" }],
    },
  };
  const gateway = {
    triggerSmartContract: vi.fn(async () => structuredClone(built)),
    estimateResources: vi.fn(async () => ({ feeModel: "tron-resource", energy: 30_000 })),
    prepareTransaction: vi.fn((tx: unknown) => tx),
    encodeTransactionHex: vi.fn(() => "0a02beef"),
    getSignWeight: vi.fn(async () => ({
      permission: { id: 0, name: "owner", threshold: 1, keys: [{ address: OWNER, weight: 1 }] },
      approvedList: [],
      currentWeight: 0,
      resultCode: "NOT_ENOUGH_PERMISSION",
    })),
    getApprovedList: vi.fn(async () => []),
    broadcast: vi.fn(
      broadcast ??
        (async (_signed: unknown, check: DispatchCheck) => {
          check.assertDispatchable();
          order.push("node answered");
          return { result: true, txId: "tx-1" };
        }),
    ),
    getTransactionInfoById: vi.fn(async () => ({ blockNumber: 7, execution: "success" })),
  } as unknown as TronGateway;
  const signer: Signer = {
    kind: "software",
    address: OWNER,
    sign: async (tx) => tx as never,
    signMessage: async () => "",
    signTypedData: async () => ({ signature: "", digest: "", primaryType: "" }),
  };
  const signers = { assertCanSign: () => {}, resolve: () => signer } as unknown as SignerResolver;
  const provider = { get: () => gateway } as unknown as ChainGatewayProvider;
  const calls = new TronContractCalls(
    provider,
    new TxPipeline(signers, new SigningService(provider)),
    () => NOW,
  );
  return { calls, gateway, order };
}

const options = (mode: TronCallOptions["mode"]["mode"], extra: Partial<TronCallOptions> = {}) => ({
  mode: { mode, permissionId: 0 },
  estimable: true,
  ...extra,
});

describe("TronContractCalls modes", () => {
  it("dry-run builds and estimates without signing or sending", async () => {
    const h = harness();
    const outcome = await h.calls.run(scope(), NET, PAYLOAD, options("dry-run"));
    expect(outcome).toMatchObject({ stage: "plan", fee: { energy: 30_000 } });
    expect(h.gateway.getSignWeight).not.toHaveBeenCalled();
    expect(h.gateway.broadcast).not.toHaveBeenCalled();
  });

  it("build-only returns the encoded transaction without signing", async () => {
    const h = harness();
    const outcome = await h.calls.run(scope(), NET, PAYLOAD, options("build-only"));
    expect(outcome).toMatchObject({ stage: "built", hex: "0a02beef" });
    expect(h.gateway.getSignWeight).not.toHaveBeenCalled();
    expect(h.gateway.broadcast).not.toHaveBeenCalled();
  });

  it("sign-only signs after the multi-signature preflight and never sends", async () => {
    const h = harness();
    const onDispatched = vi.fn();
    const outcome = await h.calls.run(
      scope(),
      NET,
      PAYLOAD,
      options("sign-only", { onDispatched }),
    );
    expect(outcome).toMatchObject({ stage: "signed", txId: "tx-1", address: OWNER });
    expect(h.gateway.getSignWeight).toHaveBeenCalled();
    expect(h.gateway.broadcast).not.toHaveBeenCalled();
    expect(onDispatched).not.toHaveBeenCalled();
  });

  it("broadcast without a wait returns the submitted outcome", async () => {
    const h = harness();
    const onSubmitted = vi.fn();
    const outcome = await h.calls.run(
      scope(false),
      NET,
      PAYLOAD,
      options("broadcast", { onSubmitted }),
    );
    expect(outcome).toMatchObject({ stage: "submitted", txId: "tx-1" });
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("broadcast with a wait confirms and reports the submit before the wait", async () => {
    const h = harness();
    const onSubmitted = vi.fn(() => h.order.push("submitted"));
    const outcome = await h.calls.run(
      scope(true),
      NET,
      PAYLOAD,
      options("broadcast", { onSubmitted }),
    );
    expect(outcome).toMatchObject({ stage: "confirmed", txId: "tx-1", blockNumber: 7 });
    expect(onSubmitted).toHaveBeenCalledWith("tx-1");
    expect(h.order).toEqual(["node answered", "submitted"]);
  });

  it("builds with the fee limit given, or the default, and zero call value", async () => {
    const h = harness();
    await h.calls.run(scope(), NET, PAYLOAD, options("dry-run", { feeLimit: sunAmount("5") }));
    await h.calls.run(scope(), NET, PAYLOAD, options("dry-run"));
    const calls = vi.mocked(h.gateway.triggerSmartContract).mock.calls as unknown as unknown[][];
    expect(calls[0]![4]).toEqual({ callValue: "0", feeLimit: "5", permissionId: 0 });
    expect((calls[1]![4] as { feeLimit: string }).feeLimit).toBe(DEFAULT_FEE_LIMIT_SUN);
  });

  it("reports a fee note instead of simulating a call that cannot be estimated yet", async () => {
    const h = harness();
    const outcome = await h.calls.run(
      scope(),
      NET,
      PAYLOAD,
      options("dry-run", { estimable: false }),
    );
    expect(outcome).toMatchObject({
      stage: "plan",
      fee: { feeModel: "tron-resource", note: "not estimable until the approval is on-chain" },
    });
    expect(h.gateway.estimateResources).not.toHaveBeenCalled();
  });
});

describe("TronContractCalls dispatch notice", () => {
  it("reports the txId once the submit check passed, before the node answers", async () => {
    const h = harness();
    const onDispatched = vi.fn(() => h.order.push("dispatched"));
    await h.calls.run(scope(false), NET, PAYLOAD, options("broadcast", { onDispatched }));
    expect(onDispatched).toHaveBeenCalledTimes(1);
    expect(onDispatched).toHaveBeenCalledWith("tx-1");
    expect(h.order).toEqual(["dispatched", "node answered"]);
  });

  it("keeps the txId of a transaction whose broadcast answer was lost", async () => {
    const h = harness(async (_signed, check) => {
      check.assertDispatchable();
      throw new TransportError("timeout", "the node did not answer");
    });
    const onDispatched = vi.fn();
    const failure = h.calls.run(scope(false), NET, PAYLOAD, options("broadcast", { onDispatched }));
    await expect(failure).rejects.toMatchObject({
      code: "timeout",
      details: { txId: "tx-1", outcome: "unknown" },
    });
    expect(onDispatched).toHaveBeenCalledWith("tx-1");
  });

  it("does not report a transaction the submit check refused", async () => {
    const h = harness(async (_signed, check) => {
      check.assertDispatchable();
      return { result: true, txId: "tx-1" };
    });
    const refused = scope(false);
    const deadline = new CommandDeadline(60_000, 0, { now: () => 0 });
    const onDispatched = vi.fn();
    vi.mocked(h.gateway.broadcast).mockImplementationOnce(async (_signed, check) => {
      vi.spyOn(deadline, "remainingMs").mockReturnValue(0);
      check.assertDispatchable();
      return { result: true, txId: "tx-1" };
    });
    await expect(
      h.calls.run({ ...refused, deadline }, NET, PAYLOAD, options("broadcast", { onDispatched })),
    ).rejects.toBeDefined();
    expect(onDispatched).not.toHaveBeenCalled();
  });
});
