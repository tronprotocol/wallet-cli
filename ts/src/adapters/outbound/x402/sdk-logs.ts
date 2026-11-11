import { noopLogger, setLogger } from "@bankofai/x402-tron";

// SDK logs would corrupt the result envelope on stdout and can print request URLs.
export function silenceX402SdkLogs(): void {
  setLogger(noopLogger);
}
