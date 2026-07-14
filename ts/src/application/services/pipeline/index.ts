/**
 * TxPipeline — the shared signing flow for every transaction command:
 * resolve signer → build → estimate → (dry-run?) → sign → (broadcast?).
 * Ledger wait, timeout, and abort behavior lives here, not in each command.
 * Chain-specific build/estimate come in as callbacks.
 */
import type { AccountRef, ChainFamily, FeeReport, NetworkDescriptor, SignedTx, TxOutcome, UnsignedTx } from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import { SignerResolver } from "../signer/index.js";
import { UsageError } from "../../../domain/errors/index.js";
import { withTimeout } from "../../../domain/async/index.js";
import type { Broadcaster } from "../../ports/chain/broadcaster.js";

export interface TxPipelineParams {
  ctx: TransactionScope;
  net: NetworkDescriptor;
  account: AccountRef;
  /** how the signed tx reaches the chain — the concrete client passed in by the command. */
  broadcaster: Broadcaster;
  build: (signerAddress: string) => Promise<UnsignedTx>;
  estimate: (tx: UnsignedTx) => Promise<FeeReport>;
  dryRun: boolean;
  broadcast: boolean;
  /** Optional post-broadcast confirmation: poll the chain for on-chain results (fee/energy/
   *  withdrawn amount) and merge them into the broadcast outcome. Best-effort — it must never
   *  throw; on timeout it returns undefined and the receipt falls back to txid + echoed inputs. */
  confirm?: (txId: string) => Promise<Record<string, unknown> | undefined>;
}

export class TxPipeline {
  constructor(private readonly signers: SignerResolver) {}

  /** Pre-flight capability gate for write commands: fail fast (before any RPC) when the active
   *  account can't sign. Delegates to the resolver so the watch-only rule lives in one place. */
  assertCanSign(account: AccountRef, family: ChainFamily): void {
    this.signers.assertCanSign(account, family);
  }

  async run(p: TxPipelineParams): Promise<TxOutcome> {
    const { timeoutMs } = p.ctx;
    // --wait only makes sense when we actually broadcast (dry-run/sign-only never reach the chain).
    if (p.ctx.wait && !p.broadcast) {
      throw new UsageError("invalid_option", "--wait has nothing to wait for with --dry-run/--sign-only (neither broadcasts)");
    }
    const signer = this.signers.resolve(p.account, p.net.family);

    // RPC steps (build/estimate/broadcast) are bounded by the adapter's own --timeout, so they
    // aren't wrapped here. The one thing no RPC timeout covers is a Ledger tap that never comes:
    // bound the device signature and abort its prompt on timeout.
    const tx = await p.build(signer.address);
    const fee = await p.estimate(tx);
    if (p.dryRun) return { stage: "plan", tx, fee };

    let signed: SignedTx;
    if (signer.kind === "device") {
      await signer.precheck?.();
      p.ctx.emit({ type: "awaiting_device", reason: "sign" });
      const ac = new AbortController();
      signed = await withTimeout(signer.sign(tx, { signal: ac.signal }), timeoutMs, () => ac.abort());
    } else {
      signed = await signer.sign(tx, {});
    }

    if (!p.broadcast) return { stage: "signed", signed, fee };
    const result = await p.broadcaster.broadcast(signed);
    const txId = String(result.txId ?? result.hash ?? "");
    // default (no --wait): non-blocking, return the submitted txid only (fee/energy unknown yet).
    if (!p.ctx.wait || !p.confirm || !txId) {
      // --wait asked but we can't even attempt confirmation (no confirm hook or no txid): the
      // fallback to submitted is silent otherwise, so flag it rather than imply confirmation.
      if (p.ctx.wait && !txId) {
        p.ctx.warn("--wait requested but the broadcast returned no txid; returning submitted (unconfirmed)");
      }
      return { stage: "submitted", ...result };
    }
    // --wait: poll until the tx mines so the receipt carries real fee/energy/result.
    // Best-effort — a confirmation failure/timeout never fails an already-broadcast tx; we just
    // fall back to the submitted receipt.
    let confirmed: Record<string, unknown> | undefined;
    try {
      confirmed = await p.confirm(txId);
    } catch {
      confirmed = undefined;
    }
    if (!confirmed) {
      // The user asked to wait; a silent "submitted" reads like confirmation was never attempted.
      p.ctx.warn(`--wait: ${txId} not confirmed within ${p.ctx.waitTimeoutMs}ms; returning submitted (it may still confirm on-chain)`);
      return { stage: "submitted", ...result };
    }
    return { stage: confirmed.failed ? "failed" : "confirmed", ...result, ...confirmed };
  }
}
