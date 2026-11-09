// Writes non-secret complete protobuf hex.
export interface TransactionArtifactWriter {
  write(path: string, hex: string): void;
}
