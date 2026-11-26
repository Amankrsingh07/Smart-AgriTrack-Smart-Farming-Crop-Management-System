import { z } from "zod";
import {
  grainStorageReferences,
  shortStorageReferences,
  irriIntermediatePaddy,
  type StorageReference,
  storageSources,
} from "../data/agriculture/storage-references";
export { storageReferenceVersion } from "../data/agriculture/storage-references";
import { indiaDateKey } from "./crop-cycle-status";

export const inspectionFindings = z
  .object({
    moisture: z.number().finite().min(0).max(100).nullable(),
    temperature: z.number().finite().min(-273.15).nullable(),
    humidity: z.number().finite().min(0).max(100).nullable(),
    pests: z.enum(["Unknown", "Observed", "None observed"]),
    mold: z.enum(["Unknown", "Observed", "None observed"]),
    condition: z.enum([
      "Unknown",
      "Clean and dry",
      "Damp or damaged",
      "Good",
      "Moderate",
      "Poor",
    ]),
    pestType: z.string().trim().min(1).max(120).optional(),
    severity: z.enum(["Unknown", "Mild", "Moderate", "Severe"]).optional(),
    symptoms: z.string().trim().min(1).max(500).optional(),
    disease: z.enum(["Unknown", "Observed", "None observed"]).optional(),
    storageType: z
      .enum(["Unknown", "Warehouse", "Silo", "Bags", "Traditional storage"])
      .optional(),
    commodityForm: z.enum(["paddy", "milled rice"]).optional(),
    durationDays: z.number().int().min(0).max(36500).optional(),
    ventilation: z.enum(["Unknown", "Good", "Moderate", "Poor"]).optional(),
    leakage: z.enum(["Unknown", "Observed", "None observed"]).optional(),
  })
  .strict();

export const inspectionInput = z
  .object({
    productionId: z.string().min(1).max(191),
    version: z.number().int().min(0).max(2147483646),
    inspectedOn: z.iso
      .date()
      .refine(
        (date) => date <= indiaDateKey(new Date()),
        "Use a real inspection date, on or before today.",
      ),
    findings: inspectionFindings,
  })
  .strict()
  .refine(
    ({ findings }) =>
      Object.values(findings).some(
        (value) => value != null && value !== "Unknown",
      ),
    {
      message: "Enter at least one measurement or observation.",
    },
  );

export type Inspection = z.infer<typeof inspectionFindings>;
export type SavedInspection = {
  version: number;
  inspectedOn: string;
  createdAt?: string;
  findings: Inspection;
  attachments?: { id: string; filename: string }[];
};

export function storageCrop(crop: string, form?: Inspection["commodityForm"]) {
  const name = crop.trim().toLowerCase().replace(/\s+/g, " ");
  if (name === "rice") return form ?? name;
  const aliases = new Map([
    ["corn", "maize"],
    ["makka", "maize"],
    ["rice (paddy)", "paddy"],
    ["paddy rice", "paddy"],
    ["rough rice", "paddy"],
    ["rice (milled)", "milled rice"],
    ["mustard seed", "mustard"],
    ["soya bean", "soybean"],
    ["pearl millet (bajra)", "millet"],
    ["bajra", "millet"],
  ]);
  return aliases.get(name) ?? name;
}

export function storageReference(crop: string) {
  const key = storageCrop(crop);
  return Object.hasOwn(grainStorageReferences, key)
    ? grainStorageReferences[key]
    : null;
}

export function cropPhReference(crop: string) {
  const name = crop.trim().toLowerCase();
  const range = ["rice", "rice (paddy)", "paddy"].includes(name)
    ? [5.5, 7.5]
    : ["wheat", "maize", "corn", "makka"].includes(name)
      ? [5.5, 7]
      : null;
  return range
    ? {
        range,
        version: "FAO Bulletin 16 · 2006",
        source: "https://www.fao.org/4/a0443e/a0443e02.pdf",
      }
    : null;
}

export const storageRiskOrder = [
  "No current concern",
  "Insufficient data",
  "Inspection required",
  "Potential concern",
  "High concern",
] as const;
type Status = (typeof storageRiskOrder)[number];
export type RainDay = {
  date: string;
  rainMm: number | null;
  rainProbability: number | null;
};
export const emptyInspection: Inspection = {
  moisture: null,
  temperature: null,
  humidity: null,
  pests: "Unknown",
  mold: "Unknown",
  condition: "Unknown",
};
export const storageActions = {
  inspection: "Inspect stored produce for insects or damage.",
  moisture:
    "Check grain moisture before storage and ask about testing suspected mold.",
  segregation:
    "Segregate affected grain. Hold it from food, feed and sale. Ask a grain safety specialist for representative sampling and crop-appropriate mycotoxin testing.",
  structure:
    "Repair leaks, keep grain clear of damp surfaces and ask a storage adviser to review ventilation.",
  climate:
    "Check for condensation and hot spots. Ask a storage adviser to review cooling and aeration.",
  rain: "Check the weather and have cover ready for exposed produce.",
} as const;

/** A published moisture limit is usable only when its crop and stated storage period fit this lot. */
export function storageMoistureGuideline(
  crop: string,
  durationDays: number | null | undefined,
  onlineReference?: StorageReference | null,
) {
  const reference = storageReference(crop);
  if (!reference)
    return {
      available: false as const,
      reference: null,
      reason:
        storageCrop(crop) === "rice"
          ? "Select whether the lot contains paddy or milled rice."
          : "No crop-specific moisture guideline is available.",
    };
  if (durationDays == null)
    return {
      available: false as const,
      reference,
      reason:
        "Record the planned storage duration to check whether this guideline applies.",
    };
  const key = storageCrop(crop);
  const short = Object.hasOwn(shortStorageReferences, key)
    ? shortStorageReferences[key]
    : undefined;
  const fits = (row: StorageReference) =>
    Number.isInteger(durationDays) &&
    durationDays >= (row.minDays ?? 0) &&
    durationDays <= (row.maxDays ?? 36500);
  const applicable =
    [short, reference].find(
      (row) =>
        row &&
        (row.minDays !== undefined || row.maxDays !== undefined) &&
        fits(row),
    ) ??
    (key === "paddy" &&
    onlineReference === irriIntermediatePaddy &&
    fits(onlineReference)
      ? onlineReference
      : undefined);
  if (applicable)
    return {
      available: true as const,
      reference: applicable,
      reason:
        "The crop and recorded storage duration match the published guideline scope.",
    };
  return {
    available: false as const,
    reference,
    reason:
      reference.duration === "Reference duration unavailable"
        ? "The source does not state an applicable storage duration."
        : !reference.minDays && !reference.maxDays
          ? "The applicable hot-region and storage-duration scope is not verified for this lot."
          : key === "paddy"
            ? "No verified paddy rule covers this duration in the available sources."
            : key === "barley"
              ? "The source does not state an applicable storage duration."
              : "This guideline is limited to storage up to one year.",
  };
}

export function storageRisk(
  findings: Inspection,
  crop: string,
  forecast: readonly RainDay[] = [],
  onlineReference?: StorageReference | null,
) {
  const commodity = storageCrop(crop, findings.commodityForm);
  const moistureGuideline = storageMoistureGuideline(
    commodity,
    findings.durationDays,
    onlineReference,
  );
  const reference = moistureGuideline.reference;
  const card = (
    label: string,
    status: Status,
    note: string,
    action: string,
    value?: string,
    standard?: string,
    source?: string,
  ) => ({ label, status, note, action, value, standard, source });
  const {
    moisture,
    temperature,
    humidity,
    pests,
    mold,
    disease,
    symptoms,
    condition,
    ventilation,
    leakage,
    severity,
  } = findings;
  const withinReference =
    "Recorded reading is within the published scenario benchmark.";
  const annualScenario = reference?.source === storageSources.annual;
  const climateFits =
    !annualScenario ||
    (temperature != null &&
      humidity != null &&
      temperature <= 27 &&
      humidity <= 70);
  const paddyWarmHumid =
    commodity === "paddy" &&
    temperature != null &&
    humidity != null &&
    ((temperature >= 25 &&
      temperature <= 35 &&
      humidity >= 65 &&
      humidity <= 80) ||
      (temperature >= 30 && temperature <= 40 && humidity > 65));
  // A warm, humid store is a warning. Readings outside a favourable pest
  // range cannot establish safe conditions.
  const humidGrainStore =
    !!reference && !annualScenario && humidity != null && humidity > 70;
  const scopeReason = !reference
    ? `Guideline unavailable. ${moistureGuideline.reason}`
    : annualScenario && !moistureGuideline.available
      ? `Guideline unavailable. ${moistureGuideline.reason}`
      : "No crop-specific indoor limit is published in the matched reference.";
  const mustardScreenExceeded =
    commodity === "mustard" &&
    moisture != null &&
    reference != null &&
    moisture > reference.moisture;
  const moistureExceeded =
    moisture != null &&
    moistureGuideline.available &&
    (reference!.strictMaximum
      ? moisture >= reference!.moisture
      : moisture > reference!.moisture);
  const climateCard = (
    label: string,
    value: number | null,
    limit: number,
    unit: string,
  ) => {
    const humidityWarning = unit === "%" && humidGrainStore;
    const warning =
      value != null &&
      (paddyWarmHumid || humidityWarning || (annualScenario && value > limit));
    const within =
      value != null &&
      annualScenario &&
      moistureGuideline.available &&
      !warning;
    return card(
      label,
      warning
        ? "Potential concern"
        : within
          ? "No current concern"
          : "Inspection required",
      value == null
        ? "Indoor reading not recorded. Measure inside the storage area."
        : paddyWarmHumid
          ? "Warm and humid paddy storage can encourage pests and mold."
          : warning
            ? "Above the published scenario. Warm or humid conditions can increase deterioration."
            : within
              ? withinReference
              : scopeReason,
      storageActions.climate,
      value == null ? undefined : `${value} ${unit}`,
      annualScenario
        ? `${limit} ${unit} · ${reference?.duration}`
        : paddyWarmHumid
          ? "Published paddy pest or microbial growth conditions"
          : humidityWarning
            ? "Above 70% RH · general FAO grain storage warning"
            : undefined,
      annualScenario
        ? storageSources.annual
        : paddyWarmHumid
          ? storageSources.odisha
          : humidityWarning
            ? storageSources.hotRegions
            : undefined,
    );
  };
  const pestConflict =
    pests === "None observed" &&
    (!!findings.pestType || severity === "Moderate" || severity === "Severe");
  const pestRisk =
    pests === "Observed"
      ? severity === "Moderate" || severity === "Severe"
        ? "Potential concern"
        : "Inspection required"
      : pests === "None observed" && !pestConflict
        ? "No current concern"
        : "Inspection required";
  const diseaseRisk =
    disease === "None observed" && !symptoms
      ? "No current concern"
      : "Inspection required";
  const moldRisk =
    mold === "Observed"
      ? "Potential concern"
      : mold === "None observed"
        ? "No current concern"
        : "Inspection required";
  const poor =
    condition === "Poor" ||
    condition === "Damp or damaged" ||
    ventilation === "Poor";
  const moderate = condition === "Moderate" || ventilation === "Moderate";
  const rain = forecast.find(
    (day) => (day.rainMm ?? 0) > 0 || (day.rainProbability ?? 0) > 0,
  );
  const rainReading = rain ?? forecast[0];
  const rainComplete =
    forecast.length > 0 &&
    forecast.every((day) => day.rainMm != null && day.rainProbability != null);
  const cards = [
    card(
      "Pest infestation",
      pestRisk,
      pests === "Observed"
        ? "Pest observed; severity determines whether closer inspection is needed."
        : pestConflict
          ? "Pest status says none observed, but pest details or severity are also recorded. Recheck the inspection."
          : pests === "None observed"
            ? "No pests observed during this inspection."
            : "Pest status is unknown. Inspection is needed.",
      storageActions.inspection,
      [findings.pestType, severity].filter(Boolean).join(" · ") || undefined,
      undefined,
      storageSources.hotRegions,
    ),
    card(
      "Disease symptoms",
      diseaseRisk,
      disease === "Observed"
        ? "Symptoms recorded. This is not a confirmed diagnosis."
        : disease === "None observed" && symptoms
          ? "No disease symptoms was selected, but symptom notes are present. Recheck this inspection."
          : disease === "None observed"
            ? "No disease symptoms observed during this inspection."
            : "Disease symptom status is unknown. Inspection is needed.",
      storageActions.inspection,
      symptoms,
      undefined,
      storageSources.codex,
    ),
    card(
      "Visible mold",
      moldRisk,
      mold === "Observed"
        ? "Visible mold recorded. Keep affected produce separate and arrange appropriate inspection."
        : mold === "None observed"
          ? "No visible mold observed during this inspection."
          : "Mold status is unknown. Inspection is needed.",
      mold === "Observed"
        ? storageActions.segregation
        : storageActions.inspection,
      undefined,
      undefined,
      storageSources.codex,
    ),
    card(
      "Grain moisture",
      moistureExceeded || mustardScreenExceeded
        ? "Potential concern"
        : moisture == null || !moistureGuideline.available || !climateFits
          ? "Inspection required"
          : "No current concern",
      moisture == null
        ? "Moisture reading not recorded. Measure grain moisture as wet-basis percentage."
        : mustardScreenExceeded
          ? "Above the published moisture guideline. Damp grain can deteriorate faster."
          : !moistureGuideline.available
            ? `Guideline unavailable. ${moistureGuideline.reason}`
            : moistureExceeded
              ? "Above the published crop and duration-specific moisture guideline."
              : !climateFits
                ? "The moisture guideline requires indoor readings within the published temperature and humidity benchmark."
                : withinReference,
      storageActions.moisture,
      moisture == null ? undefined : `${moisture}% wet basis`,
      moistureGuideline.available
        ? `${reference!.strictMaximum ? "<" : "≤"} ${reference!.moisture}% · ${reference!.duration}`
        : reference?.source === storageSources.india
          ? `≤ ${reference.moisture}% · Published screening reference; duration not stated`
          : undefined,
      reference?.source,
    ),
    climateCard("Indoor temperature (°C)", temperature, 27, "°C"),
    climateCard("Indoor relative humidity (%)", humidity, 70, "%"),
    card(
      "Storage condition",
      leakage === "Observed"
        ? "High concern"
        : poor || moderate
          ? "Potential concern"
          : (condition === "Good" || condition === "Clean and dry") &&
              ventilation === "Good" &&
              leakage === "None observed"
            ? "No current concern"
            : "Insufficient data",
      leakage === "Observed"
        ? "Water leakage reported."
        : poor || moderate
          ? "Dampness or poor airflow can allow damage to spread."
          : condition,
      storageActions.structure,
      [findings.storageType, ventilation, leakage]
        .filter(Boolean)
        .join(" · ") || undefined,
      undefined,
      storageSources.codex,
    ),
    card(
      "Rainfall probability",
      rain
        ? "Potential concern"
        : rainComplete
          ? "No current concern"
          : "Insufficient data",
      rain
        ? "Rain may wet exposed grain or enter a leaking store."
        : "Rainfall forecast",
      storageActions.rain,
      rainReading
        ? `${rainReading.date} · ${rainReading.rainMm == null ? "Unknown" : `${rainReading.rainMm} mm`} · ${rainReading.rainProbability == null ? "Unknown" : `${rainReading.rainProbability}%`}`
        : undefined,
    ),
  ];
  const inspectionCards = cards.filter(
    (item) => item.label !== "Rainfall probability",
  );
  const rank: Record<Status, number> = {
    "No current concern": 0,
    "Insufficient data": 1,
    "Inspection required": 2,
    "Potential concern": 3,
    "High concern": 4,
  };
  const highest = inspectionCards.reduce<Status>(
    (highest, item) =>
      rank[item.status] > rank[highest] ? item.status : highest,
    "No current concern",
  );
  const drivers = inspectionCards
    .filter((item) => item.status !== "No current concern")
    .map((item) => ({
      label: item.label,
      status: item.status,
      note: item.note,
    }));
  const climateConcern =
    paddyWarmHumid ||
    humidGrainStore ||
    (annualScenario &&
      !climateFits &&
      ((temperature != null && temperature > 27) ||
        (humidity != null && humidity > 70)));
  const interactingRisks =
    (mold === "Observed" &&
      (moistureExceeded ||
        mustardScreenExceeded ||
        climateConcern ||
        pestRisk === "Potential concern")) ||
    (moistureExceeded && climateConcern && pestRisk === "Potential concern");
  const status = interactingRisks ? "High concern" : highest;
  const riskLevel =
    status === "High concern"
      ? "High"
      : status === "Potential concern"
        ? "Moderate"
        : status === "No current concern"
          ? "Low"
          : null;
  return {
    cards,
    status,
    riskLevel,
    reference,
    drivers,
    interactingRisks,
    guidelineOrigin:
      onlineReference && reference === onlineReference
        ? "Verified online"
        : "Offline",
  };
}
