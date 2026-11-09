import type { Sun, Wei } from "../../../domain/amounts/index.js";

export interface NativeBalanceReader<Amount extends Sun | Wei = Sun | Wei> {
  getNativeBalance(address: string): Promise<Amount>;
}
