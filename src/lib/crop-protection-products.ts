import { z } from "zod";
import source from "../data/agriculture/product-restrictions.json";
export const productRestrictionSchema = z
  .object({
    version: z.string(),
    source: z.object({
      organization: z.string(),
      url: z.url(),
      documentDate: z.iso.date(),
      accessedOn: z.iso.date(),
    }),
    limitations: z.string(),
    records: z.array(
      z.object({
        ingredient: z.string().min(1),
        crops: z.array(z.string()).min(1),
        guidance: z.string(),
      }),
    ),
  })
  .strict();
export const productRestrictions = productRestrictionSchema.parse(source);
export function productRestrictionReview(ingredient: string, crop: string) {
  const records = productRestrictions.records.filter(
    (r) =>
      r.ingredient === ingredient.trim().toLowerCase() &&
      r.crops.some(
        (c) => c === "*" || c.toLowerCase() === crop.trim().toLowerCase(),
      ),
  );
  return {
    flags: records.map((r) => r.guidance),
    source: productRestrictions.source,
    limitation: productRestrictions.limitations,
    registrationVerified: false,
  };
}
