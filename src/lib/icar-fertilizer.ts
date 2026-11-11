import data from "@/data/icar-fertilizer-recipes.json";

type Recipe = {
  id: string;
  cropAliases: string[];
  states: string[];
  districts?: string[];
  variant: string;
  conditions: string;
  productsKgHa?: { urea: number; dap: number; mop: number };
  nutrientsKgHa?: { n: number; p2o5: number; k2o: number };
  schedule: Array<{ label: string; ureaFraction?: number; dapFraction?: number; mopFraction?: number; nFraction?: number; pFraction?: number; kFraction?: number }>;
  source: { title: string; url: string };
};
const recipes = data.meta.recipes as unknown as Recipe[];
const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const canonicalCrop = (value: string) => {
  const name = normalize(value);
  if (/wheat|gehu/.test(name)) return "wheat";
  if (/rice|paddy|dhan/.test(name)) return "rice";
  if (/maize|corn|makka/.test(name)) return "maize";
  if (/chickpea|gram|chana/.test(name)) return "chickpea";
  if (/mustard|sarson|rai/.test(name)) return "mustard";
  return name;
};
const canonicalState = (value: string) => {
  const name = normalize(value);
  if (["nctofdelhi", "nationalcapitalterritoryofdelhi"].includes(name)) return "delhi";
  if (["orissa"].includes(name)) return "odisha";
  if (["uttaranchal"].includes(name)) return "uttarakhand";
  if (["pondicherry"].includes(name)) return "puducherry";
  if (["jammuandkashmir", "jammukashmir"].includes(name)) return "jammukashmir";
  return name;
};

export function getIcarRecipes(crop: string, state: string, district = "") {
  return recipes.filter(recipe =>
    recipe.cropAliases.some(alias => canonicalCrop(alias) === canonicalCrop(crop)) &&
    recipe.states.some(eligibleState => canonicalState(eligibleState) === canonicalState(state)) &&
    (!recipe.districts || recipe.districts.some(eligibleDistrict => normalize(eligibleDistrict) === normalize(district)))
  );
}

export function calculateIcarFertilizer(recipe: Recipe, areaHa: number) {
  const grades = data.meta.fertilizerGrades;
  const products = recipe.productsKgHa
    ? recipe.productsKgHa
    : {
        dap: recipe.nutrientsKgHa!.p2o5 / grades.dapP2O5,
        mop: recipe.nutrientsKgHa!.k2o / grades.mopK2O,
        urea: (recipe.nutrientsKgHa!.n - (recipe.nutrientsKgHa!.p2o5 / grades.dapP2O5) * grades.dapN) / grades.ureaN,
      };
  const schedule = recipe.schedule.map(split => {
    const amounts = split.ureaFraction !== undefined
      ? { urea: products.urea * split.ureaFraction!, dap: products.dap * split.dapFraction!, mop: products.mop * split.mopFraction! }
      : (() => {
          const dap = products.dap * split.pFraction!;
          const targetN = recipe.nutrientsKgHa!.n * split.nFraction!;
          const urea = Math.max(0, targetN - dap * grades.dapN) / grades.ureaN;
          const mop = products.mop * split.kFraction!;
          return { urea, dap, mop };
        })();
    return { label: split.label, urea: amounts.urea * areaHa, dap: amounts.dap * areaHa, mop: amounts.mop * areaHa };
  });
  return {
    perHa: { urea: products.urea, dap: products.dap, mop: products.mop },
    total: { urea: products.urea * areaHa, dap: products.dap * areaHa, mop: products.mop * areaHa },
    schedule,
  };
}

export function calculateCustomFertilizer(input: {
  nitrogenKgHa: number;
  phosphorusP2O5KgHa: number;
  potassiumK2OKgHa: number;
  areaHa: number;
  basalNitrogenPercent: number;
  basalPhosphorusPercent: number;
  basalPotassiumPercent: number;
  topdressLabel: string;
}) {
  const grades = data.meta.fertilizerGrades;
  const dapPerHa = input.phosphorusP2O5KgHa / grades.dapP2O5;
  if (dapPerHa * grades.dapN > input.nitrogenKgHa + 1e-9) return null;
  const mopPerHa = input.potassiumK2OKgHa / grades.mopK2O;
  const ureaPerHa = Math.max(0, input.nitrogenKgHa - dapPerHa * grades.dapN) / grades.ureaN;
  const basal = {
    dap: dapPerHa * input.basalPhosphorusPercent / 100,
    mop: mopPerHa * input.basalPotassiumPercent / 100,
  };
  const topdress = { dap: dapPerHa - basal.dap, mop: mopPerHa - basal.mop };
  const basalN = input.nitrogenKgHa * input.basalNitrogenPercent / 100;
  const topdressN = input.nitrogenKgHa - basalN;
  const basalUreaPerHa = Math.max(0, basalN - basal.dap * grades.dapN) / grades.ureaN;
  const topdressUreaPerHa = Math.max(0, topdressN - topdress.dap * grades.dapN) / grades.ureaN;
  const scale = (value: number) => value * input.areaHa;
  return {
    perHa: { urea: ureaPerHa, dap: dapPerHa, mop: mopPerHa },
    total: { urea: scale(ureaPerHa), dap: scale(dapPerHa), mop: scale(mopPerHa) },
    schedule: [
      { label: "Basal / sowing / transplanting", urea: scale(basalUreaPerHa), dap: scale(basal.dap), mop: scale(basal.mop) },
      { label: input.topdressLabel, urea: scale(topdressUreaPerHa), dap: scale(topdress.dap), mop: scale(topdress.mop) },
    ],
  };
}

export type IcarRecipe = Recipe;
