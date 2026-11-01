import { describe, expect, it } from "vitest";
import { createTimedFetch } from "./timed-fetch.js";
import { MAX_HTTP_RESPONSE_BYTES } from "./http-response.js";
import { DeadlineExpiredError } from "../../../application/contracts/deadline.js";
import {
  CommandDeadline,
  requestDispatchCheck,
} from "../../../application/services/command-deadline.js";

const NO_CHECK = requestDispatchCheck(new CommandDeadline(0));

const ok = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers });

describe("createTimedFetch", () => {
  it("passes the response through when it is prompt and small", async () => {
    const fetchImpl = async () => ok('{"code":0}');
    const response = await createTimedFetch({ check: NO_CHECK, fetchImpl })("https://x.test");
    expect(await response.text()).toBe('{"code":0}');
  });

  it("forwards the caller's method, headers and body", async () => {
    let seen: { url: unknown; init?: RequestInit } | undefined;
    const fetchImpl = async (url: any, init?: RequestInit) => {
      seen = { url, init };
      return ok("{}");
    };
    await createTimedFetch({ check: NO_CHECK, fetchImpl })("https://x.test/p", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: "hi",
    });
    expect(seen?.url).toBe("https://x.test/p");
    expect(seen?.init?.method).toBe("POST");
    expect(seen?.init?.body).toBe("hi");
  });

  it("aborts a response that never arrives", async () => {
    const fetchImpl = (_url: any, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    await expect(
      createTimedFetch({ check: requestDispatchCheck(new CommandDeadline(20)), fetchImpl })(
        "https://x.test",
      ),
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("refuses an expired deadline before the request is sent", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return ok("{}");
    };
    const deadline = new CommandDeadline(1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await expect(
      createTimedFetch({ check: requestDispatchCheck(deadline), fetchImpl })("https://x.test"),
    ).rejects.toBeInstanceOf(DeadlineExpiredError);
    expect(calls).toBe(0);
  });

  it("refuses a body over the cap while it is still streaming", async () => {
    const fetchImpl = async () => ok("0123456789");
    await expect(
      createTimedFetch({ check: NO_CHECK, maxBytes: 4, fetchImpl })("https://x.test"),
    ).rejects.toMatchObject({ code: "response_too_large" });
  });

  it("refuses on a declared content-length over the cap", async () => {
    const fetchImpl = async () => ok("x", { "content-length": "999" });
    await expect(
      createTimedFetch({ check: NO_CHECK, maxBytes: 4, fetchImpl })("https://x.test"),
    ).rejects.toMatchObject({ code: "response_too_large" });
  });

  it("defaults to the shared CLI cap", async () => {
    const fetchImpl = async () => ok("x".repeat(1024));
    const response = await createTimedFetch({ check: NO_CHECK, fetchImpl })("https://x.test");
    expect((await response.text()).length).toBe(1024);
    expect(MAX_HTTP_RESPONSE_BYTES).toBeGreaterThan(1024);
  });
});
