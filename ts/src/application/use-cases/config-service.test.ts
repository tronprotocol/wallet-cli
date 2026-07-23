import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "./config-service.js";
import type { ConfigDocumentRepository } from "../ports/config-document-repository.js";
import type { NetworkRegistry } from "../ports/network-registry.js";
import type { Config } from "../../domain/types/index.js";

const effective = { timeoutMs: 60_000, waitTimeoutMs: 60_000, networks: {} } as unknown as Config;
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

describe("ConfigService waitTimeoutMs", () => {
  it("shows waitTimeoutMs in the full view and single-key read", () => {
    const { svc } = service();
    expect(svc.execute({}, effective, networks)).toMatchObject({ waitTimeoutMs: 60_000 });
    expect(svc.execute({ key: "waitTimeoutMs" }, effective, networks)).toMatchObject({
      key: "waitTimeoutMs",
      value: 60_000,
    });
  });

  it("accepts 0 and positive integers, rejects negatives and non-numbers", () => {
    const { svc, update } = service();
    expect(svc.execute({ key: "waitTimeoutMs", value: "0" }, effective, networks)).toMatchObject({
      key: "waitTimeoutMs",
      value: 0,
    });
    expect(svc.execute({ key: "waitTimeoutMs", value: "120000" }, effective, networks)).toMatchObject({
      key: "waitTimeoutMs",
      value: 120000,
    });
    expect(() => svc.execute({ key: "waitTimeoutMs", value: "-1" }, effective, networks)).toThrow(/non-negative/);
    expect(() => svc.execute({ key: "waitTimeoutMs", value: "abc" }, effective, networks)).toThrow(/non-negative/);
    expect(update).toHaveBeenCalledTimes(2);
  });
});

describe("ConfigService TronLink credentials", () => {
  it("validates the exact public config keys and masks the secret key", () => {
    const { svc } = service();
    expect(svc.execute(
      { key: "tronlinkSecretId", value: "TEST" },
      effective,
      networks,
    )).toMatchObject({ key: "tronlinkSecretId", value: "TEST" });
    expect(svc.execute(
      { key: "tronlinkSecretKey", value: "TESTTESTTEST" },
      effective,
      networks,
    )).toMatchObject({ key: "tronlinkSecretKey", value: "********" });
  });

  it("never returns an effective secret key in config views", () => {
    const configured = { ...effective, tronlinkSecretKey: "secret" };
    const { svc } = service();
    expect(svc.execute({}, configured, networks))
      .toMatchObject({ tronlinkSecretKey: "********" });
    expect(svc.execute({ key: "tronlinkSecretKey" }, configured, networks))
      .toEqual({ key: "tronlinkSecretKey", value: "********" });
  });

  it("rejects empty, oversized, and control-character credentials", () => {
    const { svc, update } = service();
    for (const value of ["", "x".repeat(257), "bad\nvalue"]) {
      expect(() => svc.execute(
        { key: "tronlinkChannel", value },
        effective,
        networks,
      )).toThrow();
    }
    expect(update).not.toHaveBeenCalled();
  });
});

describe("ConfigService GasFree credentials", () => {
  it("writes the documented flat keys and masks the API secret", () => {
    const { svc } = service();
    expect(svc.execute(
      { key: "gasfreeApiKey", value: "TEST" },
      effective,
      networks,
    )).toMatchObject({ key: "gasfreeApiKey", value: "TEST" });
    expect(svc.execute(
      { key: "gasfreeApiSecret", value: "TESTTESTTEST" },
      effective,
      networks,
    )).toMatchObject({ key: "gasfreeApiSecret", value: "********" });
  });

  it("never returns an effective API secret in config views", () => {
    const configured = { ...effective, gasfreeApiSecret: "secret" };
    const { svc } = service();
    expect(svc.execute({}, configured, networks))
      .toMatchObject({ gasfreeApiSecret: "********" });
    expect(svc.execute({ key: "gasfreeApiSecret" }, configured, networks))
      .toEqual({ key: "gasfreeApiSecret", value: "********" });
  });
});
