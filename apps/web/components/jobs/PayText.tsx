import type { JobPay, PayFrequency } from "@pitchperfect/shared";

const PER: Record<PayFrequency, string> = {
  hourly: "per hour",
  weekly: "per week",
  monthly: "per month",
  annually: "per year",
};

/** "$22–$28 per hour + commission", "€45,000 per year", or "Unpaid". */
export function formatPay(pay: JobPay): string {
  if (pay.type === "unpaid") return "Unpaid";
  const amounts = pay.type === "range" ? [pay.min, pay.max] : [pay.amount];
  // Cents only when an amount has them, and then on both ends of a range.
  const digits = amounts.every(Number.isInteger) ? 0 : 2;
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: pay.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const amount = amounts.map((value) => money.format(value)).join("–");
  return `${amount} ${PER[pay.frequency]}${pay.commission ? " + commission" : ""}`;
}

interface PayTextProps {
  pay: JobPay;
  className?: string;
}

export function PayText({ pay, className }: PayTextProps) {
  return <span className={className}>{formatPay(pay)}</span>;
}
