/**
 * TxPipeline (L3) — the shared signing flow for every tx command:
 * resolve signer → build → estimate → (dry-run?) → sign → (broadcast?).
 * The Ledger "print wait + timeout + abort" dance lives here, not in each command (修正①/§3 L3).
 * Chain-specific build/estimate come in as callbacks.
 */
import type {
  AccountRef,
  ExecutionContext,
  FeeReport,
  NetworkDescriptor,
  SignedTx,
  TxOutcome,
  UnsignedTx,
} from "../types/index.js";
import { SignerResolver } from "../signer/index.js";
import { ChainError } from "../errors/index.js";

export interface TxPipelineParams {
  ctx: ExecutionContext;
  net: NetworkDescriptor;
  account: AccountRef;
  build: (signerAddress: string) => Promise<UnsignedTx>;
  estimate: (tx: UnsignedTx) => Promise<FeeReport>;
  dryRun: boolean;
  broadcast: boolean;
}

export function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new ChainError("timeout", `operation timed out after ${ms}ms`));
    }, ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export class TxPipeline {
  constructor(private readonly signers: SignerResolver) {}

  async run(p: TxPipelineParams): Promise<TxOutcome> {
    const { streams, timeoutMs, noDeviceWait } = p.ctx;
    const signer = this.signers.resolve(p.account, p.net.family);

    // every network/sign step is bounded by --timeout (a hung RPC must not hang the CLI).
    // build/estimate never touch the device → a failing tx never asks for a Ledger tap.
    const tx = await withTimeout(p.build(signer.address), timeoutMs, () => {});
    const fee = await withTimeout(p.estimate(tx), timeoutMs, () => {});
    if (p.dryRun) return { stage: "plan", tx, fee };

    let signed: SignedTx;
    if (signer.kind === "device") {
      await signer.precheck?.();
      if (noDeviceWait) throw new ChainError("signing_rejected", "--no-device-wait set; refusing to wait for device");
      streams.diagnostic("warn", "waiting for device confirmation…");
      const ac = new AbortController();
      signed = await withTimeout(signer.sign(tx, { signal: ac.signal }), timeoutMs, () => ac.abort());
    } else {
      signed = await withTimeout(signer.sign(tx, {}), timeoutMs, () => {});
    }

    if (!p.broadcast) return { stage: "signed", signed, fee };
    const result = await withTimeout(p.net.rpc!.broadcast(signed), timeoutMs, () => {});
    return { stage: "broadcast", ...result };
  }
}
