import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const TRANSPORT_PACKAGE = "@ledgerhq/hw-transport-node-hid-noevents";
const SUPPORTED_NODE_HID_MAJOR = 2;

interface ResolveNodeHidAddonOptions {
  platform?: NodeJS.Platform;
  rootUrl?: string | URL;
}

interface ResolvedNodeHidAddon {
  nativeAddon: string;
  nodeHidVersion: string;
  transportPackageJson: string;
}

/** Resolve the native addon through the exact dependency tree visible to Ledger transport. */
export function resolveNodeHidAddon(
  options: ResolveNodeHidAddonOptions = {},
): ResolvedNodeHidAddon {
  const { platform = process.platform, rootUrl = import.meta.url } = options;
  const rootRequire = createRequire(rootUrl);
  const transportPackageJson = rootRequire.resolve(`${TRANSPORT_PACKAGE}/package.json`);
  const transportRequire = createRequire(transportPackageJson);
  const nodeHidPackageJson = transportRequire.resolve("node-hid/package.json");
  const packageJson = JSON.parse(readFileSync(nodeHidPackageJson, "utf8")) as {
    version?: unknown;
  };

  if (typeof packageJson.version !== "string") {
    throw new Error(`node-hid package has no valid version: ${nodeHidPackageJson}`);
  }
  const nodeHidVersion = packageJson.version;
  const nodeHidMajor = Number.parseInt(nodeHidVersion.split(".", 1)[0]!, 10);
  if (nodeHidMajor !== SUPPORTED_NODE_HID_MAJOR) {
    throw new Error(
      `${TRANSPORT_PACKAGE} resolved unsupported node-hid ${nodeHidVersion}; ` +
        `review scripts/standalone/node-hid-runtime.ts before updating the native addon`,
    );
  }

  const addonName = platform === "linux" ? "HID_hidraw.node" : "HID.node";
  const addonRequest = `node-hid/build/Release/${addonName}`;
  let nativeAddon: string;
  try {
    nativeAddon = transportRequire.resolve(addonRequest);
  } catch (cause) {
    throw new Error(
      `unable to resolve ${addonRequest} from ${transportPackageJson}; ` +
        `run npm ci on the target platform without --omit=optional`,
      { cause },
    );
  }

  return { nativeAddon, nodeHidVersion, transportPackageJson };
}
