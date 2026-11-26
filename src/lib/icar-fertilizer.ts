import { verifiedFertilizerProducts } from "./fertilizer-product-grades";
import {
  matchScientificDoses,
  registryRecipe,
  type ScientificDose,
} from "./scientific-dose-registry";
import data from "@/data/icar-fertilizer-recipes.json";

type Recipe = {
  scientificRecord?: ScientificDose;
  publicationDate?: string | null;
  verificationStatus?: string;
  datasetVersion?: string;
  phosphorusProduct?: "DAP" | "SSP";
  calculationEnabled?: boolean;
  referenceReview?: {
    status: string;
    documentReference: string;
    issues: string[];
    action: string;
  };
  id: string;
  cropAliases: string[];
  states: string[];
  districts?: string[];
  variant: string;
  conditions: string;
  productsKgHa?: { urea: number; dap: number; mop: number };
  nutrientsKgHa?: { n: number; p2o5: number; k2o: number };
  schedule: Array<{
    label: string;
    ureaFraction?: number;
    dapFraction?: number;
    mopFraction?: number;
    nFraction?: number;
    pFraction?: number;
    kFraction?: number;
  }>;
  source: { title: string; url: string };
};
const recipes = data.meta.recipes as unknown as Recipe[];
const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const canonicalCrop = (value: string) => {
  const name = normalize(value);
  const aliases: Record<string, string[]> = {
    wheat: ["wheat", "gehu", "gehun"],
    rice: ["rice", "ricepaddy", "paddy", "dhan"],
    maize: ["maize", "corn", "makka"],
    chickpea: ["chickpea", "chickpeagram", "gram", "chana"],
    pigeonpea: ["pigeonpea", "arhar", "redgram", "tur"],
    blackgram: ["blackgram", "urad"],
    greengram: ["greengram", "mung", "moong"],
    mustard: ["mustard", "sarson", "rai"],
  };
  for (const [crop, names] of Object.entries(aliases))
    if (names.includes(name)) return crop;
  return name;
};
const canonicalState = (value: string) => {
  const name = normalize(value);
  if (["nctofdelhi", "nationalcapitalterritoryofdelhi"].includes(name))
    return "delhi";
  if (["orissa"].includes(name)) return "odisha";
  if (["uttaranchal"].includes(name)) return "uttarakhand";
  if (["pondicherry"].includes(name)) return "puducherry";
  if (["jammuandkashmir", "jammukashmir"].includes(name)) return "jammukashmir";
  return name;
};

export function getIcarRecipes(
  crop: string,
  state: string,
  district = "",
  context: {
    season?: string;
    irrigationCondition?: string;
    sowingCondition?: string;
    productionType?: string;
    confirmedRecipeId?: string;
    includeConfirmationOptions?: boolean;
  } = {},
) {
  const legacy = recipes.filter(
    (recipe) =>
      recipe.calculationEnabled !== false &&
      recipe.cropAliases.some(
        (alias) => canonicalCrop(alias) === canonicalCrop(crop),
      ) &&
      recipe.states.some(
        (eligibleState) =>
          canonicalState(eligibleState) === canonicalState(state),
      ) &&
      (!recipe.districts ||
        recipe.districts.some(
          (eligibleDistrict) =>
            normalize(eligibleDistrict) === normalize(district),
        )),
  );
  return [
    ...legacy,
    ...matchScientificDoses(crop, state, district, context.season, context).map(
      registryRecipe,
    ),
  ];
}

export type IcarProducts = {
  urea: number;
  dap: number;
  mop: number;
  ssp?: number;
};
export type IcarCalculation = {
  perHa: IcarProducts;
  total: IcarProducts;
  schedule: Array<IcarProducts & { label: string }>;
};
export function calculateIcarFertilizer(
  recipe: Recipe,
  areaHa: number,
): IcarCalculation {
  if (recipe.calculationEnabled === false)
    throw new Error(
      "This legacy recipe is withheld: regional scope and nutrient bases are not validated. Use an applicable issued advisory.",
    );
  if (!Number.isFinite(areaHa) || areaHa <= 0)
    throw new RangeError("Enter a finite area greater than zero.");
  const grades = data.meta.fertilizerGrades;
  if (recipe.phosphorusProduct === "SSP") {
    if (!recipe.nutrientsKgHa)
      throw new Error(
        "Explicit nutrient targets are required for an SSP plan.",
      );
    const targets = recipe.nutrientsKgHa;
    const perHa = {
      urea: targets.n / grades.ureaN,
      dap: 0,
      mop: targets.k2o / grades.mopK2O,
      ssp: targets.p2o5 / verifiedFertilizerProducts.SSP.p2o5,
    };
    const total = Object.fromEntries(
      Object.entries(perHa).map(([k, v]) => [k, v * areaHa]),
    ) as typeof perHa;
    const schedule = recipe.schedule.map((split) => ({
      label: split.label,
      urea: total.urea * (split.nFraction ?? 0),
      dap: 0,
      mop: total.mop * (split.kFraction ?? 0),
      ssp: total.ssp * (split.pFraction ?? 0),
    }));
    if (!schedule.length)
      schedule.push({
        label: "Timing unavailable — no actionable schedule",
        ...total,
      });
    return { perHa, total, schedule };
  }
  const products = recipe.productsKgHa
    ? recipe.productsKgHa
    : {
        dap: recipe.nutrientsKgHa!.p2o5 / grades.dapP2O5,
        mop: recipe.nutrientsKgHa!.k2o / grades.mopK2O,
        urea:
          (recipe.nutrientsKgHa!.n -
            (recipe.nutrientsKgHa!.p2o5 / grades.dapP2O5) * grades.dapN) /
          grades.ureaN,
      };
  if (products.urea < -1e-9)
    throw new Error(
      "DAP exceeds the N target; select a source-compatible alternate phosphorus product.",
    );
  const schedule = recipe.schedule.map((split) => {
    const amounts =
      split.ureaFraction !== undefined
        ? {
            urea: products.urea * split.ureaFraction!,
            dap: products.dap * split.dapFraction!,
            mop: products.mop * split.mopFraction!,
          }
        : (() => {
            const dap = products.dap * split.pFraction!;
            const targetN = recipe.nutrientsKgHa!.n * split.nFraction!;
            const urea =
              Math.max(0, targetN - dap * grades.dapN) / grades.ureaN;
            const mop = products.mop * split.kFraction!;
            return { urea, dap, mop };
          })();
    return {
      label: split.label,
      urea: amounts.urea * areaHa,
      dap: amounts.dap * areaHa,
      mop: amounts.mop * areaHa,
    };
  });
  const remaining = Object.fromEntries(
    (["urea", "dap", "mop"] as const).map((key) => [
      key,
      Math.max(
        0,
        products[key] * areaHa -
          schedule.reduce((sum, row) => sum + row[key], 0),
      ),
    ]),
  ) as { urea: number; dap: number; mop: number };
  if (Object.values(remaining).some((value) => value > 1e-9))
    schedule.push({
      label:
        "Unscheduled balance — source timing not configured; verify locally before applying",
      ...remaining,
    });
  return {
    perHa: { urea: products.urea, dap: products.dap, mop: products.mop },
    total: {
      urea: products.urea * areaHa,
      dap: products.dap * areaHa,
      mop: products.mop * areaHa,
    },
    schedule,
  };
}

type CustomFertilizerInput = {
  phosphorusProduct?: "DAP" | "SSP";
  nitrogenKgHa: number;
  phosphorusP2O5KgHa: number;
  potassiumK2OKgHa: number;
  areaHa: number;
  basalNitrogenPercent: number;
  basalPhosphorusPercent: number;
  basalPotassiumPercent: number;
  topdressLabel: string;
};

/** Absolute nutrient/product tolerance in kg/ha for floating-point arithmetic. */
export const FERTILIZER_TOLERANCE = 1e-9;
export function customFertilizerError(
  input: CustomFertilizerInput,
): string | null {
  const rates = [
    input.nitrogenKgHa,
    input.phosphorusP2O5KgHa,
    input.potassiumK2OKgHa,
  ];
  if (!Number.isFinite(input.areaHa) || input.areaHa <= 0)
    return "Enter a finite area greater than zero.";
  if (
    rates.some(
      (value) => !Number.isFinite(value) || value < 0 || value > 100000,
    )
  )
    return "Nutrient targets must be finite values between 0 and 100000 kg/ha.";
  if (
    [
      input.basalNitrogenPercent,
      input.basalPhosphorusPercent,
      input.basalPotassiumPercent,
    ].some((value) => !Number.isFinite(value) || value < 0 || value > 100)
  )
    return "Basal percentages must be between 0 and 100.";
  if (!input.topdressLabel.trim())
    return "Enter the topdressing application time.";
  const dapN =
    input.phosphorusProduct === "SSP"
      ? 0
      : (input.phosphorusP2O5KgHa / data.meta.fertilizerGrades.dapP2O5) *
        data.meta.fertilizerGrades.dapN;
  if (dapN > input.nitrogenKgHa + FERTILIZER_TOLERANCE)
    return "DAP alone supplies more nitrogen than the total N target. Review the validated recommendation or phosphorus fertilizer choice.";
  if (
    (dapN * input.basalPhosphorusPercent) / 100 >
    (input.nitrogenKgHa * input.basalNitrogenPercent) / 100 +
      FERTILIZER_TOLERANCE
  )
    return "Basal DAP supplies more nitrogen than the basal N target. Review basal N/P percentages with the adviser; no schedule was generated.";
  if (
    dapN * (1 - input.basalPhosphorusPercent / 100) >
    input.nitrogenKgHa * (1 - input.basalNitrogenPercent / 100) +
      FERTILIZER_TOLERANCE
  )
    return "Topdressing DAP supplies more nitrogen than the topdressing N target. Review N/P split percentages with the adviser; no schedule was generated.";
  return null;
}

export function calculateCustomFertilizer(input: CustomFertilizerInput) {
  if (customFertilizerError(input)) return null;
  if (input.phosphorusProduct === "SSP")
    return calculateIcarFertilizer(
      {
        id: "manual-ssp-arithmetic",
        cropAliases: [],
        states: [],
        variant: "User-provided rates — unverified",
        conditions: "Arithmetic only; not an independently validated crop dose",
        phosphorusProduct: "SSP",
        nutrientsKgHa: {
          n: input.nitrogenKgHa,
          p2o5: input.phosphorusP2O5KgHa,
          k2o: input.potassiumK2OKgHa,
        },
        schedule: [
          {
            label: "Farmer-entered basal timing",
            nFraction: input.basalNitrogenPercent / 100,
            pFraction: input.basalPhosphorusPercent / 100,
            kFraction: input.basalPotassiumPercent / 100,
          },
          {
            label: input.topdressLabel,
            nFraction: 1 - input.basalNitrogenPercent / 100,
            pFraction: 1 - input.basalPhosphorusPercent / 100,
            kFraction: 1 - input.basalPotassiumPercent / 100,
          },
        ],
        source: {
          title: "User-provided advisory — not independently verified",
          url: "",
        },
      },
      input.areaHa,
    );
  const grades = data.meta.fertilizerGrades;
  const dapPerHa = input.phosphorusP2O5KgHa / grades.dapP2O5;
  if (dapPerHa * grades.dapN > input.nitrogenKgHa + 1e-9) return null;
  const mopPerHa = input.potassiumK2OKgHa / grades.mopK2O;
  const ureaPerHa =
    Math.max(0, input.nitrogenKgHa - dapPerHa * grades.dapN) / grades.ureaN;
  const basal = {
    dap: (dapPerHa * input.basalPhosphorusPercent) / 100,
    mop: (mopPerHa * input.basalPotassiumPercent) / 100,
  };
  const topdress = {
    dap: Math.max(0, dapPerHa - basal.dap),
    mop: Math.max(0, mopPerHa - basal.mop),
  };
  const basalN = (input.nitrogenKgHa * input.basalNitrogenPercent) / 100;
  const topdressN = input.nitrogenKgHa - basalN;
  const basalUreaPerHa =
    Math.max(0, basalN - basal.dap * grades.dapN) / grades.ureaN;
  const topdressUreaPerHa =
    Math.max(0, topdressN - topdress.dap * grades.dapN) / grades.ureaN;
  const scale = (value: number) => value * input.areaHa;
  return {
    perHa: { urea: ureaPerHa, dap: dapPerHa, mop: mopPerHa },
    total: {
      urea: scale(ureaPerHa),
      dap: scale(dapPerHa),
      mop: scale(mopPerHa),
    },
    schedule: [
      {
        label: "Basal / sowing / transplanting",
        urea: scale(basalUreaPerHa),
        dap: scale(basal.dap),
        mop: scale(basal.mop),
      },
      {
        label: input.topdressLabel,
        urea: scale(topdressUreaPerHa),
        dap: scale(topdress.dap),
        mop: scale(topdress.mop),
      },
    ],
  };
}

export type IcarRecipe = Recipe;

/** Review withheld legacy references without making their retained numeric fields calculable. */
export function getIcarReferenceReviews(crop: string, state: string) {
  return (
    data.meta.recipes as unknown as Array<
      Recipe & { originalStates?: string[] }
    >
  )
    .filter(
      (recipe) =>
        recipe.calculationEnabled === false &&
        recipe.cropAliases.some(
          (alias) => canonicalCrop(alias) === canonicalCrop(crop),
        ) &&
        (recipe.originalStates ?? []).some(
          (region) => canonicalState(region) === canonicalState(state),
        ),
    )
    .map((recipe) => ({
      id: recipe.id,
      source: recipe.source,
      ...recipe.referenceReview,
    }));
}
