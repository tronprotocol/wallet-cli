import type { CliError } from "../../domain/errors/index.js";
import type { X402Scheme } from "../../domain/x402/families.js";
import type { X402Challenge, X402OfferedRequirement } from "../ports/x402-facilitator.js";
import type { X402AccessLog, X402ServeDetails, X402ServerHandle } from "../ports/x402-server.js";

export interface X402ListenOptions {
  readonly host: string;
  // 0 lets the system choose.
  readonly port: number;
  readonly accessLog: X402AccessLog;
  // Run in a detached process.
  readonly daemon: boolean;
}

export interface X402Discovery {
  readonly x402Version: 2;
  readonly resource: { readonly url: string };
  readonly accepts: readonly X402OfferedRequirement[];
}

export interface X402PaidResponse {
  readonly success: true;
  readonly network: string;
  readonly scheme: X402Scheme;
  readonly transaction: string;
}

export type X402PaywallResponse =
  | {
      readonly kind: "payment-required";
      readonly challenge: X402Challenge;
      // Wire value of the payment-required header.
      readonly challengeHeader: string;
    }
  | {
      readonly kind: "paid";
      readonly body: X402PaidResponse;
      // Wire value of the payment-response header.
      readonly receiptHeader: string;
    }
  | {
      readonly kind: "refused";
      readonly phase: "verify" | "settle";
      // True when the facilitator answered and refused; false when it could not be reached or read.
      readonly rejected: boolean;
      readonly error: CliError;
    };

// A paywall whose requirement the facilitator agreed to.
export interface X402OpenPaywall {
  // Sets the URL the paywall listens on and returns what serving reports.
  publish(payUrl: string): X402ServeDetails;
  discovery(): X402Discovery;
  // `paymentSignature` is the payment-signature header value; undefined when the request has none.
  handlePaymentRequest(paymentSignature: string | undefined): Promise<X402PaywallResponse>;
}

export interface X402Paywall {
  // Agrees the requirement with the facilitator.
  open(): Promise<X402OpenPaywall>;
}

// Accepts HTTP requests for a paywall until the handle is closed.
export interface X402PaywallHost {
  start(paywall: X402Paywall, options: X402ListenOptions): Promise<X402ServerHandle>;
}
