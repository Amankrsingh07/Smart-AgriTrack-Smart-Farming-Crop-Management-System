import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

type WaterSeedRow = {
  cropName: string;
  season: string;
  stageName: string;
  waterMeasure: string;
  cropCoefficient?: number;
  startDay?: number;
  endDay?: number;
  publicationTitle?: string;
  publicationYear?: number;
  tableReference?: string;
  waterRequirementMm?: number;
  minimumWaterRequirementMm?: number;
  maximumWaterRequirementMm?: number;
  dataStatus?: string;
  sourceUrl?: string;
  irrigationMethod?: string | null;
};
const rows = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "prisma/data/crop-water-stages.json"),
    "utf8",
  ),
) as WaterSeedRow[];

test("water seed rows declare source, status, units, and unique crop-season-measure identity", () => {
  const seen = new Set<string>();
  for (const row of rows) {
    assert.match(row.sourceUrl ?? "", /^https:\/\//);
    assert.ok(row.dataStatus === "VERIFIED" || row.dataStatus === "ESTIMATED");
    const hasExact = typeof row.waterRequirementMm === "number";
    const hasRange =
      typeof row.minimumWaterRequirementMm === "number" &&
      typeof row.maximumWaterRequirementMm === "number";
    assert.ok(
      hasExact !== hasRange ||
        (typeof row.cropCoefficient === "number" && row.cropCoefficient >= 0),
    );
    const identity = `${row.cropName}|${row.season}|${row.stageName}|${row.waterMeasure}`;
    assert.equal(
      seen.has(identity),
      false,
      `duplicate dataset row ${identity}`,
    );
    seen.add(identity);
  }
});

test("IARI crop-season rows are method-specific, and generic Maize Rabi stays estimated ETc", () => {
  const official = rows.filter((row) => row.sourceUrl?.includes("sansad.in"));
  assert.ok(official.length > 0);
  assert.ok(
    official.every(
      (row) => row.dataStatus === "VERIFIED" && Boolean(row.irrigationMethod),
    ),
  );
  assert.ok(
    official
      .filter((row) => row.waterMeasure === "IRRIGATION_REQUIREMENT")
      .every(
        (row) =>
          row.season !== "RABI" ||
          ["Wheat", "Mustard", "Potato"].includes(row.cropName),
      ),
  );
  const maizeRabiNeed = rows.find(
    (row) =>
      row.cropName === "Maize" &&
      row.season === "RABI" &&
      row.stageName.includes("seasonal crop water need"),
  );
  assert.ok(maizeRabiNeed);
  assert.equal(maizeRabiNeed.waterMeasure, "CROP_ETC");
  assert.equal(maizeRabiNeed.dataStatus, "ESTIMATED");
  assert.equal(maizeRabiNeed.irrigationMethod, null);
  const maizeKc = rows.filter(
    (row) =>
      row.cropName === "Maize" &&
      row.season === "RABI" &&
      row.publicationTitle ===
        "Irrigation Water Management: Irrigation Water Needs",
  );
  assert.equal(maizeKc.length, 4);
  assert.deepEqual(
    maizeKc.map((row) => row.cropCoefficient),
    [0.4, 0.8, 1.15, 0.7],
  );
  assert.ok(
    maizeKc.every(
      (row) =>
        row.waterMeasure === "CROP_ETC" &&
        row.dataStatus === "VERIFIED" &&
        row.sourceUrl?.includes("fao.org") &&
        row.publicationYear === 1986 &&
        row.tableReference?.includes("Table 8") &&
        typeof row.startDay === "number" &&
        typeof row.endDay === "number",
    ),
  );
});

test("Rabi Chickpea row is source-specific, mm-based, and limited to its IARI surface-irrigation study", () => {
  const chickpea = rows.find(
    (row) => row.cropName === "Chickpea (Gram)" && row.season === "RABI",
  );
  assert.ok(chickpea);
  assert.equal(chickpea.waterMeasure, "IRRIGATION_REQUIREMENT");
  assert.equal(chickpea.minimumWaterRequirementMm, undefined);
  assert.equal(chickpea.irrigationMethod, "Surface");
  assert.equal(chickpea.dataStatus, "VERIFIED");
  assert.match(chickpea.sourceUrl ?? "", /epubs\.icar\.org\.in/);
});
