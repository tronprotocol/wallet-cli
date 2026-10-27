// Atomic read-modify-write of the user configuration.
export interface ConfigDocumentRepository {
  update<T>(
    change: (current: Record<string, unknown>) => {
      document: Record<string, unknown>;
      result: T;
    },
  ): T;
}
