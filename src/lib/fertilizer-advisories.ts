import { fertilizerCropKey } from "./fertilizer-crop-registry";
import { soilLocationsMatch } from "./soil-health-links";
import type { SoilHealthInput } from "./soil-health";

const riceGreenManure = {
  title: "Dhaincha green manuring before transplanted rice",
  organization: "ICAR–MGIFRI, Motihari",
  date: "2026-06-19",
  url: "https://www.icar.gov.in/en/icar-mgifri-motihari-and-bihar-agriculture-department-promote-balanced-fertilizer-use-under-khet",
  scope:
    "East Champaran, Bihar. Applies to pre-transplant planning for transplanted rice; confirm the planting method with your KVK.",
  detail:
    "ICAR discusses incorporating Dhaincha before transplanting. Ask the KVK whether it fits this field. Field-specific nutrient credit and fertilizer quantities are unavailable.",
};

export function fertilizerAdvisories(context: SoilHealthInput) {
  return fertilizerCropKey(context.crop) === "rice" &&
    context.season === "KHARIF" &&
    soilLocationsMatch(context, { state: "Bihar", district: "East Champaran" })
    ? [riceGreenManure]
    : [];
}
