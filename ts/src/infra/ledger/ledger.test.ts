import { describe, it, expect, vi } from "vitest";
import { Ledger, interactiveLedgerSelect } from "./index.js";
import { Prompter, type PromptBackend, type KeyEvent } from "../prompt/index.js";

class KeyBackend implements PromptBackend {
  constructor(private keys: KeyEvent[]) {}
  isTTY() { return true; }
  async question() { return ""; }
  async readKey() { return this.keys.shift() ?? { name: "return" }; }
  write() {}
  beginRaw() {}
  endRaw() {}
}

describe("interactiveLedgerSelect", () => {
  it("derives a page, paginates, and returns the chosen path", async () => {
    const ledger = new Ledger();
    vi.spyOn(ledger, "getAddress").mockImplementation(async (_f, path) => `addr-for-${path}`);
    // pageSize 2: page0 = idx0,idx1; arrow down twice -> loadMore -> idx2; enter
    const prompter = new Prompter(new KeyBackend([{ name: "down" }, { name: "down" }, { name: "return" }]));
    const path = await interactiveLedgerSelect(ledger, "tron", prompter, 2);
    expect(path).toContain("m/44'"); // a real BIP32 path was selected
  });
});
