export type KeypairTarget = { out: string } | { name: string };

export interface KeypairWriter {
  write(target: KeypairTarget, value: unknown): string;
}
