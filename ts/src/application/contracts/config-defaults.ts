import type { OutputMode } from "../../domain/types/index.js";

// Context defaults and time limits that apply when config.yaml does not set them.
export const CONFIG_DEFAULTS: {
  readonly defaultNetwork: string;
  readonly defaultOutput: OutputMode;
  readonly timeoutMs: number;
  readonly waitTimeoutMs: number;
} = {
  defaultNetwork: "tron:728126428",
  defaultOutput: "text",
  timeoutMs: 60_000,
  waitTimeoutMs: 60_000,
};
