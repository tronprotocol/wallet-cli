const DEFAULT_REPORT_DELAY_MS = 15_000;

// Wait before reporting a paid hash. A setting of 1-7 digits overrides the default; anything else is ignored.
export function baiReportDelayMs(setting: string | undefined): number {
  return setting !== undefined && /^\d{1,7}$/.test(setting)
    ? Number(setting)
    : DEFAULT_REPORT_DELAY_MS;
}
