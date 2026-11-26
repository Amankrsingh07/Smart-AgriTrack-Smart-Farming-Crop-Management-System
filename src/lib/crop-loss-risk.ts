import {
  agriculturalKnowledge,
  normalizeProtectionCrop,
} from "./agricultural-knowledge";
import {
  additionalHarvestProfiles,
  type RiskProfile,
} from "../data/agriculture/harvest-risk";

export const harvestRiskLabels = [
  "Pest infestation",
  "Disease symptoms",
  "Drainage condition",
] as const;
export const confirmedPestSigns = ["Brown insects at the base of rice stems"];
const pestSigns = [
  ...confirmedPestSigns,
  "Holes in leaves",
  "Fruit holes",
  "Leaf mines",
];
const diseaseSigns = [
  "White powder",
  "Stem lesions",
  "Fruit lesions",
  "Root rot",
  "Black spots",
];
const wetSigns = ["Water standing in field"];
const rootSigns = [
  "Root rot",
  "Brown roots",
  "Black roots",
  "Bad smell around roots",
  "Plant wilting",
];
const drainageSource =
  "https://ipm.ucanr.edu/home-and-landscape/aeration-deficit/";
const riceGuide =
  "https://www.knowledgebank.irri.org/images/docs/diagnostic-of-common-diseases-of-rice.pdf";

type Status =
  | "Confirmed observation"
  | "AI-suspected condition"
  | "Potential concern"
  | "No current concern identified"
  | "Inspection required"
  | "Insufficient evidence";
type Fact = {
  label: string;
  value: string;
  raw?: boolean;
  date?: string;
  source?: string;
};
export type HarvestRisk = {
  label: (typeof harvestRiskLabels)[number];
  status: Status;
  note: string;
  inspection: string;
  facts: Fact[];
  profiles: RiskProfile[];
  source?: string;
  storageStatus?: Status;
  storageInspection?: string;
};
export type HarvestRiskEvidence = {
  crop: string;
  harvested: boolean;
  stage?: string | null;
  signs?: readonly string[];
  imageSigns?: readonly string[];
  suspectedIds?: readonly string[];
  soilMoisture?: string;
  observationDate?: string;
  historicalStorageConcern?: boolean;
  pestOrDiseaseHistory?: boolean;
  storageDetails?: string | null;
  soilType?: string;
  soilTexture?: string | null;
  fieldNotes?: string | null;
  soilReportDate?: string | null;
  rainHistory?: readonly { value: string; date: string }[];
  outdoorWeather?: string;
  forecastRain?: { value: string; date: string } | null;
  measuredMoisture?: { value: string; date: string } | null;
  irrigation?: { date: string; method: string | null };
  cropWaterReference?: { value: string; source: string } | null;
};

function profileForCrop(crop: string): RiskProfile[] {
  const fromProtection: RiskProfile[] = agriculturalKnowledge.records.flatMap(
    (record) => {
      if (!/Fungal|Bacterial|Viral|Oomycete|Pest/.test(record.category))
        return [];
      return [
        {
          id: record.id,
          name: record.name,
          scientificName: record.scientificName,
          crops: record.crops,
          kind: record.category.startsWith("Pest") ? "pest" : "disease",
          phase: "field",
          signs: record.distinguishingSymptoms?.length
            ? record.distinguishingSymptoms
            : record.symptoms,
          conditions: record.conditions,
          stage: "Field crop",
          inspection: record.diagnostics,
          prevention: record.prevention,
          recovery: record.recovery,
          source: record.source,
          referenceImages:
            record.source === riceGuide ||
            record.id === "rice-hopper" ||
            record.id === "tomato-fruit-borer" ||
            record.id === "tomato-early-blight" ||
            record.id === "tomato-septoria"
              ? record.source
              : undefined,
          version: record.datasetVersion,
          applicability: record.geographicApplicability,
          units: "Qualitative signs",
        },
      ];
    },
  );
  return [...fromProtection, ...additionalHarvestProfiles].filter((profile) =>
    profile.crops.some((value) => normalizeProtectionCrop(value) === crop),
  );
}

export function harvestRiskDetails(
  evidence: HarvestRiskEvidence,
): HarvestRisk[] {
  const normalized = normalizeProtectionCrop(evidence.crop);
  const crop =
    (
      { corn: "maize", makka: "maize", eggplant: "brinjal" } as Record<
        string,
        string
      >
    )[normalized] ?? normalized;
  const profiles = profileForCrop(crop);
  const signs = evidence.signs ?? [];
  const photos = evidence.imageSigns ?? [];
  const isPestSign = (sign: string) =>
    pestSigns.includes(sign) &&
    (crop === "rice" || !confirmedPestSigns.includes(sign));
  const seenPests = signs.filter(isPestSign);
  const isDiseaseSign = (sign: string) =>
    diseaseSigns.includes(sign) ||
    profiles.some(
      (profile) =>
        profile.kind === "disease" &&
        profile.signs.includes(sign) &&
        ![
          "Yellow leaves",
          "Plant wilting",
          "Brown leaves",
          "Dry leaf edges",
          "Leaf curling",
          "Stunted growth",
        ].includes(sign),
    );
  const seenDisease = signs.filter(isDiseaseSign);
  const photoPests = photos.filter(isPestSign);
  const photoDisease = photos.filter(isDiseaseSign);
  const matches = (profile: RiskProfile) =>
    evidence.suspectedIds?.includes(profile.id) ||
    profile.signs.some((sign) =>
      [...seenPests, ...seenDisease, ...photoPests, ...photoDisease].includes(
        sign,
      ),
    );
  const stage = evidence.stage?.toLowerCase();
  const ranked = [...profiles].sort(
    (a, b) =>
      Number(!!matches(b)) - Number(!!matches(a)) ||
      (stage
        ? Number(b.stage.toLowerCase().includes(stage)) -
          Number(a.stage.toLowerCase().includes(stage))
        : 0),
  );
  const profileList = (kind: RiskProfile["kind"]) => [
    ...ranked.filter((p) => p.kind === kind && p.phase === "field").slice(0, 3),
    ...(evidence.harvested
      ? ranked
          .filter((p) => p.kind === kind && p.phase === "storage")
          .slice(0, 3)
      : []),
  ];
  const recordFacts = (
    items: readonly string[],
    label: string,
    date?: string,
  ) => items.map((value) => ({ label, value, date }));
  const contextFacts: Fact[] = [];
  if (evidence.outdoorWeather)
    contextFacts.push({
      label:
        "Outdoor weather at the farm. Check conditions inside the store separately.",
      value: evidence.outdoorWeather,
    });
  if (evidence.harvested && evidence.storageDetails)
    contextFacts.push({
      label: "Saved storage notes",
      value: evidence.storageDetails,
      raw: true,
    });
  const storageStatus: Status | undefined = evidence.harvested
    ? evidence.pestOrDiseaseHistory || evidence.historicalStorageConcern
      ? "Inspection required"
      : "Insufficient evidence"
    : undefined;
  const standing = signs.some((sign) => wetSigns.includes(sign));
  const waterlogged = evidence.soilMoisture === "Waterlogged";
  const rootDamage = signs.some((sign) => rootSigns.includes(sign));
  const drainageObserved = waterlogged || (standing && crop !== "rice");
  const drainageInspection = standing || rootDamage || !!evidence.forecastRain;
  const drainageFacts: Fact[] = [
    ...recordFacts(
      signs.filter(
        (sign) => wetSigns.includes(sign) || rootSigns.includes(sign),
      ),
      "Farmer observations",
      evidence.observationDate,
    ),
  ];
  if (waterlogged)
    drainageFacts.push({
      label: "Farmer observations",
      value: "Waterlogged soil reported.",
      date: evidence.observationDate,
    });
  if (evidence.soilType)
    drainageFacts.push({
      label: "Soil type",
      value: evidence.soilType,
      raw: true,
    });
  if (evidence.soilTexture)
    drainageFacts.push({
      label: "Soil texture",
      value: evidence.soilTexture,
      raw: true,
    });
  if (evidence.fieldNotes)
    drainageFacts.push({
      label: "Notes",
      value: evidence.fieldNotes,
      raw: true,
    });
  if (evidence.soilReportDate)
    drainageFacts.push({
      label: "Soil laboratory report",
      value: evidence.soilReportDate,
    });
  for (const rain of evidence.rainHistory ?? [])
    drainageFacts.push({ label: "Observed rainfall", ...rain });
  if (evidence.forecastRain)
    drainageFacts.push({
      label: "Forecast rainfall",
      value: evidence.forecastRain.value,
      date: evidence.forecastRain.date,
    });
  if (evidence.measuredMoisture)
    drainageFacts.push({
      label: "Soil moisture",
      value: evidence.measuredMoisture.value,
      date: evidence.measuredMoisture.date,
    });
  if (evidence.irrigation)
    drainageFacts.push({
      label: "Saved irrigation records",
      value: evidence.irrigation.method ?? "",
      date: evidence.irrigation.date,
      raw: true,
    });
  if (evidence.cropWaterReference)
    drainageFacts.push({
      label: "Crop water reference",
      value: evidence.cropWaterReference.value,
      source: evidence.cropWaterReference.source,
    });
  return [
    {
      label: "Pest infestation",
      status: seenPests.some((sign) => confirmedPestSigns.includes(sign))
        ? "Confirmed observation"
        : seenPests.length
          ? "Potential concern"
          : photoPests.length
            ? "AI-suspected condition"
            : evidence.pestOrDiseaseHistory || evidence.historicalStorageConcern
              ? "Inspection required"
              : "Insufficient evidence",
      note: seenPests.length
        ? "Check the recorded signs before identifying the pest."
        : "Inspect for pests before deciding on treatment.",
      inspection: "Check leaves, stems and fruit for insects or damage.",
      storageInspection: "Check stored produce for insects or damage.",
      facts: [
        ...recordFacts(
          seenPests,
          "Farmer observations",
          evidence.observationDate,
        ),
        ...recordFacts(photoPests, "AI photo observations"),
        ...contextFacts,
      ],
      profiles: profileList("pest"),
      storageStatus,
    },
    {
      label: "Disease symptoms",
      status: seenDisease.length
        ? "Confirmed observation"
        : photoDisease.length
          ? "AI-suspected condition"
          : signs.length ||
              evidence.pestOrDiseaseHistory ||
              evidence.historicalStorageConcern
            ? "Inspection required"
            : "Insufficient evidence",
      note: "Check the crop in the field. Similar signs can have several causes.",
      inspection:
        "Inspect the crop and ask a local adviser to check fresh symptoms.",
      storageInspection:
        "Keep damaged or spoiled produce separate from healthy produce.",
      facts: [
        ...recordFacts(
          seenDisease.length
            ? seenDisease
            : signs.filter((sign) => !pestSigns.includes(sign)),
          "Farmer observations",
          evidence.observationDate,
        ),
        ...recordFacts(photoDisease, "AI photo observations"),
        ...contextFacts,
      ],
      profiles: profileList("disease"),
      storageStatus,
    },
    {
      label: "Drainage condition",
      status: drainageObserved
        ? "Confirmed observation"
        : drainageInspection
          ? "Inspection required"
          : "Insufficient evidence",
      note: waterlogged
        ? "Waterlogged soil could also explain the damage."
        : "Check water movement in the field. Rain and soil type alone cannot show poor drainage.",
      inspection:
        crop === "rice"
          ? "Check whether water is deeper or stays longer than planned for this rice field."
          : crop === "maize"
            ? "Check for standing water around maize seedlings and clear blocked outlets."
            : "Check for standing water and blocked outlets.",
      facts: drainageFacts,
      profiles: [],
      source:
        crop === "maize"
          ? "https://agritech.tnau.ac.in/agriculture/millets_maize_irrigated_maize_water.html"
          : drainageSource,
    },
  ];
}

type DashboardRisk = {
  label: string;
  status: string;
  note?: string;
  value?: string;
};
export type HarvestRiskCard = DashboardRisk & {
  detail?: HarvestRisk;
  phase: "field" | "storage" | "future";
  facts?: Fact[];
};

const futureLabels = [
  "Drainage condition",
  "Soil nutrient deficiencies",
  "Soil pH",
];
const protectionLabels = ["Pest infestation", "Disease symptoms"];
const storageOrder = [
  ...protectionLabels,
  "Grain moisture",
  "Storage condition",
  "Rainfall probability",
  "Temperature and humidity",
];

export function harvestRiskSections(
  risks: readonly DashboardRisk[],
  details: readonly HarvestRisk[],
  harvested: boolean,
): {
  current: HarvestRiskCard[];
  fieldHistory: HarvestRiskCard[];
  future: HarvestRiskCard[];
} {
  const cards: HarvestRiskCard[] = risks.map((risk) => {
    const detail = details.find((item) => item.label === risk.label);
    return {
      ...risk,
      status: detail?.status ?? risk.status,
      note: detail?.note ?? risk.note,
      detail,
      phase: "field",
    };
  });
  const future = cards
    .filter((card) => futureLabels.includes(card.label))
    .map((card) => ({ ...card, phase: "future" as const }));
  if (!harvested)
    return {
      current: cards.filter((card) => !futureLabels.includes(card.label)),
      fieldHistory: [],
      future,
    };

  const fieldHistory = cards
    .filter((card) => protectionLabels.includes(card.label))
    .map((card) => {
      const detail = card.detail;
      return {
        ...card,
        detail: detail && {
          ...detail,
          profiles: detail.profiles.filter(
            (profile) => profile.phase === "field",
          ),
          facts: detail.facts.filter(
            (fact) => fact.label !== "Saved storage notes",
          ),
        },
      };
    });
  const storageNotes = details
    .flatMap((detail) => detail.facts)
    .find((fact) => fact.label === "Saved storage notes");
  const current = storageOrder.flatMap<HarvestRiskCard>((label) => {
    const card = cards.find((item) => item.label === label);
    if (!card) return [];
    if (card.detail && protectionLabels.includes(label)) {
      const detail = card.detail;
      return [
        {
          ...card,
          phase: "storage" as const,
          status: detail.storageStatus ?? "Insufficient evidence",
          note: undefined,
          detail: {
            ...detail,
            inspection: detail.storageInspection ?? detail.inspection,
            profiles: detail.profiles.filter(
              (profile) => profile.phase === "storage",
            ),
            facts: [],
          },
        },
      ];
    }
    return [
      {
        ...card,
        phase: "storage" as const,
        facts:
          label === "Storage condition" && storageNotes
            ? [storageNotes]
            : undefined,
      },
    ];
  });
  return { current, fieldHistory, future };
}
