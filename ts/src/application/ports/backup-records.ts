/**
 * Backup-record store — the local audit trail of SECRET EXPORTS.
 *
 * Purpose is forensic: "which account's secret left this machine, when, and into which file". Only
 * exports are recorded (`backup`, `backup --keystore`); imports are not — an import brings material
 * in, it does not put any at risk. A record is appended only after the file is actually written, so
 * the log never claims an export that failed.
 *
 * Every field is a SNAPSHOT taken at export time and never re-resolved on read: the account may have
 * been renamed or deleted since, and the audit answer must still be the truth as it was then.
 */
export interface BackupRecord {
  /** written in command form so the two export shapes are self-describing in the log. */
  operation: "backup" | "backup --keystore";
  /** the account whose secret was exported (its local id at the time). */
  accountId: string;
  /**
   * The exported key's on-chain address — the identity that outlives the local id.
   *
   * For `backup --keystore` this is the address of the family whose key was written, NOT the
   * account's TRON address: a seed account holds a different key per family (§1.2), and logging
   * one family's export under another family's address makes the trail name the wrong key.
   */
  account: string;
  /**
   * The family whose key was exported, when exactly one was.
   *
   * Absent for a native `backup`: a mnemonic (or a raw private key) covers every family at once,
   * so naming one of them would be a narrower claim than what actually left the machine.
   */
  family?: string;
  label: string | null;
  /** the file the secret was written to (absolute path, as reported by the writer). */
  out: string;
  /** UTC ISO-8601, second precision. */
  timestamp: string;
}

export interface BackupRecordStore {
  /** Append one export. Retention is the store's business; callers never prune. */
  append(record: BackupRecord): void;
  /** Every retained record, newest first. */
  list(): BackupRecord[];
}
