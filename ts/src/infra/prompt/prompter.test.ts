// ts/src/infra/prompt/prompter.test.ts
import { describe, it, expect } from "vitest";
import { Prompter, type PromptBackend, type KeyEvent } from "./index.js";

class FakeBackend implements PromptBackend {
  out = "";
  #answers: string[];
  #keys: KeyEvent[];
  constructor(answers: string[] = [], keys: KeyEvent[] = []) { this.#answers = answers; this.#keys = keys; }
  isTTY() { return true; }
  async question(prompt: string, _hidden: boolean) { this.out += prompt; return this.#answers.shift() ?? ""; }
  async readKey() { return this.#keys.shift() ?? { name: "return" }; }
  write(s: string) { this.out += s; }
  beginRaw() {}
  endRaw() {}
}

describe("Prompter.text", () => {
  it("re-prompts until validate passes", async () => {
    const be = new FakeBackend(["", "  ", "ok"]);
    const p = new Prompter(be);
    const v = await p.text({ label: "name", validate: (s) => (s.trim() ? null : "required") });
    expect(v).toBe("ok");
  });
});

describe("Prompter.hidden", () => {
  it("requires the confirm entry to match", async () => {
    const be = new FakeBackend(["Abcdef1!", "nope", "Abcdef1!", "Abcdef1!"]);
    const p = new Prompter(be);
    const v = await p.hidden({ label: "pw", confirm: true });
    expect(v).toBe("Abcdef1!");
  });
  it("re-prompts on validate failure", async () => {
    const be = new FakeBackend(["weak", "Abcdef1!"]);
    const p = new Prompter(be);
    const v = await p.hidden({ label: "pw", validate: (s) => (s.length >= 8 ? null : "too short") });
    expect(v).toBe("Abcdef1!");
  });
});

describe("Prompter.confirm", () => {
  it("expect-mode requires the exact ref", async () => {
    const be = new FakeBackend(["wrong", "wlt_a.0"]);
    const p = new Prompter(be);
    expect(await p.confirm({ label: "type ref", expect: "wlt_a.0" })).toBe(true);
  });
});

describe("Prompter.select", () => {
  it("arrows to an item and returns its value on enter", async () => {
    const be = new FakeBackend([], [{ name: "down" }, { name: "return" }]);
    const p = new Prompter(be);
    const v = await p.select({ label: "pick", choices: [{ value: "a", label: "A" }, { value: "b", label: "B" }] });
    expect(v).toBe("b");
  });
  it("loads more when arrowing past the last item", async () => {
    const be = new FakeBackend([], [{ name: "down" }, { name: "down" }, { name: "return" }]);
    const p = new Prompter(be);
    let loaded = false;
    const v = await p.select({
      label: "pick",
      choices: [{ value: "x0", label: "0" }],
      loadMore: async () => { loaded = true; return [{ value: "x0", label: "0" }, { value: "x1", label: "1" }]; },
    });
    expect(loaded).toBe(true);
    expect(v).toBe("x1");
  });
});
