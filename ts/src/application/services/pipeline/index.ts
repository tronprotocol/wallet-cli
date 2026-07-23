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
import { obtainSignature } from "../signing/obtain-signature.js";
import type { Broadcaster } from "../../ports/chain/broadcaster.js";
import type { TransactionExecutionMode } from "../transaction-mode.js";

export interface TxPipelineParams {
  ctx: TransactionScope;
  net: NetworkDescriptor;
  account: AccountRef;
  /** how the signed tx reaches the chain — the concrete client passed in by the command. */
  broadcaster: Broadcaster;
  build: (signerAddress: string) => Promise<UnsignedTx>;
  estimate: (tx: UnsignedTx) => Promise<FeeReport>;
  dryRun: boolean;
  buildOnly?: boolean;
  broadcast: boolean;
  mode?: TransactionExecutionMode;
  permissionId?: number;
  expiration?: number;
  signerOptions?: { requireSoftware?: boolean };
  /** Bind permission/expiration and recompute transaction identity before signing. */
  prepare?: (tx: UnsignedTx, options: { permissionId: number; expiration?: number }) => Promise<UnsignedTx> | UnsignedTx;
  /** Complete transaction protobuf serializer, required for build-only. */
  artifact?: (tx: UnsignedTx | SignedTx) => string;
  /** Authorization check performed before software key decryption or Ledger interaction. */
  preflight?: (tx: UnsignedTx, signerAddress: string) => Promise<void>;
  /** Optional post-broadcast confirmation: poll the chain for on-chain results (fee/energy/
   *  withdrawn amount) and merge them into the broadcast outcome. Best-effort — it must never
   *  throw; on timeout it returns undefined and the receipt falls back to txid + echoed inputs. */
  confirm?: (txId: string) => Promise<Record<string, unknown> | undefined>;
}

export class TxPipeline {
  constructor(private readonly signers: SignerResolver) {}

  /** Pre-flight capability gate for write commands: fail fast (before any RPC) when the active
   *  account can't sign. Delegates to the resolver so the watch-only rule lives in one place. */
  assertCanSign(account: AccountRef, family: ChainFamily, opts?: { requireSoftware?: boolean }): void {
    this.signers.assertCanSign(account, family, opts);
  }

  /**
   * Sign a transaction the caller built elsewhere. Shares signer resolution and the device
   * preliminaries with `run`, but has no build/estimate/broadcast phase — there is nothing to estimate
   * for a transaction we did not construct, and nothing to broadcast here.
   */
  async signOnly(p: {
    ctx: TransactionScope;
    net: NetworkDescriptor;
    account: AccountRef;
    tx: UnsignedTx;
  }): Promise<TxOutcome> {
    this.assertCanSign(p.account, p.net.family);
    const signer = this.signers.resolve(p.account, p.net.family);
    const signed = await obtainSignature(signer, p.ctx, (opts) => signer.sign(p.tx, opts));
    return { stage: "signed", signed, address: signer.address, txId: txIdOf(signed) };
  }

  async run(p: TxPipelineParams): Promise<TxOutcome> {
    const mode: TransactionExecutionMode = p.mode
      ?? (p.dryRun ? "dry-run" : p.buildOnly ? "build-only" : p.broadcast ? "broadcast" : "sign-only");
    if (p.ctx.wait && mode !== "broadcast") {
      throw new UsageError("invalid_option", "--wait cannot be used with --dry-run, --sign-only, or --build-only");
    }

    // RPC steps (build/estimate/broadcast) are bounded by the adapter's own --timeout, so they
    // aren't wrapped here. The one thing no RPC timeout covers is a Ledger tap that never comes;
    // obtainSignature bounds the device signature and aborts its prompt on timeout.
    const ownerAddress = p.ctx.resolveAddress(p.net.family);
    let tx = await p.build(ownerAddress);
    if (p.prepare) {
      tx = await p.prepare(tx, {
        permissionId: p.permissionId ?? 0,
        ...(p.expiration === undefined ? {} : { expiration: p.expiration }),
      });
    } else if ((p.permissionId ?? 0) !== 0 || p.expiration !== undefined) {
      throw new UsageError("invalid_option", "this chain adapter cannot apply --permission-id or --expiration");
    }
    const fee = await p.estimate(tx);
    if (mode === "dry-run") return { stage: "plan", tx, fee };
    if (mode === "build-only") {
      if (!p.artifact) throw new UsageError("invalid_option", "this chain adapter cannot produce transaction hex");
      return { stage: "built", tx, hex: p.artifact(tx), fee };
    }

    this.signers.assertCanSign(p.account, p.net.family, p.signerOptions);
    const signer = this.signers.resolve(p.account, p.net.family);
    if (signer.address !== ownerAddress) {
      throw new UsageError("invalid_account", "resolved signer address changed during transaction construction");
    }
    await p.preflight?.(tx, signer.address);
    const signed = await obtainSignature(signer, p.ctx, (opts) => signer.sign(tx, opts));

    if (mode === "sign-only") {
      return {
        stage: "signed",
        signed,
        ...(p.artifact ? { hex: p.artifact(signed) } : {}),
        fee,
        address: signer.address,
        txId: txIdOf(signed),
      };
    }
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

/** best-effort transaction id of a signed tx, for the sign-only receipt (TRON: txID). */
function txIdOf(signed: SignedTx): string | undefined {
  const s = signed as { txID?: unknown; hash?: unknown } | null;
  const id = s?.txID ?? s?.hash;
  return typeof id === "string" ? id : undefined;
}
