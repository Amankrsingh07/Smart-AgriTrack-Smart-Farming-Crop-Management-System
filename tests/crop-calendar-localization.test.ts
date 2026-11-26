import assert from "node:assert/strict";
import test from "node:test";
import { calendarCatalog } from "../src/i18n/crop-calendar";
import {
  calendarContent,
  calendarLabel,
  calendarText,
} from "../src/i18n/crop-calendar/format";
import { languages } from "../src/i18n/languages";
import { generateCropCalendarActivities } from "../src/lib/crop-calendar";

const mustard = generateCropCalendarActivities({
  cropName: "Mustard",
  state: "Bihar",
  district: "Saran",
  season: "RABI",
  sowingDate: new Date("2026-10-13T00:00:00Z"),
  areaHa: 1,
});
const numbers = (value: string) => (value.match(/\d+(?:\.\d+)?/g) ?? []).sort();

test("all regional languages translate the saved mustard activity card including source notes", () => {
  for (const { code } of languages.slice(1)) {
    const catalog = calendarCatalog(code);
    for (const activity of mustard.activities.filter((row) =>
      [
        "land-preparation",
        "seed-treatment-review",
        "sowing",
        "phase-germination",
      ].includes(row.activityKey),
    )) {
      const fields = [
        activity.activityName,
        activity.description,
        activity.recommendation,
        activity.source,
      ];
      for (const field of fields) {
        assert.ok(field);
        const translation = calendarContent(catalog, field);
        assert.notEqual(translation, field, `${code}: ${field}`);
        assert.doesNotMatch(
          translation,
          /\{\w+\}|Observation reminder only|It does not prescribe/u,
        );
        assert.deepEqual(
          numbers(translation),
          numbers(field),
          `${code}: ${field}`,
        );
      }
    }
    assert.notEqual(calendarLabel(catalog, code, "Mustard"), "Mustard");
    assert.notEqual(
      calendarText(catalog, "Scheduled activities"),
      "Scheduled activities",
    );
    assert.notEqual(
      calendarText(catalog, "FIELD PREPARATION"),
      "FIELD PREPARATION",
    );
  }
});

test("calendar display keeps user notes and quantities intact", () => {
  const catalog = calendarCatalog("hi");
  assert.equal(
    calendarContent(catalog, "Farmer's own note: check North field."),
    "Farmer's own note: check North field.",
  );
  const entry =
    "Calculated for 0.405 ha using the existing ICAR fertilizer calculator: Urea 22.0 kg, DAP 10.5 kg, MOP 0.0 kg.";
  const translation = calendarContent(catalog, entry);
  assert.notEqual(translation, entry);
  assert.deepEqual(numbers(translation), numbers(entry));
});

test("bundled regional catalogs preserve every placeholder and source number", () => {
  const placeholders = (value: string) =>
    (value.match(/\{\w+\}/g) ?? []).sort();
  const quantities = (value: string) => numbers(value.replace(/\{\w+\}/g, ""));
  const keys = Object.keys(calendarCatalog("hi")).sort();
  for (const { code } of languages.slice(1)) {
    const catalog = calendarCatalog(code);
    assert.deepEqual(Object.keys(catalog).sort(), keys);
    for (const [source, translated] of Object.entries(catalog)) {
      assert.deepEqual(
        placeholders(translated),
        placeholders(source),
        `${code}: ${source}`,
      );
      assert.deepEqual(
        quantities(translated),
        quantities(source),
        `${code}: ${source}`,
      );
    }
  }
});
