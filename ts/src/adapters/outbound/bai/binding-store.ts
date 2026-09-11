import { createHash } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import type { BaiBindingStore } from "../../../application/ports/bai-binding-store.js";
import { AtomicFileStore } from "../persistence/fs/index.js";

const record = z.object({ version: z.literal(1), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) });
/** Stores only the last confirmed combination; never a second copy of the credential. */
export class FileBaiBindingStore implements BaiBindingStore {
  private readonly path: string;
  constructor(
    root: string,
    private readonly store: AtomicFileStore,
  ) {
    this.path = join(root, "bai-binding.json");
  }
  isConfirmed(apiKey: string, chain: string, address: string): boolean {
    const value = record.safeParse(this.store.readJson<unknown>(this.path));
    return value.success && value.data.fingerprint === this.fingerprint(apiKey, chain, address);
  }
  confirm(apiKey: string, chain: string, address: string): void {
    this.store.withLock(this.path, () =>
      this.store.writeJson(this.path, {
        version: 1,
        fingerprint: this.fingerprint(apiKey, chain, address),
      }),
    );
  }
  private fingerprint(apiKey: string, chain: string, address: string): string {
    return createHash("sha256")
      .update(JSON.stringify(["bai-binding-v1", apiKey, chain, address]))
      .digest("hex");
  }
}
