import { analyzeSoil } from "./soil-health";
import { soilHealthSchema } from "./soil-health-validation";

type Screening = Pick<ReturnType<typeof analyzeSoil>, "nutrients" | "ph">;

/** Use the saved screening where available; recover older rows from recorded evidence. */
export function savedSoilScreening(
  input: unknown,
  result: Partial<Screening> | null | undefined,
) {
  const recorded = Array.isArray(result?.nutrients) ? result.nutrients : [];
  const saved = recorded.filter((row) => row?.name && row?.rating);
  const ph = result?.ph;
  if (
    saved.length === 3 &&
    saved.every(
      (row) => row.explanationCode === "COMPATIBLE_REFERENCE" && row.reference,
    ) &&
    ph?.explanationCode === "COMPATIBLE_REFERENCE" &&
    ph.reference
  )
    return { nutrients: saved, ph };

  // The API stores a missing pH as JSON null.
  const parsed = soilHealthSchema.safeParse(
    input && typeof input === "object" && "soilPh" in input && input.soilPh === null
      ? { ...input, soilPh: undefined }
      : input,
  );
  if (!parsed.success) return { nutrients: saved, ph };
  const current = analyzeSoil(parsed.data);
  return {
    nutrients: current.nutrients.map((row) => {
      const original = saved.find((item) => item.name === row.name);
      return original?.explanationCode === "COMPATIBLE_REFERENCE" &&
        original.reference
        ? original
        : row;
    }),
    ph:
      ph?.explanationCode === "COMPATIBLE_REFERENCE" && ph.reference
        ? ph
        : current.ph,
  };
}

export function soilScreeningReason(row: {
  guidance?: string;
  applicabilityExplanation?: string;
}) {
  return (
    row.applicabilityExplanation ||
    row.guidance ||
    "The saved report has insufficient laboratory details to recover the classification reason."
  );
}
