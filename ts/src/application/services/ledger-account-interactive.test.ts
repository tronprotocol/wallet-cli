import { describe, it, expect, vi } from "vitest";
import { selectLedgerPath } from "./ledger-account.js";
import { Ledger } from "../../adapters/outbound/ledger/index.js";
import {
  Prompter,
  type PromptBackend,
  type KeyEvent,
} from "../../adapters/inbound/cli/input/prompt/index.js";

class KeyBackend implements PromptBackend {
  constructor(private keys: KeyEvent[]) {}
  isTTY() {
    return true;
  }
  async question() {
    return "";
  }
  async readKey() {
    return this.keys.shift() ?? { name: "return" };
  }
  write() {}
  beginRaw() {}
  endRaw() {}
}

describe("selectLedgerPath", () => {
  it("derives a page, paginates, and returns the chosen path", async () => {
    const ledger = new Ledger();
    vi.spyOn(ledger, "getAddress").mockImplementation(async (_f, path) => `addr-for-${path}`);
    // Two downward keys load the next page before selection.
    const prompter = new Prompter(
      new KeyBackend([{ name: "down" }, { name: "down" }, { name: "return" }]),
    );
    const path = await selectLedgerPath(ledger, "tron", prompter, 2);
    expect(path).toContain("m/44'");
  });
});
