import { describe, expect, it, vi } from "vitest";
import {
  CommandDeadline,
  requestDispatchCheck,
} from "../../../application/services/command-deadline.js";
import { DeadlineExpiredError } from "../../../application/contracts/deadline.js";
import { ChainError, TransportError } from "../../../domain/errors/index.js";
import { expiredCheck } from "./__test-support__/dispatch.js";
import {
  rateLimitDetails,
  requestJson,
  retryAfterSeconds,
  serviceFetch,
  type JsonServiceRequest,
} from "./json-service.js";

const NO_CHECK = requestDispatchCheck(new CommandDeadline(0));

const REQUEST: JsonServiceRequest = {
  service: "Example service",
  check: NO_CHECK,
  errors: {
    timeout: () => new ChainError("timeout", "example timed out"),
    unreachable: () => new TransportError("provider_error", "example unreachable"),
    malformed: (status) => new ChainError("provider_error", `example malformed ${status}`),
  },
};

function serving(response: () => Response) {
  return vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: RequestInit) => response());
}

describe("retryAfterSeconds", () => {
  it("reads unsigned delta-seconds", () => {
    expect(retryAfterSeconds("30")).toBe(30);
    expect(retryAfterSeconds(" 0 ")).toBe(0);
  });

  it("reads an HTTP-date as the seconds until it", () => {
    const future = new Date(Date.now() + 45_000).toUTCString();
    expect(retryAfterSeconds(future)).toBeGreaterThan(40);
    expect(retryAfterSeconds(future)).toBeLessThanOrEqual(45);
  });

  it("gives zero for a past HTTP-date", () => {
    expect(retryAfterSeconds(new Date(Date.now() - 60_000).toUTCString())).toBe(0);
  });

  it.each([null, "soon", "-5", "+5", "", "99999999999999999999"])("ignores %j", (header) => {
    expect(retryAfterSeconds(header)).toBeUndefined();
  });
});

it("carries exactly the status and the Retry-After seconds", () => {
  expect(rateLimitDetails(new Headers({ "retry-after": "7" }))).toEqual({
    httpStatus: 429,
    retryAfterSeconds: 7,
  });
  expect(rateLimitDetails(new Headers())).toEqual({ httpStatus: 429 });
});

describe("requestJson", () => {
  it("decodes the body and refuses redirects", async () => {
    const fetchImpl = serving(() => Response.json({ value: 1 }));
    await expect(
      requestJson(fetchImpl, "https://example.test/a", { method: "GET" }, REQUEST),
    ).resolves.toEqual({ status: 200, ok: true, body: { value: 1 } });
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({ method: "GET", redirect: "error" });
  });

  it("turns a refused redirect into the service's unreachable error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("redirect mode is set to error");
    });
    await expect(requestJson(fetchImpl, "https://example.test", {}, REQUEST)).rejects.toThrow(
      "example unreachable",
    );
  });

  it("maps 429 to provider_rate_limited without reading the body", async () => {
    const cancel = vi.fn();
    const fetchImpl = serving(
      () =>
        new Response(new ReadableStream({ cancel }), {
          status: 429,
          headers: { "retry-after": "12" },
        }),
    );
    const error = await requestJson(fetchImpl, "https://example.test", {}, REQUEST).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({
      code: "provider_rate_limited",
      message: "Example service rate limit exceeded",
    });
    expect((error as ChainError).details).toEqual({ httpStatus: 429, retryAfterSeconds: 12 });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("maps 429 with an HTTP-date Retry-After to seconds", async () => {
    const date = new Date(Date.now() + 30_000).toUTCString();
    const fetchImpl = serving(
      () => new Response("", { status: 429, headers: { "retry-after": date } }),
    );
    const error = (await requestJson(fetchImpl, "https://example.test", {}, REQUEST).catch(
      (caught: unknown) => caught,
    )) as ChainError;
    const details = error.details as { retryAfterSeconds: number };
    expect(details.retryAfterSeconds).toBeGreaterThan(25);
    expect(details.retryAfterSeconds).toBeLessThanOrEqual(30);
  });

  it("uses the service's refusal for other statuses, else reads the body", async () => {
    const refuse = (response: Response) =>
      response.status === 403 ? new ChainError("provider_error", "forbidden") : undefined;
    await expect(
      requestJson(
        serving(() => new Response("{}", { status: 403 })),
        "https://x.test",
        {},
        {
          ...REQUEST,
          refuse,
        },
      ),
    ).rejects.toThrow("forbidden");
    await expect(
      requestJson(
        serving(() => Response.json({ error: "bad" }, { status: 400 })),
        "https://x.test",
        {},
        { ...REQUEST, refuse },
      ),
    ).resolves.toEqual({ status: 400, ok: false, body: { error: "bad" } });
  });

  it("bounds the response size", async () => {
    const fetchImpl = serving(() => new Response("x".repeat(64)));
    await expect(
      requestJson(fetchImpl, "https://x.test", {}, { ...REQUEST, maxBytes: 16 }),
    ).rejects.toMatchObject({ code: "response_too_large" });
    await expect(
      requestJson(
        fetchImpl,
        "https://x.test",
        {},
        {
          ...REQUEST,
          maxBytes: 16,
          errors: { ...REQUEST.errors, tooLarge: () => new ChainError("provider_error", "big") },
        },
      ),
    ).rejects.toThrow("big");
  });

  it("reports malformed JSON with the response status", async () => {
    await expect(
      requestJson(
        serving(() => new Response("{nope", { status: 502 })),
        "https://x.test",
        {},
        REQUEST,
      ),
    ).rejects.toThrow("example malformed 502");
  });

  it("uses the given parser", async () => {
    await expect(
      requestJson(
        serving(() => new Response("raw")),
        "https://x.test",
        {},
        {
          ...REQUEST,
          parse: (text) => ({ text }),
        },
      ),
    ).resolves.toMatchObject({ body: { text: "raw" } });
  });

  it("sends nothing once the deadline has passed", async () => {
    const fetchImpl = serving(() => Response.json({}));
    await expect(
      requestJson(fetchImpl, "https://x.test", {}, { ...REQUEST, check: expiredCheck() }),
    ).rejects.toBeInstanceOf(DeadlineExpiredError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses the service's timeout when the signal aborts after the request was sent", async () => {
    const controller = new AbortController();
    const check = { signal: controller.signal, assertDispatchable() {} };
    const fetchImpl = vi.fn(async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    await expect(
      requestJson(fetchImpl, "https://x.test", {}, { ...REQUEST, check }),
    ).rejects.toThrow("example timed out");
  });
});

describe("serviceFetch", () => {
  it("throws provider_rate_limited on 429 and refuses redirects", async () => {
    const fetchImpl = serving(
      () => new Response("slow", { status: 429, headers: { "retry-after": "3" } }),
    );
    const error = (await serviceFetch({ service: "Example API", check: NO_CHECK, fetchImpl })(
      "https://x.test",
    ).catch((caught: unknown) => caught)) as ChainError;
    expect(error).toMatchObject({ code: "provider_rate_limited" });
    expect(error.details).toEqual({ httpStatus: 429, retryAfterSeconds: 3 });
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({ redirect: "error" });
  });

  it("bounds the body and passes other statuses through", async () => {
    const fetchImpl = serving(() => new Response("x".repeat(64), { status: 500 }));
    await expect(
      serviceFetch({ service: "Example API", check: NO_CHECK, fetchImpl, maxBytes: 16 })(
        "https://x.test",
      ),
    ).rejects.toMatchObject({ code: "response_too_large" });
    const response = await serviceFetch({ service: "Example API", check: NO_CHECK, fetchImpl })(
      "https://x.test",
    );
    expect(response.status).toBe(500);
  });

  it("sends nothing once the deadline has passed", async () => {
    const fetchImpl = serving(() => Response.json({}));
    await expect(
      serviceFetch({ service: "Example API", check: expiredCheck(), fetchImpl })("https://x.test"),
    ).rejects.toBeInstanceOf(DeadlineExpiredError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
