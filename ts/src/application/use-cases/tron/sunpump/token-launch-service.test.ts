/**
 * `sunpump launch`'s use case: the body it assembles, and the preview that must equal it.
 *
 * The hard promise here is `--dry-run`: it reaches NO port at all. A dry run that sent the request
 * and threw the answer away would create a real token, permanently, on mainnet — so the fake below
 * fails the test if it is called, rather than merely recording that it was.
 */
import { describe, expect, it } from "vitest";
import { SunPumpTokenLaunchService } from "./token-launch-service.js";
import type { SunPumpTokenRecord } from "../../../ports/sunpump/market-data.js";
import type {
  SunPumpTokenLaunchPort,
  SunPumpTokenLaunchRequest,
} from "../../../ports/sunpump/token-launch.js";
import type { NetworkDescriptor } from "../../../../domain/types/index.js";

const MAINNET = {
  id: "tron:728126428",
  family: "tron",
  chainId: "728126428",
  nativeSymbol: "TRX",
  capabilities: [],
} as NetworkDescriptor;

const TOKEN = {
  address: "TNfW9m6BzWpZ4gZ8y8sJQ8PjRKzvGx1a9x",
  symbol: "TST",
  name: "Test Token",
  decimals: 18,
  totalSupply: "1000000000000000000000000000",
  status: "CREATED",
  owner: "TQRxQNvnALSe5N27uXC47j6HExS9WGT4kj",
  market: {
    marketCapUsd: "11078.22",
    priceInTrx: "0.000032710280376636",
    priceChange24HrPercent: "0",
    volume24HrSun: "0",
    virtualLiquidity: "23707.39",
  },
  curve: { pumpPercentage: "0", currentSold: "0", tokenReserve: "0", trxReserve: "0" },
  createdAt: "2026-06-03 08:45",
  createTxHash: "9f2c77ad",
  description: "demo",
  links: {},
} as SunPumpTokenRecord;

function port() {
  const sent: SunPumpTokenLaunchRequest[] = [];
  const launchpad: SunPumpTokenLaunchPort = {
    launchToken: async (_net, request) => {
      sent.push(request);
      return TOKEN;
    },
  };
  return { sent, service: new SunPumpTokenLaunchService(launchpad) };
}

/** a port that must not be reached: being called at all is the failure. */
const unreachable = new SunPumpTokenLaunchService({
  launchToken: async () => {
    throw new Error("the create endpoint was called during a dry run");
  },
});

const BASE = { name: "Test Token", symbol: "TST", description: "demo" };

describe("creating a token", () => {
  it("sends exactly the options it was given", async () => {
    const { sent, service } = port();
    await service.launch(MAINNET, {
      ...BASE,
      image: { source: "base64", base64: "QUJDRA==" },
      twitterUrl: "https://x.com/example",
      telegramUrl: "https://t.me/example",
      websiteUrl: "https://example.com",
      dryRun: false,
    });
    expect(sent).toEqual([
      {
        name: "Test Token",
        symbol: "TST",
        description: "demo",
        imageBase64: "QUJDRA==",
        twitterUrl: "https://x.com/example",
        telegramUrl: "https://t.me/example",
        websiteUrl: "https://example.com",
      },
    ]);
  });

  it("omits what was not given rather than sending it empty", async () => {
    const { sent, service } = port();
    await service.launch(MAINNET, { ...BASE, dryRun: false });
    expect(sent).toEqual([{ name: "Test Token", symbol: "TST", description: "demo" }]);
  });

  /**
   * The receipt is the token the service created, not the token we asked for.
   *
   * `owner` in particular: it is SunPump's choice and no local account, so it has to come from the
   * answer. Echoing the request back would show an owner we invented.
   */
  it("publishes the token the service answered with", async () => {
    const { service } = port();
    const view = await service.launch(MAINNET, { ...BASE, dryRun: false });
    expect(view).toEqual({ kind: "sunpump-launch", token: TOKEN });
  });
});

describe("--dry-run", () => {
  it("sends nothing to the create endpoint", async () => {
    const view = await unreachable.launch(MAINNET, { ...BASE, dryRun: true });
    expect(view).toEqual({
      kind: "sunpump-launch",
      mode: "dry-run",
      name: "Test Token",
      symbol: "TST",
      description: "demo",
    });
  });

  it("previews the file logo by path and size, and the links that were given", async () => {
    const view = await unreachable.launch(MAINNET, {
      ...BASE,
      image: { source: "file", path: "./logo.png", bytes: 12_345, base64: "QUJDRA==" },
      websiteUrl: "https://example.com",
      telegramUrl: "https://t.me/example",
      dryRun: true,
    });
    expect(view).toEqual({
      kind: "sunpump-launch",
      mode: "dry-run",
      name: "Test Token",
      symbol: "TST",
      description: "demo",
      image: { source: "file", path: "./logo.png", bytes: 12_345 },
      // no `twitter` key: an option nobody gave is absent, not empty
      links: { website: "https://example.com", telegram: "https://t.me/example" },
    });
  });

  // A base64 logo has no path and no size on disk; its length is the only honest measure of it.
  it("previews a base64 logo by its length, with no path", async () => {
    const view = await unreachable.launch(MAINNET, {
      ...BASE,
      image: { source: "base64", base64: "QUJDRA==" },
      dryRun: true,
    });
    expect(view).toMatchObject({ image: { source: "base64", chars: 8 } });
    expect(view).not.toHaveProperty("image.path");
  });

  it("omits links entirely when none were given", async () => {
    const view = await unreachable.launch(MAINNET, { ...BASE, dryRun: true });
    expect(view).not.toHaveProperty("links");
    expect(view).not.toHaveProperty("image");
  });
});
