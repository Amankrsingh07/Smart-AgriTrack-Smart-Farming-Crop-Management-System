# Fertilizer and Soil Health upgrade

## Current status

The `/fertilizer-recommendation` page and `/api/soil-health` endpoint are restored. The page can select an owned crop cycle, copy its field context, screen entered laboratory values, calculate source-backed product quantities, and show saved soil checks and fertilizer applications. Soil-check writes retain farm, field, crop and cycle links only after ownership checks. The previous standalone Vite calculator app remains removed; the NPK blend calculation library and recommendation workflow remain in the main project.

The offline regional dataset now contains four verified records: irrigated Rabi mustard and timely irrigated Rabi wheat for Haryana and Delhi, based on the ICAR Rabi 2021–22 advisory. These are regional general standards, not soil-test-adjusted prescriptions. Application timings and their nutrient splits are sourced from the advisory. The source also gives micronutrient and inoculation guidance; those products are explicitly excluded from the NPK product total.

The current dataset is deliberately limited. The Bihar GFR file and other regional packages currently contain no executable dose records. Crop lookup covers 90 canonical crop records, but this is not 90 crop recommendations. The source-check CLI can compare official publication downloads by content hash, while the staged-import CLI validates metadata and requires a named human reviewer to approve a version. No official live fertilizer recommendation API, automatic publishing job, administrator web interface, or verified soil-test response model is configured. Existing farmer reports, fertilizer applications, products, stock and prices remain in the database; no database migration or deletion was performed in this pass.

## Audit and migration safety

Historical baseline notes: the old navigation pointed to a demo and recommendation data was removed during source review. Those Bihar and Arunachal Pradesh package files currently have no executable dose rows. Crop mentions and partial application splits are not used as prescriptions.

Add two nullable metadata columns to FertilizerProduct. Existing product IDs, stock movements, prices, supplier entries and attachments are preserved. No merge or backfill is required. Back up the target and verify a disposable restore before deployment. Review this additive migration separately from the historical CropDiseaseCheck drop. No application database migration is planned during coding.

## Upgrade and coverage

| Crop | Source and applicability | Available plan |
| --- | --- | --- |
| Mustard | ICAR Rabi Agro-Advisory 2021–22, Haryana and Delhi chapter, printed pp. 116–117. Irrigated Rabi crop; verify the source sowing window and local applicability. | 80–30–20 kg/ha N–P₂O₅–K₂O using SSP for P. Half N and full P/K at sowing; remaining N at first irrigation (35–40 DAS). Source also specifies zinc sulphate and seed inoculation; those are displayed as separate guidance, outside the NPK product calculation. |
| Wheat | ICAR Rabi Agro-Advisory 2021–22, Haryana and Delhi chapter, printed pp. 120–121. Timely irrigated Rabi crop; source gives 25 Oct–15 Nov sowing window and says use general rates when soil testing is unavailable. | 150–60–30 kg/ha N–P₂O₅–K₂O using SSP for P. Half N and full P/K at sowing; remaining N at first irrigation (21–22 DAS). Verify variety and applicability locally. |
| Maize | No active Bihar or Arunachal Pradesh regional rows in the current executable dataset. | No verified recommendation currently available. |
| Barley | ICAR Rabi bulletin mentions nitrogen, phosphorus and manure in an advisory. | Insufficient Data for a complete local NPK calculation. The reviewed passage omits potassium and does not resolve phosphorus basis. Existing report classification and farmer-provided SHC/KVK planning remain available. |

[ICAR Rabi advisory](https://www.icar.gov.in/sites/default/files/2022-09/Rabi-Agro-Advisory-2021-22_0.pdf) · [ICAR-IISS district recommendations](https://icar-ciah.org/include/pdf/advisory/2026/jun_2026/GFR_district_wise_03062026.pdf)

The standard estimate uses the verified dose scaled to field area. Confirmed compatible applications reduce the balance. A successfully loaded empty history leaves the full target remaining. When history cannot be loaded or applications cannot safely be credited, the product balance is unavailable. A missing product price leaves the estimate unavailable. Cost estimates use the latest matching saved purchase price and scale by kilograms.

The existing Conventional, Organic and Integrated options remain available. Organic nutrient credits and crop-stage activities require an applicable verified source. The new mustard package supplies a conventional mineral plan. Demo weather is excluded from fertilizer weather reviews. Gemini continues to explain the published scope without generating quantities.

Product creation now matches the owner's grade, manufacturer, source, and pack size. Concurrent creation for the same identity returns an existing product ID. Historical duplicates remain separate to preserve prices and stock movements.

## Deployment and verification

Before deploying to a database with farmer records, take a consistent logical dump to a restricted encrypted location using a MySQL login path. For example, use `mysqldump --login-path=agritrack-backup --single-transaction --quick --hex-blob <database>`. Restore into a disposable database and compare existing product IDs, price counts, and movement counts before applying the reviewed additive SQL. The application database was left untouched during this upgrade.

The migration was applied to a disposable MySQL database for browser verification. Unit tests cover verified mustard scope and timing, the existing Wheat and Maize datasets, Barley evidence gaps, application accounting, missing prices, and demo weather isolation. Gemini’s fallback and quantity rejection were verified by tests with simulated provider responses.

Current pass (23 November 2026): TypeScript check, production build, and all 301 unit tests passed. No Playwright run or live Gemini request was performed in this pass.

## Master prompt follow-up

The restored saved-crop workflow is `/fertilizer-recommendation`. It reuses the existing field-linked soil history, fertilizer application, stock, calendar, expense and reference models. No migration was needed for this pass.

The insufficient-data result shows the selected crop, season and region, with a shortcut to the existing issued-rate calculator. Report mode also links to the regional-standard workflow. An integrated preference with conventional-only matches identifies the farming preference as the missing coverage.

Advanced Scientific Mode now contains an offline theoretical NPK blend calculator. It reuses the existing Urea/DAP/MOP math, checks mass and nutrient constraints, and displays theoretical filler weight without selecting any filler material. It neither saves an application nor provides compatibility approval. The new panel has English and Hindi text, with English fallback in other locales.

The attached text did not include reference screenshots. Full replacement of the old engine, additional verified foliar and micronutrient dose coverage, complex-grade and organic credits, and externally verified dataset updates remain open.

## Product-grade comparison

Advanced Soil Analysis can compare DAP, SSP, NPK 10:26:26, NPK 12:32:16 and NPS 20:20:0:13 as phosphorus sources. In field mode, enter issued N–P₂O₅–K₂O rates and the area in acres or hectares. The calculator caps the phosphorus product at the N and K₂O targets, counts its contribution before adding Urea or MOP, and reports any leftover P₂O₅ requirement. S is shown separately as a contribution. In blend mode the same calculation checks the NPK target and total product mass. Both modes are local arithmetic and have no application or calendar write action.

The bundled grades cite the Government of India Department of Fertilizers, the Press Information Bureau, and manufacturer specifications. This adds product composition data. The crop prescription coverage table above still describes the regional source coverage. The grade data adds no foliar dose, organic credit, product-specific compatibility approval, or current price.
