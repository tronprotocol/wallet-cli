import type { OutputMode } from "../../domain/types/index.js";

// Context defaults and the command deadline that apply when config.yaml does not set them.
export const CONFIG_DEFAULTS: {
  readonly defaultNetwork: string;
  readonly defaultOutput: OutputMode;
  readonly timeoutMs: number;
  // Where plugin packages are fetched from.
  readonly pluginRegistry: string;
} = {
  defaultNetwork: "tron:728126428",
  defaultOutput: "text",
  timeoutMs: 90_000,
  pluginRegistry: "https://registry.npmjs.org",
};
