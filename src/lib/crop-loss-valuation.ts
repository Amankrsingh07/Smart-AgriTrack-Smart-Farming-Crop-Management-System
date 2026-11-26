/** Shared browser/server completeness rules. Never infer attestation or unit prices. */
export type ValuationInput = {
  pricePerUnit?: string | null;
  damagedRecovery?: string | null;
  priceEvidence?: string | null;
  priceConfirmed?: boolean;
  damaged?: string;
};
export type ValuationIssue = {
  code:
    | "MISSING_PRICE"
    | "INVALID_PRICE"
    | "MISSING_RECOVERY"
    | "INVALID_RECOVERY"
    | "MISSING_EVIDENCE"
    | "MISSING_ATTESTATION"
    | "RECOVERY_EXCEEDS_VALUE"
    | "INVALID_ALLOCATION";
  field:
    | "pricePerUnit"
    | "damagedRecovery"
    | "priceEvidence"
    | "priceConfirmed"
    | "quantities";
  message: string;
};
const currency = /^\d{1,9}(\.\d{1,2})?$/;
const quantity = /^\d{1,9}(\.\d{1,3})?$/;
const blank = (value: string | null | undefined) =>
  value == null || value.trim() === "";
const scaled = (value: string, decimals: number) => {
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * BigInt(10) ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0"))
  );
};
export function valuationIssues(input: ValuationInput): ValuationIssue[] {
  const issues: ValuationIssue[] = [];
  const price = input.pricePerUnit,
    recovery = input.damagedRecovery;
  const validPrice =
    !blank(price) && currency.test(price!) && scaled(price!, 2) > BigInt(0);
  const validRecovery = !blank(recovery) && currency.test(recovery!);
  if (blank(price))
    issues.push({
      code: "MISSING_PRICE",
      field: "pricePerUnit",
      message:
        "Missing full-quality unit price (INR in the harvest lot’s exact unit).",
    });
  else if (!validPrice)
    issues.push({
      code: "INVALID_PRICE",
      field: "pricePerUnit",
      message:
        "Full-quality unit price must be greater than zero, with at most nine integer digits and two decimal places.",
    });
  if (blank(recovery))
    issues.push({
      code: "MISSING_RECOVERY",
      field: "damagedRecovery",
      message:
        "Missing total damaged recovery (INR). Enter 0 explicitly if nothing was recovered.",
    });
  else if (!validRecovery)
    issues.push({
      code: "INVALID_RECOVERY",
      field: "damagedRecovery",
      message:
        "Total damaged recovery must be zero or positive, with at most nine integer digits and two decimal places.",
    });
  if (!input.priceEvidence?.trim())
    issues.push({
      code: "MISSING_EVIDENCE",
      field: "priceEvidence",
      message:
        "Missing price/recovery evidence: enter the receipt, date and reference.",
    });
  if (input.priceConfirmed !== true)
    issues.push({
      code: "MISSING_ATTESTATION",
      field: "priceConfirmed",
      message:
        "Missing valuation attestation: check “I verified same-unit price and actual damaged recovery” after reviewing the evidence.",
    });
  if (
    validPrice &&
    validRecovery &&
    input.damaged !== undefined &&
    quantity.test(input.damaged) &&
    scaled(recovery!, 2) * BigInt(1000) >
      scaled(input.damaged, 3) * scaled(price!, 2)
  ) {
    issues.push({
      code: "RECOVERY_EXCEEDS_VALUE",
      field: "damagedRecovery",
      message:
        "Total damaged recovery exceeds the damaged portion’s full-quality reference value. Review the same-unit price and recovery evidence.",
    });
  }
  return issues;
}
export function formatLossMoney(value: string) {
  // Display only: retain Decimal precision even for amounts beyond Number.MAX_SAFE_INTEGER.
  const [whole, fraction = "00"] = value.split(".");
  const decimals = fraction.padEnd(2, "0");
  return `₹${BigInt(whole).toLocaleString("en-IN")}${decimals === "00" ? "" : `.${decimals}`}`;
}
