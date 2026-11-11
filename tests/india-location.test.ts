import test from "node:test";
import assert from "node:assert/strict";
import { findIndianDistrict, findIndianState, indianStateNamesMatch } from "../src/lib/india-location";

test("weather location matching ignores case, punctuation and spacing differences", () => {
  const state = findIndianState(" jAmMu & Kashmir ");
  assert.equal(state?.name, "Jammu And Kashmir");
  assert.equal(findIndianDistrict("10", " BEGUSARAI ")?.name, "Begusarai");
});

test("legacy state names resolve to the current Indian location record", () => {
  assert.equal(findIndianState("Orissa")?.name, "Odisha");
  assert.equal(findIndianState("Uttaranchal")?.name, "Uttarakhand");
  assert.equal(indianStateNamesMatch("NCT of Delhi", "Delhi"), true);
});

test("district lookup remains scoped to the selected state", () => {
  assert.equal(findIndianDistrict("10", "Amritsar"), undefined);
  assert.equal(findIndianDistrict("3", "Amritsar")?.name, "Amritsar");
  assert.equal(indianStateNamesMatch("Punjab", "Bihar"), false);
});

test("Bihar locality names Chapra and Chhapra resolve to official Saran district", () => {
  assert.equal(findIndianDistrict("10", "Chhapra")?.name, "Saran");
  assert.equal(findIndianDistrict("10", "Chapra")?.name, "Saran");
  assert.equal(findIndianDistrict("10", "Chapara")?.name, "Saran");
  assert.equal(findIndianDistrict("3", "Chhapra"), undefined);
});
