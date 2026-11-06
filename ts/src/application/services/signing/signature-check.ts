import type {
  EvmSignedTx,
  NetworkDescriptor,
  SignedTx,
  TronTransactionArtifact,
  TypedDataPayload,
  TypedDataSignature,
  UnsignedTx,
} from "../../../domain/types/index.js";
import type { ChainFamily } from "../../../domain/family/index.js";
import { addressCodec } from "../../../domain/family/index.js";
import { ChainError } from "../../../domain/errors/index.js";
import {
  hexBytes,
  keccakHex,
  messageDigest,
  recoverSignerAddress,
  tronTransactionDigest,
} from "../../../domain/signature/index.js";
import type { EvmGateway } from "../../ports/chain/evm/evm-gateway.js";
import type { TronGateway } from "../../ports/chain/tron/tron-gateway.js";

export interface SignatureDigests {
  tron(): Pick<TronGateway, "typedDataDigest">;
  evm(): Pick<EvmGateway, "typedDataDigest" | "unsignedTransactionHash" | "signedTransactionParts">;
}

function mismatch(reason: string): ChainError {
  return new ChainError(
    "signed_payload_mismatch",
    `the signer returned ${reason}; the signature was not used`,
  );
}

function assertRecovers(
  family: ChainFamily,
  digest: Uint8Array | undefined,
  signature: unknown,
  address: string,
): void {
  const codec = addressCodec(family);
  const recovered =
    digest !== undefined && typeof signature === "string"
      ? recoverSignerAddress(family, digest, signature)
      : undefined;
  if (recovered === undefined) throw mismatch("a malformed signature");
  if (codec.canonical(recovered) !== codec.canonical(address)) {
    throw mismatch(`a signature by ${recovered}, not by the signing account ${address}`);
  }
}

// Multisig: only the signature this signer appended is checked; earlier approvals must be unchanged.
function assertTronTransaction(
  sent: TronTransactionArtifact,
  signed: SignedTx,
  address: string,
): void {
  const result = signed as Partial<TronTransactionArtifact>;
  if (result.raw_data_hex !== sent.raw_data_hex || result.txID !== sent.txID) {
    throw mismatch("a transaction other than the one it was asked to sign");
  }
  const prior = sent.signature ?? [];
  const signatures = Array.isArray(result.signature) ? result.signature : [];
  if (prior.some((sig, i) => signatures[i] !== sig)) {
    throw mismatch("a transaction whose earlier signatures were changed");
  }
  const added = signatures.slice(prior.length);
  if (added.length > 1) throw mismatch("more than one new signature");
  const digest = tronTransactionDigest(sent.raw_data_hex);
  if (added.length === 1) return assertRecovers("tron", digest, added[0], address);
  // A device that already approved this transaction adds nothing.
  if (!prior.some((sig) => digest && recoverSignerAddress("tron", digest, sig) === address)) {
    throw mismatch("no signature");
  }
}

function assertEvmTransaction(
  digests: SignatureDigests,
  sent: UnsignedTx,
  signed: SignedTx,
  address: string,
): void {
  const { raw, hash } = signed as Partial<EvmSignedTx>;
  const parts = typeof raw === "string" ? digests.evm().signedTransactionParts(raw) : undefined;
  if (parts === undefined) throw mismatch("a malformed signed transaction");
  const expected = digests.evm().unsignedTransactionHash(sent);
  if (parts.unsignedHash.toLowerCase() !== expected.toLowerCase()) {
    throw mismatch("a transaction other than the one it was asked to sign");
  }
  if (typeof hash !== "string" || hash.replace(/^0x/, "").toLowerCase() !== keccakHex(raw!)) {
    throw mismatch("a transaction hash that does not match its serialization");
  }
  assertRecovers("evm", hexBytes(expected), parts.signature, address);
}

function assertTypedData(
  digests: SignatureDigests,
  family: ChainFamily,
  payload: TypedDataPayload,
  signed: TypedDataSignature,
  address: string,
): void {
  const digest =
    family === "tron"
      ? digests.tron().typedDataDigest(payload)
      : digests.evm().typedDataDigest(payload);
  if (typeof signed.digest !== "string" || signed.digest.toLowerCase() !== digest.toLowerCase()) {
    throw mismatch("a typed-data digest other than the one of the requested payload");
  }
  assertRecovers(family, hexBytes(digest), signed.signature, address);
}

export type SignedPayload =
  | { kind: "transaction"; sent: UnsignedTx; result: SignedTx }
  | { kind: "message"; sent: string; result: string }
  | { kind: "typed-data"; sent: TypedDataPayload; result: TypedDataSignature };

// Recovers the signer of what was returned over the exact payload that was sent to the signer.
export function assertSignedBy(
  digests: SignatureDigests,
  network: NetworkDescriptor,
  address: string,
  signed: SignedPayload,
): void {
  const { family } = network;
  switch (signed.kind) {
    case "transaction":
      return family === "tron"
        ? assertTronTransaction(signed.sent as TronTransactionArtifact, signed.result, address)
        : assertEvmTransaction(digests, signed.sent, signed.result, address);
    case "message":
      return assertRecovers(family, messageDigest(family, signed.sent), signed.result, address);
    case "typed-data":
      return assertTypedData(digests, family, signed.sent, signed.result, address);
  }
}
