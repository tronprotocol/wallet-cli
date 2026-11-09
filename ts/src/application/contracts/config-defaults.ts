import type { OutputMode } from "../../domain/types/index.js";

// Context defaults and the command deadline that apply when config.yaml does not set them.
export const CONFIG_DEFAULTS: {
  readonly defaultNetwork: string;
  readonly defaultOutput: OutputMode;
  readonly timeoutMs: number;
} = {
  defaultNetwork: "tron:728126428",
  defaultOutput: "text",
  timeoutMs: 90_000,
};
