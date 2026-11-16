import { BAI_REPORT_RECHARGE } from "../../application/follow-ups.js";

export const BAI_FOLLOW_UPS: Readonly<Record<string, (subject?: string) => string>> = {
  [BAI_REPORT_RECHARGE]: () => "bai report-recharge",
};
