import { describe, it, expect, vi } from "vitest";
import { SecretResolver } from "./index.js";
import { Prompter, type PromptBackend, type KeyEvent } from "../prompt/index.js";
import { StreamManager } from "../../stream/index.js";

function streams(stdin = ""): StreamManager {
  // out/err captured to no-op; readStdinOnce returns the provided value
  const sm = new StreamManager("text", false, () => {}, () => {});
  vi.spyOn(sm, "readStdinOnce").mockReturnValue(stdin);
  return sm;
}

class Backend implements PromptBackend {
  constructor(private answers: string[], private tty = true) {}
  isTTY() { return this.tty; }
  async question() { return this.answers.shift() ?? ""; }
  async readKey(): Promise<KeyEvent> { return { name: "return" }; }
  write() {}
  beginRaw() {}
  endRaw() {}
}

const PW = "Abcdef1!";

describe("resolveSecret (TTY-only)", () => {
  // mnemonic / private key have NO --*-stdin source; they are entered via a hidden TTY prompt,
  // which re-prompts until the value validates.
  it("prompts (hidden) and validates the mnemonic, retrying until valid", async () => {
    const valid = "legal winner thank year wave sausage worth useful legal winner thank yellow";
    const r = new SecretResolver(streams(), {}, new Prompter(new Backend(["bad phrase", valid])));
    expect(await r.resolveSecret("mnemonic")).toBe(valid);
  });
  it("prompts (hidden) and validates a private key, retrying until valid", async () => {
    const k = "a".repeat(64);
    const r = new SecretResolver(streams(), {}, new Prompter(new Backend(["zzz", k])));
    expect(await r.resolveSecret("privateKey")).toBe(k);
  });
  it("errors with tty_required when there is no terminal", async () => {
    const r = new SecretResolver(streams(), {}, new Prompter(new Backend([], false)));
    await expect(r.resolveSecret("mnemonic")).rejects.toMatchObject({ code: "tty_required" });
  });
});

describe("primePassword", () => {
  it("set mode prompts with confirm + policy, then masterPassword() returns it", async () => {
    const r = new SecretResolver(streams(), {}, new Prompter(new Backend(["weak", PW, PW])));
    await r.primePassword({ mode: "set" });
    expect(r.masterPassword()).toBe(PW);
  });
  it("verify mode re-prompts until verify() passes", async () => {
    const r = new SecretResolver(streams(), {}, new Prompter(new Backend(["nope", PW])));
    await r.primePassword({ mode: "verify", verify: (pw) => pw === PW });
    expect(r.masterPassword()).toBe(PW);
  });
  it("set mode via --password-stdin enforces policy (weak_password)", async () => {
    const r = new SecretResolver(streams("weak\n"), { password: "-" }, new Prompter(new Backend([])));
    await expect(r.primePassword({ mode: "set" })).rejects.toMatchObject({ code: "weak_password" });
  });
  it("verify mode via --password-stdin just caches", async () => {
    const r = new SecretResolver(streams(PW + "\n"), { password: "-" }, new Prompter(new Backend([])));
    await r.primePassword({ mode: "verify", verify: () => true });
    expect(r.masterPassword()).toBe(PW);
  });
  it("verify mode via --password-stdin rejects a wrong password", async () => {
    const r = new SecretResolver(streams("wrong\n"), { password: "-" }, new Prompter(new Backend([])));
    await expect(r.primePassword({ mode: "verify", verify: (pw) => pw === PW })).rejects.toMatchObject({ code: "auth_failed" });
  });
  it("no source and no TTY → auth_required", async () => {
    const r = new SecretResolver(streams(), {}, new Prompter(new Backend([], false)));
    await expect(r.primePassword({ mode: "verify", verify: () => true })).rejects.toMatchObject({ code: "auth_required" });
  });
});

describe("hasMasterPassword", () => {
  it("hasMasterPassword is false with no source/primed even under a TTY (lazy guard must fail fast)", () => {
    const r = new SecretResolver(streams(), {}, new Prompter(new Backend([], /* tty */ true)));
    expect(r.hasMasterPassword()).toBe(false);
  });
});
