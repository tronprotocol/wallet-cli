import { describe, expect, it } from "vitest";
import { createTimedFetch } from "./timed-fetch.js";
import { MAX_HTTP_RESPONSE_BYTES } from "./http-response.js";

const ok = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers });

describe("createTimedFetch", () => {
  it("passes the response through when it is prompt and small", async () => {
    const fetchImpl = async () => ok('{"code":0}');
    const response = await createTimedFetch({ timeoutMs: 1000, fetchImpl })("https://x.test");
    expect(await response.text()).toBe('{"code":0}');
  });

  it("forwards the caller's method, headers and body", async () => {
    let seen: { url: unknown; init?: RequestInit } | undefined;
    const fetchImpl = async (url: any, init?: RequestInit) => {
      seen = { url, init };
      return ok("{}");
    };
    await createTimedFetch({ timeoutMs: 1000, fetchImpl })("https://x.test/p", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: "hi",
    });
    expect(seen?.url).toBe("https://x.test/p");
    expect(seen?.init?.method).toBe("POST");
    expect(seen?.init?.body).toBe("hi");
  });

  // A remote that accepts the connection and then stalls is the case a missing timeout turns
  // into a hung CLI, so the deadline has to fire on the wait itself, not only on connect.
  it("aborts a response that never arrives", async () => {
    const fetchImpl = (_url: any, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    await expect(
      createTimedFetch({ timeoutMs: 20, fetchImpl })("https://x.test"),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("refuses a body over the cap while it is still streaming", async () => {
    const fetchImpl = async () => ok("0123456789");
    await expect(
      createTimedFetch({ timeoutMs: 1000, maxBytes: 4, fetchImpl })("https://x.test"),
    ).rejects.toMatchObject({ code: "response_too_large" });
  });

  // A declared length over the cap is refused on the header alone: the body here is one byte, so
  // only the header can be what rejected it. That is the cheap half of the defence — the
  // streaming check above is what catches a remote that lies about its length or omits it.
  it("refuses on a declared content-length over the cap", async () => {
    const fetchImpl = async () => ok("x", { "content-length": "999" });
    await expect(
      createTimedFetch({ timeoutMs: 1000, maxBytes: 4, fetchImpl })("https://x.test"),
    ).rejects.toMatchObject({ code: "response_too_large" });
  });

  it("defaults to the shared CLI cap", async () => {
    const fetchImpl = async () => ok("x".repeat(1024));
    const response = await createTimedFetch({ timeoutMs: 1000, fetchImpl })("https://x.test");
    expect((await response.text()).length).toBe(1024);
    expect(MAX_HTTP_RESPONSE_BYTES).toBeGreaterThan(1024);
  });
});
