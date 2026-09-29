import { describe, expect, it, vi } from "vitest";
import { sunswapSwapTronBinding } from "./swap.js";
import type { SunSwapSwapService } from "../../../../../application/use-cases/tron/sunswap/swap-service.js";
import type { NetworkDescriptor } from "../../../../../domain/types/index.js";
import type { ExecutionContext } from "../../contracts/execution-context.js";

describe("sunswap swap --quote", () => {
  const net = { id: "tron:728126428", family: "tron" } as NetworkDescriptor;

  // A quote submits nothing, so there is no confirmation to wait for — the same rule
  // `tx send` applies to `--dry-run --wait`.
  it("refuses --wait before asking for a quote", async () => {
    const swap = vi.fn();
    const binding = sunswapSwapTronBinding({ swap } as unknown as SunSwapSwapService);
    await expect(
      binding.run({ wait: true } as unknown as ExecutionContext, net, {
        tokenIn: "TRX",
        tokenOut: "USDT",
        amountIn: "1",
        quote: true,
      }),
    ).rejects.toMatchObject({ code: "invalid_option", message: /--wait/ });
    expect(swap).not.toHaveBeenCalled();
  });
});
