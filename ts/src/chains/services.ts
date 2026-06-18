/**
 * Services — the shared infra bundle that command modules close over (dependency
 * injection so commands stay plugins and the shell never imports them). (plan §2 note)
 */
import type { Keystore } from "../infra/keystore/index.js";
import type { Ledger } from "../infra/ledger/index.js";
import type { SignerResolver } from "../runtime/signer/index.js";
import type { TxPipeline } from "../runtime/pipeline/index.js";
import type { CapabilityRegistry } from "../runtime/chain/index.js";

export interface Services {
  keystore: Keystore;
  ledger: Ledger;
  signerResolver: SignerResolver;
  txPipeline: TxPipeline;
  capabilityRegistry: CapabilityRegistry;
}
