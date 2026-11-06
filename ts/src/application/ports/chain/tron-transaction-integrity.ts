import type { TronTransactionArtifact } from "../../../domain/types/index.js";

// Throws tx_integrity unless txID hashes raw_data_hex and raw_data encodes to those bytes.
export type TronTransactionIntegrityCheck = (transaction: TronTransactionArtifact) => void;
