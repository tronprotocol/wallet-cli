import { asObj, ok, warn } from "./layout.js";
import { structuredText } from "./structured.js";

export function baiRechargeText(value: unknown): string {
  const data = asObj(value);
  const title =
    data.dryRun === true
      ? "B.AI recharge preview — no order or payment created"
      : data.creditStatus === "credited"
        ? "B.AI recharge credited"
        : "B.AI credit not confirmed — reconcile before paying again";
  const marker = data.dryRun === true || data.creditStatus === "credited" ? ok() : warn();
  return `${marker} ${title}\n${structuredText(data, "  ")}`;
}

export function baiUsageText(value: unknown): string {
  const data = asObj(value);
  const month = asObj(data.thisMonth);
  return `B.AI usage summary\n${structuredText(
    {
      "Credit balance": data.credits,
      Month: month.month,
      "Credits spent this month": month.credits,
      "Monthly usage": data.trend,
    },
    "  ",
  )}`;
}

export function baiRecordsText(value: unknown): string {
  return `B.AI usage records\n${structuredText(value, "  ")}`;
}

export function baiOrdersText(value: unknown): string {
  return `B.AI recharge orders\n${structuredText(value, "  ")}`;
}
