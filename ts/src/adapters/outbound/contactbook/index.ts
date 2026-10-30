import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ContactRepository } from "../../../application/ports/contact-repository.js";
import type { ChainFamily, ContactEntry } from "../../../domain/types/index.js";
import { ExecutionError } from "../../../domain/errors/index.js";
import {
  createContact,
  hasDuplicateContactName,
  MAX_CONTACTS,
  withContact,
  withoutContact,
} from "../../../domain/contact/index.js";
import { CHAIN_FAMILIES } from "../../../domain/family/index.js";
import { AtomicFileStore } from "../persistence/fs/index.js";

const MAX_CONTACT_FILE_BYTES = 4 * 1024 * 1024;

interface ContactDocument {
  version: 1;
  entries: Partial<Record<ChainFamily, ContactEntry[]>>;
}

export class ContactBook implements ContactRepository {
  readonly #path: string;

  constructor(
    root: string,
    private readonly store: AtomicFileStore,
  ) {
    this.#path = join(root, "contacts.json");
  }

  add(entry: ContactEntry): ContactEntry {
    return this.store.withLock(this.#path, () => {
      const document = this.#read();
      document.entries[entry.family] = withContact(
        allEntries(document),
        document.entries[entry.family] ?? [],
        entry,
      );
      this.store.writeJson(this.#path, document);
      return entry;
    });
  }

  list(family: ChainFamily): ContactEntry[] {
    return [...(this.#read().entries[family] ?? [])].sort((a, b) =>
      a.nameKey.localeCompare(b.nameKey),
    );
  }

  // Return the first match in CHAIN_FAMILIES order; names are unique only within each family.
  findAnywhere(nameKey: string): ContactEntry | undefined {
    const document = this.#read();
    for (const family of CHAIN_FAMILIES) {
      const hit = document.entries[family]?.find((e) => e.nameKey === nameKey);
      if (hit) return hit;
    }
    return undefined;
  }

  find(family: ChainFamily, nameKey: string): ContactEntry | undefined {
    return this.list(family).find((entry) => entry.nameKey === nameKey);
  }

  remove(family: ChainFamily, nameKey: string): ContactEntry {
    return this.store.withLock(this.#path, () => {
      const document = this.#read();
      const { entries, removed } = withoutContact(document.entries[family] ?? [], nameKey);
      document.entries[family] = entries;
      this.store.writeJson(this.#path, document);
      return removed;
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
      root.version !== 1 ||
      !root.entries ||
      typeof root.entries !== "object" ||
      Array.isArray(root.entries)
    ) {
      throw corrupt();
    }
    const result: ContactDocument = { version: 1, entries: {} };
    for (const [key, items] of Object.entries(root.entries as Record<string, unknown>)) {
      const family = key as ChainFamily;
      if (
        !CHAIN_FAMILIES.includes(family) ||
        !Array.isArray(items) ||
        items.length > MAX_CONTACTS
      ) {
        throw corrupt();
      }
      result.entries[family] = items.map((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw corrupt();
        }
        const item = value as Record<string, unknown>;
        if (
          typeof item.name !== "string" ||
          typeof item.address !== "string" ||
          (item.note !== null && item.note !== undefined && typeof item.note !== "string")
        ) {
          throw corrupt();
        }
        // Validate against the bucket's family, not the entry's claimed family.
        const validated = createContact(family, item.name, item.address, item.note ?? undefined);
        if (item.nameKey !== validated.nameKey || item.family !== family) {
          throw corrupt();
        }
        return validated;
      });
    }
    if (hasDuplicateContactName(allEntries(result))) throw corrupt();
    return result;
  }

  // Validate the opened inode with O_NOFOLLOW to avoid a path-check/read race.
  #readSecureJson(): unknown | null {
    let descriptor: number | undefined;
    try {
      descriptor = openSync(
        this.#path,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
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
        throw new ExecutionError("encoding_error", "contacts.json must be a regular file");
      }
      if (stat.size > MAX_CONTACT_FILE_BYTES) {
        throw new ExecutionError("encoding_error", "contacts.json exceeds the 4 MiB limit");
      }
      if (process.platform !== "win32") {
        if ((stat.mode & 0o777) !== 0o600) {
          throw new ExecutionError("insecure_permissions", "contacts.json must have mode 0600");
        }
        if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
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

function allEntries(document: ContactDocument): ContactEntry[] {
  return CHAIN_FAMILIES.flatMap((family) => document.entries[family] ?? []);
}

function corrupt(): ExecutionError {
  return new ExecutionError("encoding_error", "contacts.json has an invalid schema");
}
