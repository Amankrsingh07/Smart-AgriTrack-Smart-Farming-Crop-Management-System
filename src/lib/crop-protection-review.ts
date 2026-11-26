import { z } from "zod";
import { indiaDateKey } from "./crop-cycle-status";
export const expertRoles = [
  "AGRICULTURE_EXPERT",
  "SOIL_TESTING_EXPERT",
  "ADMINISTRATOR",
];
export const reviewSchema = z
  .object({
    observations: z.string().trim().min(10).max(4000),
    suspectedCause: z.string().trim().min(1).max(500),
    verificationStatus: z.enum([
      "Expert assessment; testing required",
      "Expert-reviewed diagnosis",
      "Laboratory-Confirmed Contamination",
    ]),
    laboratoryEvidence: z
      .array(
        z.object({
          matrix: z.enum([
            "Agricultural soil",
            "Environmental soil",
            "Irrigation water",
            "Food / feed",
          ]),
          parameter: z.string().trim().min(1).max(80),
          value: z.number().finite().nonnegative(),
          limit: z.number().finite().nonnegative(),
          unit: z.string().trim().min(1).max(30),
          laboratory: z.string().trim().min(1).max(200),
          reportReference: z.string().trim().min(1).max(200),
          sampleDate: z.iso
            .date()
            .refine(
              (v) => v <= indiaDateKey(new Date()),
              "Verified sample date cannot be in the future.",
            ),
          method: z.string().trim().min(1).max(200),
          standardName: z.string().trim().min(1).max(200),
          standardVersion: z.string().trim().min(1).max(100),
          sourceUrl: z
            .url()
            .max(2000)
            .refine((u) => u.startsWith("https://")),
          applicability: z.string().trim().min(20).max(1000),
          qualifiedReportVerified: z.literal(true),
        }),
      )
      .max(30)
      .default([]),
  })
  .superRefine((v, ctx) => {
    if (
      v.verificationStatus === "Laboratory-Confirmed Contamination" &&
      !v.laboratoryEvidence.some((l) => l.value > l.limit)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Confirmation requires verified qualified-laboratory evidence exceeding an explicitly applicable reference limit.",
      });
  });
