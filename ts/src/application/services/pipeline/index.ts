import type {
  AccountRef,
  ChainFamily,
  EvmUnsignedTx,
  FeeReport,
  NetworkDescriptor,
  SignedTxOf,
  TronTransactionArtifact,
  TxConfirmation,
  TxOutcome,
  UnsignedTx,
} from "../../../domain/types/index.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";
import { SignerResolver } from "../signer/index.js";
import { errorMessage, inputRef, UsageError } from "../../../domain/errors/index.js";
import { OWNER_PERMISSION_ID } from "../../../domain/tron/permission/index.js";
import type { SignOrigin, SigningService } from "../signing/signing-service.js";
import { localTxId as txIdOf } from "../broadcast-identity.js";
import type { Broadcaster } from "../../ports/chain/broadcaster.js";
import { waitsForConfirmation, type TransactionExecutionMode } from "../transaction-mode.js";
import { submitAndStage } from "../submit-and-stage.js";

export interface SignerAuthorization {
  // Sign-only may collect a partial signature; enforce the threshold only before broadcast.
  assertBroadcastable(): void;
}

interface TxPipelineRun<T extends UnsignedTx> {
  ctx: TransactionScope;
  net: NetworkDescriptor;
  account: AccountRef;
  broadcaster: Broadcaster;
  build: (signerAddress: string) => Promise<T>;
  estimate: (tx: T) => Promise<FeeReport>;
  mode: TransactionExecutionMode;
  signerOptions?: { requireSoftware?: boolean };
  // Must encode the complete transaction.
  artifact: (tx: T | SignedTxOf<T>) => string;
  // Returns undefined on timeout; errors preserve the submitted outcome.
  confirm: (txId: string, signed: SignedTxOf<T>) => Promise<TxConfirmation | undefined>;
  // For a step that later steps depend on: a wait that stops on an error throws it.
  confirmationRequired?: boolean;
}

export interface TronLifecycleSteps {
  /** Bind permission/expiration and recompute transaction identity before signing. */
  prepare: (
    tx: TronTransactionArtifact,
    options: { permissionId: number; expiration?: number },
  ) => Promise<TronTransactionArtifact> | TronTransactionArtifact;
  /** Extend a newly built unsigned device transaction before signing. Never used for imports. */
  prepareForSigning: (
    tx: TronTransactionArtifact,
  ) => Promise<TronTransactionArtifact> | TronTransactionArtifact;
  /** Expiry guard, run again after the signer returns. */
  assertNotExpired: (tx: TronTransactionArtifact) => void;
  artifact: (tx: TronTransactionArtifact) => string;
}

export interface TronTxPipelineParams
  extends TxPipelineRun<TronTransactionArtifact>, TronLifecycleSteps {
  permissionId: number;
  expiration?: number;
  // Runs before key decryption or device interaction and returns a post-signing broadcast gate.
  // Null skips the online permission-approval check.
  preflight:
    ((tx: TronTransactionArtifact, signerAddress: string) => Promise<SignerAuthorization>) | null;
}

export interface EvmTxPipelineParams extends TxPipelineRun<EvmUnsignedTx> {
  // EVM has no permission groups or caller-set expiration; only the defaults are accepted.
  permissionId?: number;
  expiration?: number;
}

interface LifecycleSteps<T extends UnsignedTx> {
  prepare: (tx: T) => Promise<T> | T;
  // Runs only for a device signer.
  prepareForSigning: (tx: T) => Promise<T> | T;
  assertNotExpired: (tx: T | SignedTxOf<T>) => void;
  preflight: (tx: T, signerAddress: string) => Promise<SignerAuthorization | undefined>;
}

export class TxPipeline {
  constructor(
    private readonly signers: SignerResolver,
    private readonly signing: SigningService,
  ) {}

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
    // Where the transaction came from; it was not built by this pipeline.
    origin: Exclude<SignOrigin, "built">;
  }): Promise<TxOutcome> {
    this.assertCanSign(p.account, p.net.family);
    const signer = this.signers.resolve(p.account, p.net.family);
    const signed = await this.signing.sign(p.ctx, {
      network: p.net,
      origin: p.origin,
      signer,
      payload: { kind: "transaction", transaction: p.tx },
    });
    return { stage: "signed", signed, address: signer.address, txId: txIdOf(signed) };
  }

  runTron(p: TronTxPipelineParams): Promise<TxOutcome> {
    return this.#run(p, {
      prepare: (tx) =>
        p.prepare(tx, {
          permissionId: p.permissionId,
          ...(p.expiration === undefined ? {} : { expiration: p.expiration }),
        }),
      // A caller-set expiration is kept as requested.
      prepareForSigning: (tx) => (p.expiration === undefined ? p.prepareForSigning(tx) : tx),
      assertNotExpired: (tx) => p.assertNotExpired(tx),
      preflight: async (tx, signerAddress) =>
        p.preflight ? p.preflight(tx, signerAddress) : undefined,
    });
  }

  runEvm(p: EvmTxPipelineParams): Promise<TxOutcome> {
    return this.#run(p, {
      prepare: (tx) => {
        if (
          (p.permissionId ?? OWNER_PERMISSION_ID) !== OWNER_PERMISSION_ID ||
          p.expiration !== undefined
        ) {
          throw new UsageError(
            "invalid_option",
            errorMessage`this chain adapter cannot apply ${inputRef("permissionId")} or ${inputRef("expiration")}`,
          );
        }
        return tx;
      },
      prepareForSigning: (tx) => tx,
      assertNotExpired: () => {},
      preflight: async () => undefined,
    });
  }

  async #run<T extends UnsignedTx>(
    p: TxPipelineRun<T>,
    steps: LifecycleSteps<T>,
  ): Promise<TxOutcome> {
    const mode = p.mode;
    waitsForConfirmation(p.ctx.wait, mode === "broadcast");

    const deadline = p.ctx.deadline;
    const ownerAddress = p.ctx.resolveAddress(p.net.family);
    deadline.assertActive();
    let tx = await steps.prepare(await p.build(ownerAddress));
    deadline.assertActive();
    const fee = await p.estimate(tx);
    deadline.assertActive();
    if (mode === "dry-run") return { stage: "plan", tx, fee };
    if (mode === "build-only") return { stage: "built", tx, hex: p.artifact(tx), fee };

    this.signers.assertCanSign(p.account, p.net.family, p.signerOptions);
    const signer = this.signers.resolve(p.account, p.net.family);
    if (signer.address !== ownerAddress) {
      throw new UsageError(
        "invalid_account",
        "resolved signer address changed during transaction construction",
      );
    }
    if (signer.kind === "device") tx = await steps.prepareForSigning(tx);
    steps.assertNotExpired(tx);
    const authorization = await steps.preflight(tx, signer.address);
    const signed = await this.signing.sign(p.ctx, {
      network: p.net,
      origin: "built",
      signer,
      payload: { kind: "transaction", transaction: tx },
    });

    steps.assertNotExpired(signed);

    if (mode === "sign-only") {
      return {
        stage: "signed",
        signed,
        hex: p.artifact(signed),
        fee,
        address: signer.address,
        txId: txIdOf(signed),
      };
    }
    authorization?.assertBroadcastable();
    return submitAndStage(
      p.net.family,
      p.ctx,
      txIdOf(signed),
      (check) => p.broadcaster.broadcast(signed, check),
      (txId) => p.confirm(txId, signed),
      { confirmationRequired: p.confirmationRequired === true },
    );
  }
}
