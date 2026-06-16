/**
 * Services — the shared infra bundle that command modules close over (dependency
 * injection so commands stay plugins and the shell never imports them). (plan §2 note)
 */
import type { Keystore } from "../keystore/index.js";
import type { Ledger } from "../ledger/index.js";
import type { SignerResolver } from "../signer/index.js";
import type { TxPipeline } from "../pipeline/index.js";
import type { CapabilityRegistry } from "../chain/index.js";

export interface Services {
  keystore: Keystore;
  ledger: Ledger;
  signerResolver: SignerResolver;
  txPipeline: TxPipeline;
  capabilityRegistry: CapabilityRegistry;
}
