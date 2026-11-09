import { vi } from "vitest";
import { TronWeb } from "tronweb";

// Builds a client and returns the TronWeb instance it created, so a test can replace SDK methods.
export function withTronWeb<T>(construct: () => T): { client: T; tronweb: TronWeb } {
  const spy = vi.spyOn(TronWeb.prototype, "setAddress");
  try {
    const client = construct();
    const tronweb = spy.mock.contexts[0] as TronWeb | undefined;
    if (!tronweb) throw new Error("the client did not create a TronWeb instance");
    return { client, tronweb };
  } finally {
    spy.mockRestore();
  }
}
