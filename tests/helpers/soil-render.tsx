import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { soilCatalog } from "../../src/i18n/soil-health";
import { SoilCatalogProvider } from "../../src/i18n/soil-health/client";
export function renderSoil(child: React.ReactNode, locale = "en") {
 return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={{}} timeZone="Asia/Kolkata"><SoilCatalogProvider value={soilCatalog(locale)}>{child}</SoilCatalogProvider></NextIntlClientProvider>);
}
