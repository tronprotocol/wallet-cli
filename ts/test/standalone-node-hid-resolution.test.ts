import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveNodeHidAddon } from "../scripts/standalone/resolve-node-hid-addon.js";

const TRANSPORT = join("@ledgerhq", "hw-transport-node-hid-noevents");
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("standalone node-hid resolution", () => {
  it("uses the addon visible to Ledger transport instead of a hoisted top-level version", () => {
    const root = fixtureRoot();
    installPackage(root, join("node_modules", "node-hid"), "3.4.0", "HID.node");
    const nestedNodeHid = join("node_modules", TRANSPORT, "node_modules", "node-hid");
    installPackage(root, nestedNodeHid, "2.1.2", "HID.node");

    const resolved = resolveNodeHidAddon({
      platform: "darwin",
      rootUrl: join(root, "entry.mjs"),
    });

    expect(resolved.nodeHidVersion).toBe("2.1.2");
    expect(resolved.nativeAddon).toBe(
      realpathSync(join(root, nestedNodeHid, "build", "Release", "HID.node")),
    );
  });

  it("selects hidraw on Linux", () => {
    const root = fixtureRoot();
    const nestedNodeHid = join("node_modules", TRANSPORT, "node_modules", "node-hid");
    installPackage(root, nestedNodeHid, "2.1.2", "HID_hidraw.node");

    const resolved = resolveNodeHidAddon({
      platform: "linux",
      rootUrl: join(root, "entry.mjs"),
    });

    expect(resolved.nativeAddon).toBe(
      realpathSync(join(root, nestedNodeHid, "build", "Release", "HID_hidraw.node")),
    );
  });

  it("rejects an unsupported node-hid major", () => {
    const root = fixtureRoot();
    installPackage(root, join("node_modules", "node-hid"), "3.4.0", "HID.node");

    expect(() =>
      resolveNodeHidAddon({ platform: "darwin", rootUrl: join(root, "entry.mjs") }),
    ).toThrow(/unsupported node-hid 3\.4\.0/);
  });
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "wallet-cli-node-hid-resolution-"));
  temporaryRoots.push(root);
  writePackageJson(join(root, "node_modules", TRANSPORT), "6.35.4");
  return root;
}

function installPackage(root: string, relativePackage: string, version: string, addon: string): void {
  const packageRoot = join(root, relativePackage);
  writePackageJson(packageRoot, version);
  const addonDirectory = join(packageRoot, "build", "Release");
  mkdirSync(addonDirectory, { recursive: true });
  writeFileSync(join(addonDirectory, addon), "fixture");
}

function writePackageJson(packageRoot: string, version: string): void {
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "fixture", version }));
}
