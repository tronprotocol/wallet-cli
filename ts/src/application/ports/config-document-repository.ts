/** Atomic read-modify-write boundary for the user-owned configuration document. */
export interface ConfigDocumentRepository {
  update<T>(
    change: (current: Record<string, unknown>) => {
      document: Record<string, unknown>;
      result: T;
    },
  ): T;
}

