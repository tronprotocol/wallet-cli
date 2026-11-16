import { GASFREE_TRACE } from "../../application/follow-ups.js";

export const GASFREE_FOLLOW_UPS: Readonly<Record<string, (subject?: string) => string>> = {
  [GASFREE_TRACE]: (id) => (id === undefined ? "gasfree trace" : `gasfree trace ${id}`),
};
