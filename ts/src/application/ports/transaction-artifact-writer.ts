/** Outbound boundary for publishing a non-secret transaction artifact (complete protobuf hex). */
export interface TransactionArtifactWriter {
  write(path: string, hex: string): void;
}
