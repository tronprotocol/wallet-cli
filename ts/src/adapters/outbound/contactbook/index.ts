import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import type { ContactRepository } from "../../../application/ports/contact-repository.js";
import type {
  ChainFamily,
  ContactEntry,
} from "../../../domain/types/index.js";
import {
  ExecutionError,
  UsageError,
} from "../../../domain/errors/index.js";
import { createContact } from "../../../domain/contact/index.js";
import { AtomicFileStore } from "../persistence/fs/index.js";

const MAX_CONTACT_FILE_BYTES = 4 * 1024 * 1024;
const MAX_CONTACTS = 10_000;

interface ContactDocument {
  version: 1;
  entries: Partial<Record<ChainFamily, ContactEntry[]>>;
}

export class ContactBook implements ContactRepository {
  readonly #path: string;

  constructor(root: string, private readonly store: AtomicFileStore) {
    this.#path = join(root, "contacts.json");
  }

  add(entry: ContactEntry): ContactEntry {
    return this.store.withLock(this.#path, () => {
      const document = this.#read();
      const entries = document.entries[entry.family] ?? [];
      if (entries.some((item) => item.nameKey === entry.nameKey)) {
        throw new UsageError(
          "already_exists",
          `contact already exists: ${entry.name}`,
        );
      }
      if (entries.length >= MAX_CONTACTS) {
        throw new UsageError(
          "limit_exceeded",
          `contact book cannot exceed ${MAX_CONTACTS} entries`,
        );
      }
      entries.push(entry);
      document.entries[entry.family] = entries.sort((a, b) =>
        a.nameKey.localeCompare(b.nameKey)
      );
      this.store.writeJson(this.#path, document);
      return entry;
    });
  }

  list(family: ChainFamily): ContactEntry[] {
    return [...(this.#read().entries[family] ?? [])].sort((a, b) =>
      a.nameKey.localeCompare(b.nameKey)
    );
  }

  find(
    family: ChainFamily,
    nameKey: string,
  ): ContactEntry | undefined {
    return this.list(family).find((entry) => entry.nameKey === nameKey);
  }

  remove(family: ChainFamily, nameKey: string): ContactEntry {
    return this.store.withLock(this.#path, () => {
      const document = this.#read();
      const entries = document.entries[family] ?? [];
      const index = entries.findIndex((entry) => entry.nameKey === nameKey);
      if (index < 0) {
        throw new UsageError(
          "not_found",
          `contact not found: ${nameKey}`,
        );
      }
      const [removed] = entries.splice(index, 1);
      document.entries[family] = entries;
      this.store.writeJson(this.#path, document);
      return removed!;
    });
  }

  #read(): ContactDocument {
    const raw = this.#readSecureJson();
    if (raw === null) return { version: 1, entries: {} };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw corrupt();
    }
    const root = raw as Record<string, unknown>;
    if (
      root.version !== 1
      || !root.entries
      || typeof root.entries !== "object"
      || Array.isArray(root.entries)
    ) {
      throw corrupt();
    }
    const result: ContactDocument = { version: 1, entries: {} };
    for (
      const [family, items]
      of Object.entries(root.entries as Record<string, unknown>)
    ) {
      if (
        family !== "tron"
        || !Array.isArray(items)
        || items.length > MAX_CONTACTS
      ) {
        throw corrupt();
      }
      const seen = new Set<string>();
      result.entries.tron = items.map((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw corrupt();
        }
        const item = value as Record<string, unknown>;
        if (
          typeof item.name !== "string"
          || typeof item.address !== "string"
          || (
            item.note !== null
            && item.note !== undefined
            && typeof item.note !== "string"
          )
        ) {
          throw corrupt();
        }
        const validated = createContact(
          "tron",
          item.name,
          item.address,
          item.note ?? undefined,
        );
        if (
          item.nameKey !== validated.nameKey
          || item.family !== "tron"
          || seen.has(validated.nameKey)
        ) {
          throw corrupt();
        }
        seen.add(validated.nameKey);
        return validated;
      });
    }
    return result;
  }

  /** Open with O_NOFOLLOW, then validate the opened inode to avoid lstat/read TOCTOU. */
  #readSecureJson(): unknown | null {
    let descriptor: number | undefined;
    try {
      descriptor = openSync(
        this.#path,
        constants.O_RDONLY
          | (constants.O_NOFOLLOW ?? 0)
          | (constants.O_NONBLOCK ?? 0),
      );
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return null;
      if (code === "ELOOP") {
        throw new ExecutionError(
          "insecure_permissions",
          "contacts.json must not be a symbolic link",
        );
      }
      throw error;
    }
    try {
      const stat = fstatSync(descriptor);
      if (!stat.isFile()) {
        throw new ExecutionError(
          "encoding_error",
          "contacts.json must be a regular file",
        );
      }
      if (stat.size > MAX_CONTACT_FILE_BYTES) {
        throw new ExecutionError(
          "encoding_error",
          "contacts.json exceeds the 4 MiB limit",
        );
      }
      if (process.platform !== "win32") {
        if ((stat.mode & 0o777) !== 0o600) {
          throw new ExecutionError(
            "insecure_permissions",
            "contacts.json must have mode 0600",
          );
        }
        if (
          typeof process.getuid === "function"
          && stat.uid !== process.getuid()
        ) {
          throw new ExecutionError(
            "insecure_permissions",
            "contacts.json must be owned by the current user",
          );
        }
      }
      const text = readFileSync(descriptor, "utf8");
      if (text.trim() === "") return null;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw corrupt();
      }
    } finally {
      closeSync(descriptor);
    }
  }
}

function corrupt(): ExecutionError {
  return new ExecutionError(
    "encoding_error",
    "contacts.json has an invalid schema",
  );
}
