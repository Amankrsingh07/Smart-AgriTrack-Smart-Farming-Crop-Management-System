import locations from "@/data/india-locations.json";
import { indianStateNamesMatch } from "./india-location";
import reviews from "@/data/fertilizer/crop-source-review.json";
import {
  scientificDoses,
  doseSources,
  isExecutableScientificDose,
  matchesDoseDistrict,
} from "./scientific-dose-registry";
import { fertilizerCoverageTargets } from "./fertilizer-crop-registry";
export function fertilizerCoverage(
  configured: Array<{ id: string; name: string }> = [],
  state?: string,
  district?: string,
) {
  return fertilizerCoverageTargets(configured).map((c) => {
    const records = scientificDoses.filter(
      (r) =>
        isExecutableScientificDose(r) &&
        r.cropKey === c.key &&
        (!state || indianStateNamesMatch(r.state, state)) &&
        (!district || matchesDoseDistrict(r, district)),
    );
    const review = reviews.crops.find((r) => r.cropKey === c.key);
    return {
      crop: c.name,
      cropKey: c.key,
      cropIds: c.cropIds,
      region: state ?? "Configured regions only",
      standardDoseAvailable: records.length > 0,
      verifiedRegionalRecordCount: records.length,
      regions: [...new Set(records.map((r) => r.state))],
      districts: [
        ...new Set(records.flatMap((r) => (r.district ? [r.district] : []))),
      ],
      regionalStatus: records.length
        ? records.some((r) => r.applicationTiming.length > 0)
          ? "Verified"
          : "Partial"
        : !state && review?.sourcePagesContainingCrop.length
          ? "Review pending"
          : "Unavailable",
      soilTestAdjustedModelAvailable: false,
      applicationTimingAvailable: records.some(
        (r) => r.applicationTiming.length > 0,
      ),
      calendarEligibility:
        "Verified applicable dose + complete reviewed timing + owned cycle dates + explicit farmer confirmation",
      verificationStatus: records.length
        ? "VERIFIED_REGIONAL_STANDARD_ONLY"
        : "NO_COMPLETE_APPLICABLE_DOSE_VERIFIED",
      legacyCalculatorRecipeCount: 0,
      legacyStatus: "Legacy recommendation data removed",
      missingRequirements: [
        ...(!records.length
          ? [
              review?.missingRequirement ??
                "No reviewed dose exists for this configured crop.",
            ]
          : []),
        "No applicable executable soil-test adjustment/STCR model has been independently established.",
        ...(!records.some((r) => r.applicationTiming.length > 0)
          ? ["Complete source-supported application timing is unavailable."]
          : []),
      ],
      sources: records.length
        ? [
            ...new Set(
              records.map(
                (r) => doseSources.find((s) => s.id === r.sourceId)!.url,
              ),
            ),
          ]
        : [review?.reviewedSourceUrl ?? "https://soilhealth.dac.gov.in/"],
      researchPages: review?.sourcePagesContainingCrop ?? [],
    };
  });
}

export function fertilizerRegionalCoverage() {
  return locations.states.map(({ name, code: lgdCode }) => {
    const rows = fertilizerCoverage([], name);
    return {
      name,
      lgdCode,
      cropCount: rows.filter((row) => row.standardDoseAvailable).length,
      recordCount: rows.reduce(
        (count, row) => count + row.verifiedRegionalRecordCount,
        0,
      ),
      districtCount: new Set(rows.flatMap((row) => row.districts)).size,
    };
  });
}
