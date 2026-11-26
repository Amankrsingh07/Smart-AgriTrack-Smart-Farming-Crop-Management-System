import fixtures from "@/data/soil-demo-fixtures.json";
import type { SoilHealthInput } from "./soil-health";

export const soilDemoFixtures = fixtures.fixtures;
export const soilDemoFixtureVersion = fixtures.version;
export function soilDemoInput(id = soilDemoFixtures[0].id): SoilHealthInput {
  const fixture = soilDemoFixtures.find((item) => item.id === id);
  if (!fixture) throw new Error("Unknown soil demonstration fixture.");
  return {
    mode: "DEMO",
    synthetic: true,
    dataLabel: "DEMO DATA",
    demoFixtureId: fixture.id,
    state: "Bihar",
    district: "Saran",
    crop: "Wheat",
    growthStage: "Vegetative",
    soilType: "Alluvial",
    ...fixture.values,
    nutrientUnit: "kg/ha",
    phosphorusBasis: "P",
    potassiumBasis: "K",
    nitrogenMethod: "ALKALINE_KMNO4_N",
    phosphorusMethod: "OLSEN_P",
    potassiumMethod: "NEUTRAL_1N_NH4OAC_K",
    organicCarbonMethod: "WALKLEY_BLACK_OC",
    phMethod: "WATER_1_2_5",
    referenceStandardId: "BIHAR_CSTL_GOI_2011",
    labReferenceConfirmed: false,
    laboratoryName: "",
    reportNumber: "",
  };
}
