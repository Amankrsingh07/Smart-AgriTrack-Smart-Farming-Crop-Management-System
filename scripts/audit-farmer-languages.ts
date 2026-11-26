import english from "../messages/en.json";
import hindi from "../messages/hi.json";
import { languages } from "../src/i18n/languages";
import { farmerMessageOverrides } from "../src/i18n/farmer-message-overrides";
import { pageMessagesFor, recordsMessages } from "../src/i18n/page-messages";
import { soilCatalog } from "../src/i18n/soil-health";
import { workspaceCatalog } from "../src/i18n/crop-protection";
import soilKeys from "../src/i18n/soil-health/en.json";
import protectionKeys from "../src/i18n/crop-protection/en.json";

const pending = (
  localized: Record<string, string>,
  source: Record<string, string>,
) =>
  Object.keys(source).filter(
    (key) => !localized[key]?.trim() || localized[key] === source[key],
  ).length;
const authored = (keys: string[]) =>
  Object.fromEntries(keys.map((key) => [key, key]));

console.table(
  languages
    .filter((row) => row.code !== "en")
    .map(({ code }) => {
      const pages = pageMessagesFor(code);
      const source = pageMessagesFor("en");
      const base = code === "hi" || code === "bn" ? code : "en";
      return {
        locale: code,
        Farms: pending(
          farmerMessageOverrides(
            code,
            pages.Farms,
            source.Farms,
            base === "en",
          ),
          source.Farms,
        ),
        Crops: pending(
          farmerMessageOverrides(
            code,
            pages.Crops,
            source.Crops,
            base === "en",
          ),
          source.Crops,
        ),
        Irrigation: pending(
          farmerMessageOverrides(
            code,
            code === "hi" ? hindi.Irrigation : english.Irrigation,
            english.Irrigation,
            code !== "hi",
          ),
          english.Irrigation,
        ),
        Records: pending(
          farmerMessageOverrides(
            code,
            recordsMessages[base],
            recordsMessages.en,
            base === "en",
          ),
          recordsMessages.en,
        ),
        Soil: pending(soilCatalog(code) ?? {}, authored(soilKeys)),
        Protection: pending(workspaceCatalog(code), authored(protectionKeys)),
      };
    }),
);
console.log(
  "Counts include English-identical identifiers and units. Review each candidate in its screen context.",
);
