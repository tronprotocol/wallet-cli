export interface BackupWriteResult {
  out: string;
  fileMode: "0600";
  bytes: number;
}

export interface BackupWriter {
  write(accountId: string, requestedPath: string | undefined, payload: unknown): BackupWriteResult;
}
