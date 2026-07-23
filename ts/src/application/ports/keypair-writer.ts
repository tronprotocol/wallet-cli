export interface KeypairWriter {
  write(path: string, value: unknown): string;
}
