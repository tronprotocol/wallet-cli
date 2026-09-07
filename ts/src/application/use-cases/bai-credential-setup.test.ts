import { expect, it, vi } from "vitest";
import { BaiCredentialSetup } from "./bai-credential-setup.js";

it("checks the selected key and payer once, then reuses local confirmation", async () => {
  const verified = new Set<string>();
  const store = {
    isConfirmed: (key: string, chain: string, address: string) =>
      verified.has(JSON.stringify([key, chain, address])),
    confirm: (key: string, chain: string, address: string) => {
      verified.add(JSON.stringify([key, chain, address]));
    },
  };
  const check = vi.fn(async () => true);
  const setup = new BaiCredentialSetup(store, check);
  await setup.confirm("key", "bnb", "payer");
  await setup.confirm("key", "bnb", "payer");
  expect(check).toHaveBeenCalledTimes(1);
  expect(check).toHaveBeenCalledWith("key", { chain: "bnb", address: "payer" });
  await setup.confirm("different-key", "bnb", "payer");
  await setup.confirm("key", "bnb", "different-payer");
  await setup.confirm("key", "tron", "payer");
  expect(check).toHaveBeenCalledTimes(4);
});
it.each([false, new Error("unavailable")])(
  "does not record failed confirmation",
  async (result) => {
    const store = { isConfirmed: () => false, confirm: vi.fn() };
    const check = vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    });
    await expect(
      new BaiCredentialSetup(store, check).confirm("key", "bnb", "payer"),
    ).rejects.toThrow();
    expect(store.confirm).not.toHaveBeenCalled();
  },
);
