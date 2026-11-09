// A stored file in an older format than this build reads.
export interface PendingUpgrade {
  path: string;
  from: number;
  to: number;
  // Pre-upgrade backup, never removed automatically.
  backup: string;
}

export interface DataMigrationPlan {
  pending: PendingUpgrade[];
  // True when a pending upgrade decrypts stored secrets.
  needsPassword: boolean;
}

export interface DataMigrations {
  plan(): DataMigrationPlan;
  // Upgrades every pending file or none. Returns the temporary rollback copies left on disk.
  apply(pending: PendingUpgrade[], password?: string): string[];
}
