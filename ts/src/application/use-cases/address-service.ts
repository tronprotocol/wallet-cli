import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { bytesToHex } from "@noble/hashes/utils.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import type { KeypairWriter } from "../ports/keypair-writer.js";
import {
  evmAddressFromPublicKey,
  TronAddress,
} from "../../domain/address/index.js";
import { ExecutionError } from "../../domain/errors/index.js";

const MAX_SCALAR_ATTEMPTS = 128;

export class AddressService {
  constructor(
    private readonly root: string,
    private readonly writer: KeypairWriter,
    private readonly random: (size: number) => Uint8Array = randomBytes,
  ) {}

  generate(input: { out?: string; printSecret: boolean }) {
    let privateKey: Uint8Array | undefined;
    for (
      let attempt = 0;
      attempt < MAX_SCALAR_ATTEMPTS;
      attempt += 1
    ) {
      const candidate = this.random(32);
      if (
        candidate.length === 32
        && secp256k1.utils.isValidSecretKey(candidate)
      ) {
        privateKey = candidate;
        break;
      }
      candidate.fill(0);
    }
    if (!privateKey) {
      throw new ExecutionError(
        "entropy_failure",
        "could not obtain a valid secp256k1 private key",
      );
    }

    const publicKey = secp256k1.getPublicKey(privateKey, false);
    const tron = new TronAddress().fromPublicKey(publicKey);
    const evm = evmAddressFromPublicKey(publicKey);
    const privateKeyHex = bytesToHex(privateKey);
    try {
      if (input.printSecret) {
        return { tron, evm, privateKey: privateKeyHex };
      }
      const path =
        input.out
        ?? join(this.root, "generated", `keypair-${tron}`);
      const secretFile = this.writer.write(path, {
        version: 1,
        privateKey: privateKeyHex,
        publicKey: bytesToHex(publicKey),
        tron,
        evm,
      });
      return { tron, evm, secretFile };
    } finally {
      privateKey.fill(0);
    }
  }
}
