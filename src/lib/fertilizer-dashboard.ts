import { estimateCost, fieldHectares } from "./smart-fertilizer";
import { buildStandardCropPlan } from "./standard-crop-plan";
import { verifiedFertilizerProducts } from "./fertilizer-product-grades";
import { soilLocationsMatch } from "./soil-health-links";
import { soilHealthSchema } from "./soil-health-validation";
import { isDemoSoilSample } from "./soil-sample-mode";
import type { SoilHealthInput } from "./soil-health";

export function dashboardFieldArea(area: number, unit: string) {
  try {
    return fieldHectares(area, unit);
  } catch {
    return undefined;
  }
}

export function dashboardSoilInput(
  report: { input: unknown; result: unknown; fieldId: string | null },
  context: SoilHealthInput,
) {
  const parsed = soilHealthSchema.safeParse(report.input);
  if (!parsed.success || report.fieldId !== context.fieldId) return null;
  const input = parsed.data;
  if (
    !input.supplementalReadings?.length &&
    [
      input.nitrogenKgHa,
      input.phosphorusKgHa,
      input.potassiumKgHa,
      input.soilPh,
      input.organicCarbonPercent,
    ].every((value) => value === undefined) &&
    !input.nutritionSamples?.some((sample) =>
      ["secondary", "micro", "properties"].includes(sample.group),
    )
  )
    return null;
  if (
    isDemoSoilSample(
      input,
      report.result as Parameters<typeof isDemoSoilSample>[1],
    ) ||
    (report.input as SoilHealthInput).mode !== "REAL" ||
    (input.fieldId && input.fieldId !== context.fieldId) ||
    !soilLocationsMatch(input, context) ||
    input.soilType !== context.soilType
  )
    return null;
  return {
    ...input,
    barleyUse: undefined,
    waterRegime: context.waterRegime,
    sowingCondition: context.sowingCondition,
    ...context,
  };
}

const integratedPackages = new Set([
  "aau-assam-lentil-inoculated-basal",
  "tnau-tamil-nadu-jute-general",
]);

export function dashboardStandard(
  input: SoilHealthInput,
  finished: boolean,
  confirmedRecipe?: string,
  preference = "conventional",
) {
  const initial = buildStandardCropPlan(input, confirmedRecipe, {
    season: input.season,
    publicationConditionsConfirmed: !!confirmedRecipe,
    includeConfirmationOptions: !confirmedRecipe,
  });
  if (confirmedRecipe === "wheat-bihar-rabi" && input.season !== "RABI")
    return {
      ...initial,
      calculation: null,
      choices: [],
      reason: "Bihar wheat requires the published Rabi season.",
    };
  if (finished)
    return {
      ...initial,
      calculation: null,
      choices: [],
      reason: "This crop cycle is finished. Review its recorded applications.",
    };
  if (
    preference === "organic" ||
    (confirmedRecipe &&
      preference === "integrated" &&
      !integratedPackages.has(confirmedRecipe))
  )
    return {
      ...initial,
      calculation: null,
      choices: [],
      reason:
        "No verified quantitative plan for this farming preference is available for the selected crop and region.",
    };
  // A regional match alone cannot confirm the publication's production conditions.
  const choices = initial.choices.filter(
    (choice) =>
      (preference !== "integrated" || integratedPackages.has(choice.id)) &&
      (choice.id !== "wheat-bihar-rabi" || input.season === "RABI") &&
      buildStandardCropPlan(input, choice.id, {
        season: input.season,
        publicationConditionsConfirmed: true,
      }).calculation,
  );
  if (confirmedRecipe) return { ...initial, choices };
  const reason = choices.length
    ? null
    : preference === "integrated" && initial.choices.length
      ? "No verified quantitative plan for this farming preference is available for the selected crop and region."
      : (initial.reason ??
        "No supported standard recommendation exists for this crop and region.");
  return { ...initial, choices, calculation: null, reason };
}

type Grade =
  (typeof verifiedFertilizerProducts)[keyof typeof verifiedFertilizerProducts];
type Application = {
  product: string;
  quantityKg: number;
  status: string;
  composition: unknown;
  cost: number | null;
};
type Price = {
  name: string;
  composition: unknown;
  price: number;
  bagKg: number;
  id: string;
  recordedAt: Date;
};
const productKey = (name: string) => name.trim().toLowerCase();
function matchesGrade(value: unknown, grade: Grade) {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return Object.entries(grade).every(([key, amount]) => row[key] === amount);
}

export function matchingFertilizerRecords(
  products: readonly { name: string; composition: unknown; organic: boolean }[],
) {
  return Object.entries(verifiedFertilizerProducts).flatMap(([name, grade]) => {
    const matches = products.filter(
      (product) =>
        !product.organic &&
        productKey(product.name) === productKey(name) &&
        matchesGrade(product.composition, grade),
    );
    return matches.length > 1 ? [{ name, count: matches.length }] : [];
  });
}

export function summaryOfApplications(rows: Application[]) {
  const applied = rows.filter((row) => row.status === "APPLIED");
  const knownCosts = applied.filter((row) => row.cost !== null);
  return {
    planned: rows
      .filter((row) => row.status === "PLANNED")
      .reduce((sum, row) => sum + row.quantityKg, 0),
    applied: applied.reduce((sum, row) => sum + row.quantityKg, 0),
    actualCost: knownCosts.length
      ? knownCosts.reduce((sum, row) => sum + row.cost!, 0)
      : null,
    incompleteCost: knownCosts.length !== applied.length,
  };
}

export function standardProductCards(
  plan: ReturnType<typeof dashboardStandard>,
  history: Application[],
  prices: Price[] | null,
) {
  const productNames = Object.keys(verifiedFertilizerProducts) as Array<
    keyof typeof verifiedFertilizerProducts
  >;
  const targetFor = (name: keyof typeof verifiedFertilizerProducts) =>
    plan.calculation?.total[
      name.toLowerCase() as "urea" | "dap" | "mop" | "ssp"
    ] ?? 0;
  const appliedRows = history.filter((row) => row.status === "APPLIED");
  const compatible =
    appliedRows.every((row) =>
      productNames.some(
        (name) =>
          productKey(name) === productKey(row.product) &&
          targetFor(name) > 0 &&
          matchesGrade(row.composition, verifiedFertilizerProducts[name]),
      ),
    ) &&
    productNames.every(
      (name) =>
        appliedRows
          .filter((row) => productKey(name) === productKey(row.product))
          .reduce((sum, row) => sum + row.quantityKg, 0) <=
        targetFor(name) + 0.001,
    );
  const newestPrices = prices?.toSorted(
    (a, b) =>
      b.recordedAt.getTime() - a.recordedAt.getTime() ||
      b.id.localeCompare(a.id),
  );
  return productNames.flatMap((name) => {
    const key = name.toLowerCase() as "urea" | "dap" | "mop" | "ssp";
    const target = targetFor(name);
    if (target <= 0) return [];
    const grade = verifiedFertilizerProducts[name];
    const quantity = (status: string) =>
      history
        .filter(
          (row) => row.status === status && productKey(row.product) === key,
        )
        .reduce((sum, row) => sum + row.quantityKg, 0);
    const applied = quantity("APPLIED");
    const planned = quantity("PLANNED");
    // Alternative grades and materials can have overlapping nutrients. A same-name
    // subtraction would overstate what is safe to apply in those circumstances.
    const remaining = compatible ? Math.max(0, target - applied) : null;
    const price = newestPrices?.find(
      (row) =>
        productKey(row.name) === key &&
        matchesGrade(row.composition, grade) &&
        Number.isFinite(row.price) &&
        row.price >= 0 &&
        Number.isFinite(row.bagKg) &&
        row.bagKg > 0,
    );
    return [
      {
        name,
        grade,
        target,
        applied,
        planned,
        remaining,
        unitPrice: price ? price.price / price.bagKg : null,
        estimate:
          !price || remaining === null || !plan.areaHa
            ? null
            : estimateCost(remaining, price.price, price.bagKg, plan.areaHa)
                .total,
        schedule: plan.timingVerified
          ? (plan.calculation?.schedule ?? [])
              .filter(
                (row) =>
                  (row[key] ?? 0) > 0 &&
                  !row.label.startsWith("Unscheduled balance"),
              )
              .map((row) => ({ label: row.label, quantity: row[key]! }))
          : [],
      },
    ];
  });
}
