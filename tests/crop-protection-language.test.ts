import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderSoil } from "./helpers/soil-render";
import {
  ProtectionCatalogProvider,
  ProtectionLanguage,
} from "../src/i18n/crop-protection/client";
import {
  protectionText,
  protectionLanguageNotice,
  workspaceCatalog,
} from "../src/i18n/crop-protection";
test("Hindi controls preserve canonical submitted values and raw scientific metadata", () => {
  const tree = React.createElement(
    ProtectionLanguage as React.ComponentType<{
      notice?: boolean;
      children?: React.ReactNode;
    }>,
    { notice: true },
    React.createElement(
      "label",
      null,
      "Sample type",
      React.createElement(
        "select",
        null,
        React.createElement("option", null, "Water"),
      ),
    ),
    React.createElement("span", { "data-protection-raw": true }, "Water"),
  );
  const html = renderSoil(
    React.createElement(
      ProtectionCatalogProvider as React.ComponentType<{
        value: ReturnType<typeof workspaceCatalog>;
        children?: React.ReactNode;
      }>,
      { value: workspaceCatalog("hi") },
      tree,
    ),
    "hi",
  );
  assert.match(html, /नमूने का प्रकार/);
  assert.match(html, /<option value="Water">पानी<\/option>/);
  assert.match(html, />Water<\/span>/);
  assert.equal(protectionText("hi", "mg/kg"), "mg/kg");
  assert.equal(
    protectionText("hi", "Ralstonia solanacearum"),
    "Ralstonia solanacearum",
  );
  assert.equal(protectionLanguageNotice("bn"), null);
  assert.ok(
    protectionLanguageNotice("unsupported")?.includes("English fallback"),
  );
});

test("crop protection headings and new screening text resolve in every supported farmer language", () => {
  const root = "Smart Crop Protection & Recovery System";
  const signs = [
    "Pointed spots with gray centers and brown edges",
    "Brown spots with rings inside",
  ];
  for (const locale of [
    "hi",
    "pa",
    "mr",
    "gu",
    "bn",
    "ta",
    "te",
    "kn",
    "ml",
    "or",
  ]) {
    for (const text of [
      root,
      ...signs,
      "AI photo observations",
      "Signs pointing to other causes",
      "Recovery check",
    ]) {
      assert.notEqual(
        protectionText(locale, text),
        text,
        `${locale} should translate ${text}`,
      );
    }
    assert.equal(
      protectionText(locale, signs.join(", ")),
      signs.map((s) => protectionText(locale, s)).join(", "),
    );
  }
});
