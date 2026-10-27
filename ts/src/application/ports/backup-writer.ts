export interface BackupWriteResult {
  out: string;
  fileMode: "0600";
  bytes: number;
}

// Selects the default filename suffix; explicit output paths are used verbatim.
export type BackupFormat = "native" | "keystore";

export interface BackupWriter {
  write(
    accountId: string,
    requestedPath: string | undefined,
    payload: unknown,
    format?: BackupFormat,
  ): BackupWriteResult;
}
