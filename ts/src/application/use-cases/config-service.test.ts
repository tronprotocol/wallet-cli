import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "./config-service.js";
import type { ConfigDocumentRepository } from "../ports/config-document-repository.js";
import type { NetworkRegistry } from "../ports/network-registry.js";
import type { Config } from "../../domain/types/index.js";

const effective = { timeoutMs: 60_000, networks: {} } as unknown as Config;
const networks = {} as NetworkRegistry;

function service(): { svc: ConfigService; update: ReturnType<typeof vi.fn> } {
  const update = vi.fn((fn: (c: unknown) => { document: unknown; result: unknown }) => fn({}).result);
  const docs = { update } as unknown as ConfigDocumentRepository;
  return { svc: new ConfigService(docs), update };
}

describe("ConfigService timeoutMs validation", () => {
  it("rejects a non-positive timeoutMs (0ms bound aborts instantly)", () => {
    const { svc, update } = service();
    expect(() => svc.execute({ key: "timeoutMs", value: "0" }, effective, networks)).toThrow(/positive/);
    expect(() => svc.execute({ key: "timeoutMs", value: "-5" }, effective, networks)).toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it("accepts a positive timeoutMs", () => {
    const { svc } = service();
    expect(svc.execute({ key: "timeoutMs", value: "5000" }, effective, networks)).toMatchObject({
      key: "timeoutMs",
      value: 5000,
    });
  });
});
