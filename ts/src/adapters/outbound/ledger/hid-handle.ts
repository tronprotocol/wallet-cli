interface HidTransport {
  close(): Promise<void>;
  device?: { close(): void };
}

/** Ledger's normal close waits for exchangeBusyPromise. Cancellation must close HID first. */
export function hidHandle(transport: HidTransport) {
  let stopped = false;
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    return (closing ??= transport.close().finally(() => {
      stopped = true;
    }));
  };
  const abort = (): void => {
    if (stopped) return;
    if (transport.device) {
      stopped = true;
      try {
        transport.device.close();
      } catch {
        /* Disconnection may already have closed it. */
      }
    } else {
      void close().catch(() => {});
    }
  };
  return { transport, close, abort };
}
