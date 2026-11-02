import { describe, it, expect, vi } from "vitest";
import { CommandDeadline } from "../services/command-deadline.js";
import { Derivation } from "../../domain/derivation/index.js";
import type { LedgerDevice } from "../ports/ledger-device.js";
import type { PromptPort } from "../ports/prompt.js";
import type { WalletRepository } from "../ports/wallet-repository.js";
import { WalletService } from "./wallet-service.js";

const NO_DEADLINE = new CommandDeadline(0);
const TRON_ADDRESS = "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8";

function service(ledger: Partial<LedgerDevice>) {
  return new WalletService(
    {} as WalletRepository,
    ledger as LedgerDevice,
    {} as never,
    {} as never,
  );
}

describe("WalletService Ledger account location", () => {
  it("scans its own device for an address locator", async () => {
    const getAddress = vi.fn(async (_family: string, path: string) =>
      path === Derivation.ledgerPath("tron", 2) ? TRON_ADDRESS : "T-other",
    );
    const path = await service({ getAddress }).ledgerPath(NO_DEADLINE, "tron", {
      address: TRON_ADDRESS,
    });
    expect(path).toBe(Derivation.ledgerPath("tron", 2));
    expect(getAddress).toHaveBeenCalledTimes(3);
  });

  it("offers its own device's addresses to the prompt and returns the choice", async () => {
    const getAddress = vi.fn(async (_family: string, path: string) => `addr-for-${path}`);
    const select = vi.fn(async ({ choices }: { choices: Array<{ value: string }> }) => {
      return choices[1]!.value;
    });
    const path = await service({ getAddress }).selectLedgerPath(
      NO_DEADLINE,
      "tron",
      { select } as unknown as PromptPort,
      "Select tron account",
    );
    expect(path).toBe(Derivation.ledgerPath("tron", 1));
    expect(select.mock.calls[0]![0]).toMatchObject({ label: "Select tron account" });
  });
});
