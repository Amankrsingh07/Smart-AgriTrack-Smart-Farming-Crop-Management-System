import { z } from "zod";
import { fertilizerCrops } from "./fertilizer-crop-registry";
import { findIndianDistrict, findIndianState } from "./india-location";
import { verifiedFertilizerProducts } from "./fertilizer-product-grades";

const text = z.string().trim().min(1);
const identifier = text.regex(/^[a-z0-9._-]+$/i);
const date = z.iso.date();
const amount = z.number().finite().min(0).max(10000);
const fraction = z.number().finite().min(0).max(1);
const source = z
  .object({
    id: identifier,
    title: text,
    organization: text,
    url: z.url({ protocol: /^https$/ }),
    publicationDate: date.nullable(),
    publicationYear: z.number().int().min(1900).optional(),
    reviewedOn: date,
    scope: text,
  })
  .passthrough();
const record = z
  .object({
    id: identifier,
    cropKey: identifier,
    state: text,
    district: text.nullable(),
    zone: text.nullable(),
    season: z.enum(["RABI", "KHARIF", "ZAID"]).nullable(),
    productionType: text,
    conditions: text,
    irrigationCondition: z.enum(["IRRIGATED", "RAINFED"]).nullable(),
    sowingCondition: z.enum(["TIMELY", "LATE"]).nullable(),
    nutrientsKgHa: z.object({ n: amount, p2o5: amount, k2o: amount }),
    originalBasis: z.literal("N:P2O5:K2O"),
    recommendationUnits: z.literal("kg/ha"),
    sourceId: identifier,
    sourcePage: z.number().int().positive().nullable(),
    sourceRow: z.number().int().positive().nullable(),
    applicationTiming: z
      .array(
        z
          .object({
            label: text,
            nFraction: fraction,
            pFraction: fraction,
            kFraction: fraction,
          })
          .passthrough(),
      )
      .max(30),
    verificationStatus: z.enum([
      "VERIFIED_STANDARD_REGIONAL",
      "VERIFIED_STANDARD_GENERAL_DISTRICT",
    ]),
    excludedDistricts: z.array(text).max(100).optional(),
    datasetVersion: identifier,
    phosphorusProduct: z.enum(["DAP", "SSP"]),
    doseScope: z.enum([
      "STANDARD_NPK_TARGETS",
      "DOCUMENTED_BASAL_MINERAL_COMPONENT",
    ]),
    requiresProductionConfirmation: z.boolean().optional(),
  })
  .passthrough();

export const regionalDatasetSchema = z
  .object({
    version: identifier,
    sources: z.array(source).min(1),
    records: z.array(record).min(1),
  })
  .passthrough()
  .superRefine((dataset, ctx) => {
    const invalid = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (
      new Set(dataset.sources.map((row) => row.id)).size !==
      dataset.sources.length
    )
      invalid("Duplicate source ID.");
    if (
      new Set(dataset.records.map((row) => row.id)).size !==
      dataset.records.length
    )
      invalid("Duplicate record ID.");
    const exact = new Set<string>();
    for (const row of dataset.records) {
      const state = findIndianState(row.state);
      const district =
        state && row.district
          ? findIndianDistrict(state.code, row.district)
          : null;
      if (
        !state ||
        (row.district && !district) ||
        row.excludedDistricts?.some(
          (name) => !findIndianDistrict(state.code, name),
        ) ||
        !fertilizerCrops.some((crop) => crop.key === row.cropKey) ||
        !dataset.sources.some((publication) => publication.id === row.sourceId)
      )
        invalid(
          `Missing crop, location, scope or publication match for ${row.id}.`,
        );
      const fingerprint = JSON.stringify([
        row.cropKey,
        state?.code,
        district?.code,
        row.zone,
        row.season,
        row.productionType,
        row.irrigationCondition,
        row.sowingCondition,
        row.nutrientsKgHa,
        row.sourceId,
      ]);
      if (exact.has(fingerprint))
        invalid(`Duplicate scientific scope and rates for ${row.id}.`);
      exact.add(fingerprint);
      if (
        (["nFraction", "pFraction", "kFraction"] as const).some(
          (key) =>
            row.applicationTiming.reduce(
              (sum, timing) => sum + timing[key],
              0,
            ) > 1.000001,
        )
      )
        invalid(`Timing shares exceed the documented total for ${row.id}.`);
      const dap = verifiedFertilizerProducts.DAP;
      if (
        row.phosphorusProduct === "DAP" &&
        (row.nutrientsKgHa.p2o5 / dap.p2o5) * dap.n > row.nutrientsKgHa.n + 1e-8
      )
        invalid(`DAP would exceed the nitrogen target for ${row.id}.`);
    }
  });
