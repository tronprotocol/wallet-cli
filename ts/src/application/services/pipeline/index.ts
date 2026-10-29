import type {
  AccountRef,
  ChainFamily,
  FeeReport,
  NetworkDescriptor,
  SignedTx,
  TxOutcome,
  UnsignedTx,
} from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import { SignerResolver } from "../signer/index.js";
import { UsageError } from "../../../domain/errors/index.js";
import { obtainSignature } from "../signing/obtain-signature.js";
import { authoritativeTxId, localTxId as txIdOf, submitWithTxId } from "../broadcast-identity.js";
import type { Broadcaster } from "../../ports/chain/broadcaster.js";
import type { TransactionExecutionMode } from "../transaction-mode.js";

export interface SignerAuthorization {
  // Sign-only may collect a partial signature; enforce the threshold only before broadcast.
  assertBroadcastable(): void;
}

export interface TxPipelineParams {
  ctx: TransactionScope;
  net: NetworkDescriptor;
  account: AccountRef;
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
  prepare?: (
    tx: UnsignedTx,
    options: { permissionId: number; expiration?: number },
  ) => Promise<UnsignedTx> | UnsignedTx;
  /** Extend a newly built unsigned device transaction before signing. Never used for imports. */
  prepareForSigning?: (tx: UnsignedTx, timeoutMs: number) => Promise<UnsignedTx> | UnsignedTx;
  /** Chain-specific expiry guard, including a second check after the signer returns. */
  assertNotExpired?: (tx: UnsignedTx | SignedTx) => void;
  // Required for build-only; must encode the complete transaction.
  artifact?: (tx: UnsignedTx | SignedTx) => string;
  // Runs before key decryption or device interaction; may return a post-signing broadcast gate.
  preflight?: (tx: UnsignedTx, signerAddress: string) => Promise<SignerAuthorization | void>;
  // Returns undefined on timeout; errors preserve the submitted outcome.
  confirm?: (txId: string) => Promise<Record<string, unknown> | undefined>;
}

export class TxPipeline {
  constructor(private readonly signers: SignerResolver) {}

  assertCanSign(
    account: AccountRef,
    family: ChainFamily,
    opts?: { requireSoftware?: boolean },
  ): void {
    this.signers.assertCanSign(account, family, opts);
  }

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
    const mode: TransactionExecutionMode =
      p.mode ??
      (p.dryRun ? "dry-run" : p.buildOnly ? "build-only" : p.broadcast ? "broadcast" : "sign-only");
    if (p.ctx.wait && mode !== "broadcast") {
      throw new UsageError(
        "invalid_option",
        "--wait cannot be used with --dry-run, --sign-only, or --build-only",
      );
    }

    // Adapters bound RPC time; obtainSignature separately bounds device interaction.
    const ownerAddress = p.ctx.resolveAddress(p.net.family);
    let tx = await p.build(ownerAddress);
    if (p.prepare) {
      tx = await p.prepare(tx, {
        permissionId: p.permissionId ?? 0,
        ...(p.expiration === undefined ? {} : { expiration: p.expiration }),
      });
    } else if ((p.permissionId ?? 0) !== 0 || p.expiration !== undefined) {
      throw new UsageError(
        "invalid_option",
        "this chain adapter cannot apply --permission-id or --expiration",
      );
    }
    const fee = await p.estimate(tx);
    if (mode === "dry-run") return { stage: "plan", tx, fee };
    if (mode === "build-only") {
      if (!p.artifact)
        throw new UsageError("invalid_option", "this chain adapter cannot produce transaction hex");
      return { stage: "built", tx, hex: p.artifact(tx), fee };
    }

    this.signers.assertCanSign(p.account, p.net.family, p.signerOptions);
    const signer = this.signers.resolve(p.account, p.net.family);
    if (signer.address !== ownerAddress) {
      throw new UsageError(
        "invalid_account",
        "resolved signer address changed during transaction construction",
      );
    }
    if (signer.kind === "device" && p.expiration === undefined && p.prepareForSigning) {
      tx = await p.prepareForSigning(tx, p.ctx.timeoutMs);
    }
    p.assertNotExpired?.(tx);
    const authorization = await p.preflight?.(tx, signer.address);
    const signed = await obtainSignature(signer, p.ctx, (opts) => signer.sign(tx, opts));

    p.assertNotExpired?.(signed);

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
    authorization?.assertBroadcastable();
    const local = txIdOf(signed);
    const result = await submitWithTxId(local, () => p.broadcaster.broadcast(signed));
    const txId = authoritativeTxId(local, String(result.txId ?? result.hash ?? ""), (m) =>
      p.ctx.warn(m),
    );
    if (!p.ctx.wait || !p.confirm || !txId) {
      if (p.ctx.wait && !txId) {
        p.ctx.warn(
          "--wait requested but the broadcast returned no txid; returning submitted (unconfirmed)",
        );
      }
      return { stage: "submitted", ...result, ...(txId ? { txId } : {}) };
    }
    // Confirmation failure must preserve the already-broadcast transaction.
    let confirmed: Record<string, unknown> | undefined;
    try {
      confirmed = await p.confirm(txId);
    } catch {
      confirmed = undefined;
    }
    if (!confirmed) {
      p.ctx.warn(
        `--wait: ${txId} not confirmed within ${p.ctx.waitTimeoutMs}ms; returning submitted (it may still confirm on-chain)`,
      );
      return { stage: "submitted", ...result, txId };
    }
    return { stage: confirmed.failed ? "failed" : "confirmed", ...result, txId, ...confirmed };
  }
}
