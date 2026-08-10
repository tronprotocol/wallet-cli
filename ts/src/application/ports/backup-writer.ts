export interface BackupWriteResult {
  out: string;
  fileMode: "0600";
  bytes: number;
}

/** Which default filename suffix an export lands under when no --out is given: the native backup
 *  format or a standard Web3 keystore. Explicit --out paths are used verbatim either way. */
export type BackupFormat = "native" | "keystore";

export interface BackupWriter {
  write(
    accountId: string,
    requestedPath: string | undefined,
    payload: unknown,
    format?: BackupFormat,
  ): BackupWriteResult;
}
