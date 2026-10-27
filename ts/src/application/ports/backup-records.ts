// Append only after a successful secret export; fields are snapshots, never re-resolved.
export interface BackupRecord {
  operation: "backup" | "backup --keystore";
  accountId: string;
  // On-chain address of the exported key in its own family.
  account: string;
  // Exported key family; absent for native backups that cover every family.
  family?: string;
  label: string | null;
  // Absolute output path.
  out: string;
  // UTC ISO-8601, second precision.
  timestamp: string;
}

export interface BackupRecordStore {
  append(record: BackupRecord): void;
  // Newest first.
  list(): BackupRecord[];
}
