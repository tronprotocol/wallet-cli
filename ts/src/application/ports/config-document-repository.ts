// A parsed YAML value; keys the application does not know are kept on write.
export type ConfigDocumentValue =
  string | number | boolean | null | ConfigDocumentValue[] | ConfigDocument;

export interface ConfigDocument {
  [key: string]: ConfigDocumentValue;
}

// Atomic read-modify-write of the user configuration.
export interface ConfigDocumentRepository {
  update<T>(
    change: (current: ConfigDocument) => {
      document: ConfigDocument;
      result: T;
    },
  ): T;
}
