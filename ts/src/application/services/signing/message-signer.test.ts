import { describe, expect, it, vi } from "vitest";
import { MessageSigner } from "./message-signer.js";
import type { SignerResolver } from "../signer/index.js";
import type { SigningService } from "./signing-service.js";
import type { TransactionScope } from "../../contracts/execution-scope.js";

const TRON = { id: "tron:728126428", family: "tron", chainId: "728126428" } as never;
const scope = {} as TransactionScope;

describe("MessageSigner", () => {
  it("signs the message through the signing entry with the caller's origin", async () => {
    const signer = { kind: "software" as const, address: "TPayer" };
    const signers = {
      assertCanSign: vi.fn(),
      resolve: vi.fn(() => signer),
    } as unknown as SignerResolver;
    const sign = vi.fn(async () => "0xsig");
    const out = await new MessageSigner(signers, { sign } as unknown as SigningService).sign(
      scope,
      TRON,
      "acct" as never,
      "bind me",
      "built",
    );
    expect(out).toEqual({ address: "TPayer", message: "bind me", signature: "0xsig" });
    expect(signers.assertCanSign).toHaveBeenCalledWith("acct", "tron");
    expect(sign).toHaveBeenCalledWith(scope, {
      network: TRON,
      origin: "built",
      signer,
      payload: { kind: "message", message: "bind me" },
    });
  });
});
