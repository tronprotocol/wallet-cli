import { describe, it, expect } from "vitest";
import { Prompter, type PromptBackend, type KeyEvent } from "./index.js";
import { CommandDeadline } from "../../../../../application/services/command-deadline.js";
import { DeadlineExpiredError } from "../../../../../application/contracts/deadline.js";

class FakeBackend implements PromptBackend {
  out = "";
  #answers: string[];
  #keys: KeyEvent[];
  constructor(answers: string[] = [], keys: KeyEvent[] = []) {
    this.#answers = answers;
    this.#keys = keys;
  }
  isTTY() {
    return true;
  }
  async question(prompt: string, _hidden: boolean) {
    this.out += prompt;
    return this.#answers.shift() ?? "";
  }
  async readKey() {
    return this.#keys.shift() ?? { name: "return" };
  }
  write(s: string) {
    this.out += s;
  }
  beginRaw() {}
  endRaw() {}
}

describe("Prompter.setInteractive", () => {
  it("forces isTTY false when interaction is disabled, even on a real TTY", () => {
    const p = new Prompter(new FakeBackend());
    expect(p.isTTY()).toBe(true);
    p.setInteractive(false);
    expect(p.isTTY()).toBe(false);
    p.setInteractive(true);
    expect(p.isTTY()).toBe(true);
  });
});

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
    const v = await p.hidden({
      label: "pw",
      validate: (s) => (s.length >= 8 ? null : "too short"),
    });
    expect(v).toBe("Abcdef1!");
  });
});

describe("Prompter.confirm", () => {
  it("expect-mode returns true only when the exact ref is typed", async () => {
    const ok = new Prompter(new FakeBackend(["wlt_a.0"]));
    expect(await ok.confirm({ label: "type ref", expect: "wlt_a.0" })).toBe(true);
    const no = new Prompter(new FakeBackend(["wrong"]));
    expect(await no.confirm({ label: "type ref", expect: "wlt_a.0" })).toBe(false);
  });
});

describe("Prompter.select", () => {
  it("arrows to an item and returns its value on enter", async () => {
    const be = new FakeBackend([], [{ name: "down" }, { name: "return" }]);
    const p = new Prompter(be);
    const v = await p.select({
      label: "pick",
      choices: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    });
    expect(v).toBe("b");
  });
  it("loads more when arrowing past the last item", async () => {
    const be = new FakeBackend([], [{ name: "down" }, { name: "down" }, { name: "return" }]);
    const p = new Prompter(be);
    let loaded = false;
    const v = await p.select({
      label: "pick",
      choices: [{ value: "x0", label: "0" }],
      loadMore: async () => {
        loaded = true;
        return [
          { value: "x0", label: "0" },
          { value: "x1", label: "1" },
        ];
      },
    });
    expect(loaded).toBe(true);
    expect(v).toBe("x1");
  });
  it("advances onto the newly loaded item after a single down past the end", async () => {
    const be = new FakeBackend([], [{ name: "down" }, { name: "return" }]);
    const p = new Prompter(be);
    const v = await p.select({
      label: "pick",
      choices: [{ value: "x0", label: "0" }],
      loadMore: async () => [
        { value: "x0", label: "0" },
        { value: "x1", label: "1" },
      ],
    });
    expect(v).toBe("x1");
  });
});

describe("Prompter pauses the command clock", () => {
  function counting() {
    const log: string[] = [];
    return {
      log,
      clock: {
        assertActive: () => {},
        pause: () => {
          log.push("pause");
          return () => log.push("resume");
        },
      },
    };
  }

  it("only while the backend awaits an answer, and resumes after a failure", async () => {
    const { log, clock } = counting();
    const be = new FakeBackend(["", "ok"]);
    const question = be.question.bind(be);
    be.question = async (prompt, hidden) => {
      log.push("ask");
      return question(prompt, hidden);
    };
    const p = new Prompter(be, clock);
    await p.text({
      label: "name",
      validate: (s) => {
        log.push("validate");
        return s ? null : "required";
      },
    });
    expect(log).toEqual([
      "pause",
      "ask",
      "resume",
      "validate",
      "pause",
      "ask",
      "resume",
      "validate",
    ]);

    log.length = 0;
    be.question = async () => {
      throw new Error("closed");
    };
    await expect(p.text({ label: "name" })).rejects.toThrow("closed");
    expect(log).toEqual(["pause", "resume"]);
  });

  it("around each key read of a select", async () => {
    const { log, clock } = counting();
    const p = new Prompter(new FakeBackend([], [{ name: "down" }, { name: "return" }]), clock);
    await p.select({
      label: "pick",
      choices: [
        { value: 1, label: "a" },
        { value: 2, label: "b" },
      ],
    });
    expect(log).toEqual(["pause", "resume", "pause", "resume"]);
  });

  it("opens no prompt once validation has used up the time", async () => {
    let now = 0;
    const deadline = new CommandDeadline(1_000, 0, { now: () => now });
    const be = new FakeBackend(["bad", "good"]);
    const p = new Prompter(be, deadline);
    await expect(
      p.text({
        label: "name",
        validate: (s) => {
          now = 1_001;
          return s === "good" ? null : "invalid";
        },
      }),
    ).rejects.toBeInstanceOf(DeadlineExpiredError);
    expect(be.out.split("name: ")).toHaveLength(2);
    deadline.dispose();
  });

  it("opens no prompt or key read on an expired deadline", async () => {
    const deadline = new CommandDeadline(10, 0, { now: () => 10 });
    const be = new FakeBackend(["x"], [{ name: "return" }]);
    const p = new Prompter(be, deadline);
    await expect(p.hidden({ label: "password" })).rejects.toBeInstanceOf(DeadlineExpiredError);
    await expect(
      p.select({ label: "pick", choices: [{ value: 1, label: "a" }] }),
    ).rejects.toBeInstanceOf(DeadlineExpiredError);
    expect(be.out).not.toContain("password");
    deadline.dispose();
  });
});
