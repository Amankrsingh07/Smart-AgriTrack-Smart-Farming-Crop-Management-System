import { test } from "node:test";
import assert from "node:assert/strict";
import {
  protectionSchema,
  assessProtection,
  validateProtectionPhoto,
  imageClassifier,
} from "../src/lib/crop-protection";
const input = () =>
  protectionSchema.parse({
    cropName: "Tomato",
    symptoms: ["Leaf curling", "Stunted growth"],
    affected: "10–25%",
    onset: "2026-01-01",
    spreading: true,
    pattern: "One section",
    timing: "Gradually",
    symptomsAfterApplication: false,
    pollution: [],
  });
test("symptoms produce unconfirmed candidates and competing causes", () => {
  const r = assessProtection(input());
  assert.equal(r.candidates[0].name, "Leaf curl disease");
  assert.match(r.candidates[0].confidence, /unconfirmed/);
  assert.ok(r.alternatives.length);
});
test("proximity alone is not pollution evidence", () => {
  const r = assessProtection({
    ...input(),
    pollution: ["Factory nearby", "Industrial area nearby"],
  });
  assert.equal(r.pollutionStatus, "Low Indication");
  assert.match(r.sourceAttribution, /No industrial source established/);
});
test("discharge observations prioritize testing without confirmation", () => {
  const r = assessProtection({
    ...input(),
    pollution: ["Wastewater enters field", "Problem after discharge"],
  });
  assert.equal(r.pollutionStatus, "High Priority for Testing");
  assert.match(r.verification, /Unverified/);
  assert.ok(r.precautions.some((p) => p.includes("do not consume")));
});
test("normal water pH never establishes safety", () => {
  const r = assessProtection({
    ...input(),
    labs: [
      {
        matrix: "Water",
        parameter: "pH",
        value: 7,
        unit: "pH",
        sampleDate: "2026-01-01",
        laboratory: "Example",
        method: "",
        reportReference: "",
      },
    ],
  });
  assert.equal(r.water.status, "Insufficient data");
});
test("heavy metal values do not trigger arbitrary contamination limits", () => {
  const r = assessProtection({
    ...input(),
    labs: [
      {
        matrix: "Soil",
        parameter: "Pb",
        value: 1000,
        unit: "mg/kg",
        sampleDate: "2026-01-01",
        laboratory: "Example",
        method: "",
        reportReference: "",
      },
    ],
  });
  assert.equal(r.pollutionStatus, "Low Indication");
  assert.match(r.verification, /Unverified/);
});
test("image model unavailable and spoofed content rejected", async () => {
  assert.equal(
    (await imageClassifier.classify(new Uint8Array(), "Tomato")).available,
    false,
  );
  assert.throws(() =>
    validateProtectionPhoto(Buffer.from("not image"), "image/png"),
  );
  assert.throws(() =>
    validateProtectionPhoto(new Uint8Array(5 * 1024 * 1024 + 1), "image/png"),
  );
});
test("chemical timing is suspicion and no automatic treatment", () => {
  const r = assessProtection({
    ...input(),
    chemicalHistory: "Spray yesterday",
    symptomsAfterApplication: true,
  });
  assert.equal(r.chemicalSuspected, true);
  assert.match(r.recovery.join(" "), /no dose, mixing, flooding/);
});
import { reviewSchema } from "../src/lib/crop-protection-review";
test("expert confirmation requires applicable exceeded qualified lab reference", () => {
  assert.equal(
    reviewSchema.safeParse({
      observations: "Test observations",
      suspectedCause: "Unknown",
      verificationStatus: "Laboratory-Confirmed Contamination",
      laboratoryEvidence: [],
    }).success,
    false,
  );
  assert.equal(
    reviewSchema.safeParse({
      observations: "Test observations",
      suspectedCause: "Unknown",
      verificationStatus: "Expert assessment; testing required",
      laboratoryEvidence: [],
    }).success,
    true,
  );
});

import {
  applicationSchema,
  assessApplications,
} from "../src/lib/crop-protection-applications";
import {
  buildProtectionPlan,
  protectionPlanDate,
} from "../src/lib/crop-protection-plan";
import { assessProtectionLabs } from "../src/lib/crop-protection-labs";
test("old assessment input stays compatible with additive fields", () => {
  const parsed = input();
  assert.deepEqual(parsed.applications, []);
  assert.equal(parsed.fieldHistory.soilMoisture, "Unknown");
  assert.equal(parsed.discharge.pattern, "Unknown");
});
test("label comparison requires applicability and reference; large amounts alone do not diagnose", () => {
  const a = applicationSchema.parse({
    kind: "Fertilizer",
    product: "Urea",
    quantity: 200,
    area: 2,
    dose: 100,
    labelDose: 50,
  });
  const pending = assessApplications([a])[0];
  assert.match(pending.comparison, /Not compared/);
  assert.equal(pending.normalizedDose, 100);
  assert.equal(pending.reviewRequired, false);
  const reviewed = assessApplications([
    {
      ...a,
      labelApplicable: true,
      labelReference: "Farmer-entered crop label",
    },
  ])[0];
  assert.match(reviewed.comparison, /exceeds/);
  assert.match(reviewed.comparison, /does not establish injury/);
  assert.match(
    assessApplications([
      { ...a, labelApplicable: true, labelReference: "Label", dose: 40 },
    ])[0].comparison,
    /does not rule out injury/,
  );
});
test("application fields reject negative, non-finite and future quantities or dates", () => {
  assert.equal(
    applicationSchema.safeParse({
      kind: "Fertilizer",
      product: "Urea",
      quantity: -10,
    }).success,
    false,
  );
  assert.equal(
    applicationSchema.safeParse({
      kind: "Pesticide",
      product: "Example",
      date: "2999-01-01",
    }).success,
    false,
  );
  assert.equal(
    applicationSchema.safeParse({
      kind: "Pesticide",
      product: "Example",
      dose: Infinity,
    }).success,
    false,
  );
});
test("structured history supports timing suspicion without inventing product toxicity", () => {
  const a = applicationSchema.parse({
    kind: "Herbicide",
    product: "Unverified product",
    mixing: "Another unverified product",
  });
  const r = assessProtection({
    ...input(),
    applications: [a],
    symptomsAfterApplication: true,
  });
  assert.equal(r.chemicalSuspected, true);
  assert.equal(r.applicationFindings[0].reviewRequired, true);
  assert.match(
    r.applicationFindings[0].limitation,
    /No automatic product approval/,
  );
});
test("moisture and salt observations produce competing causes and diagnostic steps", () => {
  const r = assessProtection({
    ...input(),
    symptoms: [
      "Yellow leaves",
      "White salt deposits",
      "Water standing in field",
    ],
  });
  assert.equal(r.abioticFindings.length, 3);
  assert.ok(
    r.abioticFindings.some((f) => /do not prescribe leaching/.test(f.nextStep)),
  );
  assert.match(
    r.abioticFindings.find((f) => f.cause.includes("Nutrient"))!.nextStep,
    /do not add fertilizer/,
  );
});
test("planner responds to spreading damage, roots, application timing and actual weather", () => {
  const r = assessProtection(
    {
      ...input(),
      symptoms: ["Plant wilting"],
      symptomsAfterApplication: true,
      pollution: ["Wastewater enters field"],
    },
    {
      weather: {
        time: "2026-01-01T10:00",
        humidity: 90,
        rainfall: 2,
        source: "Actual test context",
      },
    },
  );
  assert.equal(r.urgency.days, 1);
  for (const key of [
    "inspect",
    "root-moisture",
    "label-review",
    "water-testing",
    "weather-scout",
    "followup",
  ])
    assert.ok(r.plan.some((p) => p.key === key));
  assert.ok(
    !r.missingInformation.includes("Actual recent weather unavailable"),
  );
  assert.match(
    r.plan.find((p) => p.key === "weather-scout")!.action,
    /not a disease forecast/,
  );
  const low = buildProtectionPlan({
    ...input(),
    spreading: false,
    pollution: ["Factory nearby"],
  });
  assert.equal(low[0].days, 3);
  assert.ok(!low.some((p) => p.key === "water-testing"));
});
test("calendar follow-ups use current India date rather than a stale assessment date", () => {
  assert.equal(
    protectionPlanDate(new Date("2026-11-15T20:00:00Z"), 1).toISOString(),
    "2026-11-17T00:00:00.000Z",
  );
});
test("water screening requires exact method/unit and metadata; never declares safety", () => {
  const lab = {
    matrix: "Water" as const,
    parameter: "EC",
    value: 4,
    unit: "dS/m",
    method: "EC corrected to 25°C",
    laboratory: "Test lab",
    sampleDate: "2026-01-01",
    reportReference: "Test-1",
  };
  const result = assessProtectionLabs([lab]);
  assert.match(result.waterSalinity, /Severe/);
  assert.equal(result.waterStatus, "Insufficient data");
  assert.ok(result.findings[0].reference);
  assert.equal(
    assessProtectionLabs([{ ...lab, method: "Unknown" }]).findings[0].reference,
    null,
  );
  assert.equal(
    assessProtectionLabs([{ ...lab, unit: "mg/L" }]).findings[0].reference,
    null,
  );
  assert.match(
    assessProtectionLabs([lab, { ...lab, value: 0.2 }]).waterSalinity,
    /Multiple/,
  );
  assert.equal(
    protectionSchema.safeParse({
      ...input(),
      labs: [{ ...lab, sampleDate: "2999-01-01" }],
    }).success,
    false,
  );
});
test("similar tomato symptoms show differential candidates with source provenance", () => {
  const result = assessProtection({
    ...input(),
    symptoms: ["Plant wilting", "Yellow leaves", "White powder", "Fruit holes"],
  });
  for (const name of ["Bacterial wilt", "Powdery mildew", "Fruit borer damage"])
    assert.ok(result.candidates.some((c) => c.name === name));
  for (const c of result.candidates) {
    assert.ok(c.source.startsWith("https://"));
    assert.ok(c.version);
    assert.match(c.confidence, /unconfirmed|Low/);
  }
});
import { protectionDraftSchema } from "../src/lib/crop-protection-draft";
test("device drafts validate shape and reject malformed or oversized field data", () => {
  const draft = {
    savedAt: "2026-11-15T00:00:00.000Z",
    selected: "",
    fields: { cropName: "Tomato" },
    signs: ["Leaf curling"],
    pollution: [],
    labs: [],
    applications: [],
  };
  assert.equal(protectionDraftSchema.safeParse(draft).success, true);
  assert.equal(
    protectionDraftSchema.safeParse({
      ...draft,
      labs: [{ matrix: "Not a matrix" }],
    }).success,
    false,
  );
  assert.equal(
    protectionDraftSchema.safeParse({
      ...draft,
      fields: { notes: "a".repeat(2001) },
    }).success,
    false,
  );
});
import type { Prisma } from "@prisma/client";
import { scheduleProtectionPlan } from "../src/lib/crop-protection-calendar";
test("calendar retries are idempotent and matching existing crop tasks are reused", async () => {
  const alerts = new Set<string>();
  const created: { id: string; activityKey: string }[] = [];
  const notices: string[] = [];
  const tx = {
    $queryRaw: async () => [],
    alert: {
      findUnique: async ({
        where,
      }: {
        where: { userId_dedupeKey: { dedupeKey: string } };
      }) =>
        alerts.has(where.userId_dedupeKey.dedupeKey)
          ? { id: "existing" }
          : null,
      create: async ({ data }: { data: { dedupeKey: string } }) => {
        alerts.add(data.dedupeKey);
        return data;
      },
    },
    cropCalendar: { findFirst: async () => ({ id: "owned-calendar" }) },
    cropCalendarActivity: {
      findFirst: async ({
        where,
      }: {
        where: { activityType?: string; activityKey?: string };
      }) =>
        where.activityType === "PEST_MONITORING"
          ? { id: "existing-scouting" }
          : (created.find((a) => a.activityKey === where.activityKey) ?? null),
      create: async ({ data }: { data: { activityKey: string } }) => {
        const saved = { ...data, id: `task-${created.length}` };
        created.push(saved);
        return saved;
      },
    },
    cropCalendarNotification: {
      upsert: async ({ create }: { create: { activityId: string } }) => {
        notices.push(create.activityId);
        return create;
      },
    },
  } as unknown as Prisma.TransactionClient;
  const plan = buildProtectionPlan({ ...input(), spreading: false });
  const assessment = {
    id: "assessment-test",
    userId: "owner",
    cropName: "Tomato",
    cropCycleId: "owned-cycle",
  };
  const first = await scheduleProtectionPlan(
    tx,
    assessment,
    plan,
    new Date("2026-11-15T00:00:00Z"),
  );
  assert.equal(first.count, 1);
  assert.equal(created.length, 1);
  const again = await scheduleProtectionPlan(
    tx,
    assessment,
    plan,
    new Date("2026-11-16T00:00:00Z"),
  );
  assert.equal(again.created, false);
  assert.equal(created.length, 1);
  assert.equal(alerts.size, 1);
  assert.deepEqual(notices, ["task-0"]);
});
test("EC screening rejects misleading temperature-method text and incomplete lab identity", () => {
  const lab = {
    matrix: "Water" as const,
    parameter: "EC",
    value: 4,
    unit: "dS/m",
    method: "EC corrected to 25°C",
    laboratory: "Test lab",
    sampleDate: "2026-01-01",
    reportReference: "Ref-1",
  };
  for (const method of [
    "EC at 125°C",
    "Not corrected to 25°C",
    "Unknown method mentioning 25 C",
  ]) {
    assert.equal(
      assessProtectionLabs([{ ...lab, method }]).findings[0].reference,
      null,
    );
  }
  assert.equal(
    assessProtectionLabs([{ ...lab, laboratory: "" }]).findings[0].reference,
    null,
  );
});
test("expert review rejects future sampling dates", () => {
  const parsed = reviewSchema.safeParse({
    observations: "Qualified report review",
    suspectedCause: "Needs investigation",
    verificationStatus: "Laboratory-Confirmed Contamination",
    laboratoryEvidence: [
      {
        matrix: "Agricultural soil",
        parameter: "Pb",
        value: 10,
        limit: 1,
        unit: "mg/kg",
        laboratory: "Example lab",
        reportReference: "Example-1",
        sampleDate: "2999-01-01",
        method: "Reported method",
        standardName: "Example only",
        standardVersion: "Example",
        sourceUrl: "https://example.org/standard",
        applicability: "Example applicability long enough for validation",
        qualifiedReportVerified: true,
      },
    ],
  });
  assert.equal(parsed.success, false);
});
