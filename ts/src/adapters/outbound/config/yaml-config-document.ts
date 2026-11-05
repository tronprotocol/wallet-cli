import { existsSync, readFileSync } from "node:fs";
import { stringify } from "yaml";
import type {
  ConfigDocument,
  ConfigDocumentRepository,
} from "../../../application/ports/config-document-repository.js";
import type { AtomicFileStore } from "../persistence/fs/index.js";
import { parseConfigYaml } from "./index.js";

export class YamlConfigDocument implements ConfigDocumentRepository {
  constructor(
    private readonly path: string,
    private readonly files: AtomicFileStore,
  ) {}

  update<T>(
    change: (current: ConfigDocument) => {
      document: ConfigDocument;
      result: T;
    },
  ): T {
    return this.files.withLock(this.path, () => {
      const current = existsSync(this.path)
        ? (parseConfigYaml(readFileSync(this.path, "utf8"), this.path) as ConfigDocument)
        : {};
      const { document, result } = change(current);
      this.files.writeText(this.path, stringify(document));
      return result;
    });
  }
}
