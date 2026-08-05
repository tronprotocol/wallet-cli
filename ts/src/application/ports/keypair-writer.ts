/**
 * Outbound boundary for persisting a generated keypair.
 *
 * The caller states intent and the adapter decides where that lands: either an explicit path the
 * user named, or the name the artifact should be filed under. Filesystem layout is not something a
 * use case should know, and the two forms are exclusive — a supplied path leaves nothing to derive.
 */
export type KeypairTarget = { out: string } | { name: string };

export interface KeypairWriter {
  write(target: KeypairTarget, value: unknown): string;
}
