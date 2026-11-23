
# AgriTrack – Smart Farming & Crop Management System

AgriTrack is a Next.js application for organizing a farmer's locations, fields, crop cycles, and farm expenses. It uses per-account authorization and a MySQL database through Prisma. It includes offline reference data and optional online services: the assistant uses Gemini, live mandi prices use data.gov.in, and current weather uses Open-Meteo. Saved Crop Advice uses field records and bundled references. The assistant falls back to local guidance when Gemini is unavailable.

## Technology

- Next.js App Router, React, TypeScript, Tailwind CSS
- MySQL and Prisma ORM
- Secure password hashing with bcryptjs and signed, HTTP-only session cookies
- Gemini-powered assistant, local crop-advice fallback, and bundled location/catalog data
- Lucide React dependency is included for future icon use; current navigation uses text symbols

## Prerequisites

- Node.js 20 or newer and npm
- A MySQL 8 compatible database
- Internet access and `GEMINI_API_KEY` or `GOOGLE_API_KEY` for online assistant explanations
- The assistant defaults to `gemini-flash-lite-latest`. Set the server-side `GEMINI_ASSISTANT_MODEL` variable to override the chat model.

## Setup

```sh
npm install
cp .env.example .env
```

Set `DATABASE_URL` to your MySQL connection string and `SESSION_SECRET` to a random secret with at least 32 characters. Keep `.env` private and do not commit it. Do not paste production credentials into `.env.example`.

Never zip or share `.env`, `.env.local`, or `prisma/aiven-ca.pem`; these files contain credentials or private connection material and are ignored by Git. If `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `SESSION_SECRET`, database credentials, or API keys were shared, rotate them immediately.

## Database

For an existing database, review migration status before deployment. Historical migration `202611110002_remove_crop_health_checks` drops `CropDiseaseCheck`; do not apply unrelated pending migrations blindly. The deployment wrapper stops before migration if the legacy table exists and the drop is pending. Follow the [migration safety review](docs/agritrack-master-audit.md) and [MySQL backup procedure](docs/mysql-backup-restore.md) before deploying.

```sh
npm run db:generate
npm run db:deploy
npm run db:seed
```

SQL migrations are committed under `prisma/migrations`. Use `npm run db:deploy` so the database foundation is applied before the crop-prediction migration. If a previous deployment failed at the first statement of `20261101_india_crop_prediction`, verify that it applied no changes before marking it rolled back with `npx prisma migrate resolve --rolled-back 20261101_india_crop_prediction` and rerunning deployment. Use `db:migrate` locally to create a new migration after schema edits. Existing illustrative crop profiles, if present, are not authoritative agricultural recommendations. Verify crop/location/soil requirements with reliable local agricultural sources before production use. Do not use `prisma migrate reset` against a database containing user data.

Phase 1 location records are stored in `prisma/data/states.json` and `prisma/data/districts.json`, with LGD codes, source URL, and source date retained in the files and imported rows. The bundled snapshot is dated 23 Sep 2026; refresh it from the official LGD/OGD release before treating it as current. It contains 36 states/UTs and 784 districts, but no district coordinates. Coordinates remain null until verified data is provided. Crop suitability profiles remain incomplete; do not add unverified suitability values. The seed uses LGD codes for idempotent location upserts and preserves existing non-null coordinates when source coordinates are missing.

Crop water stages are linked to crop seasons and require a source URL. Crop recommendation continues to use these shared crop-water records. The irrigation planner uses bundled FAO-56 crop coefficients, FAO AQUASTAT historic district climate normals, typical soil-water references, and published irrigation-method efficiency ranges. It calculates crop demand and shows an application range when measured inputs support it. The root-zone balance can credit qualifying observed effective rainfall after a matching moisture observation. Paddy dose is withheld because ponding, seepage, and percolation are not represented. See [irrigation dataset notes](src/data/irrigation/README.md) for sources and limits.

Location lookup endpoints: `GET /api/locations/states` and `GET /api/locations/districts?stateId=<state-id-or-lgd-code>`. Responses use `{ success, data }`, with a consistent `{ success: false, error }` shape on errors.

## Run

```sh
npm run dev
```

Open <http://localhost:3000>. Signup creates an account; dashboard, farm, crop, expense, and alert records are scoped to the signed-in user.

## Offline presentation mode

Run the Next.js server and MySQL on the same computer or local network. Install dependencies before the presentation (`npm install` may require internet). Core records and bundled reference data work locally; the assistant, live mandi prices, and current weather need internet and their configured services. Keep `DATABASE_URL` pointed at your local MySQL instance and set `SESSION_SECRET` as described above. User accounts, farm records, quotes, analytics, and language preferences are stored locally in MySQL. India state/district records and crop references are bundled with the project.

The general weather screen can display deterministic sample values generated on the computer; these are labeled and are not a forecast or observed weather. Saved Crop Advice needs the local server and MySQL. If Gemini is unavailable, the assistant shows general local guidance. If a saved crop is selected, the online assistant receives only its name, season, stage, status, soil type and water availability along with the question. The market page keeps the bundled `src/data/mandi-prices.json` snapshot from data.gov.in for offline search. Online mandi lookup uses the Finnid public Live Prices endpoint, which reports daily sync from data.gov.in and a 15-day rolling window; when Finnid is unavailable, the existing VoiceOfVillage read-only tool is used if `VOV_API_KEY` is configured. A valid `DATA_GOV_IN_API_KEY` can instead enable direct data.gov.in lookup. Select a district for online searches. Online results show the provider, report date and official data source; if online lookup fails, matching bundled snapshot records remain available. Enter locally observed mandi prices with the manual quote form. The PDF/print action uses the browser's built-in print dialog.

The Soil Health workflow at `/soil-health` supports optional measured N/P/K, organic carbon and pH; explicit Demo/Real Laboratory modes; method/basis/unit compatibility checks; saved report snapshots and comparable history trends. Bihar/Odisha references provide conditional indicative national-baseline screening, not state-calibrated field diagnosis. Missing evidence remains Unknown and the score remains Insufficient data. Optional private PDF/image attachments preserve original documents; manual review is required and upload does not verify a laboratory. The separate offline ICAR Urea/DAP/MOP calculator uses bundled source recommendations or explicit SHC/KVK targets, with validation of incompatible custom splits. See [soil workflow verification](docs/soil-improvement-verification.md) before applying migrations or running isolated tests.

The recommendation score is comparative, not a scientific model: location/season match adds 40 points, soil match adds 25 (or subtracts 15), and water match adds 20 (or subtracts 8 per configured water level of difference). These inputs are stored crop profiles and require local verification.

## Saved Crop Advice

Open **Crop advice**, then choose a field and crop cycle. Review the recorded variety, soil report, upcoming activities, protection observations and harvest records. The irrigation card estimates daily crop water demand using the shared planner and FAO crop coefficients. It uses matching-day Open-Meteo model ETo for saved coordinates when available, or the bundled district/month climate normal. The result identifies its source. A missing coefficient or ETo produces an insufficient-data state.

The ETc estimate assumes standard crop conditions and takes no rainfall credit. Use the irrigation planner for a water balance based on measured root-zone inputs. See the [irrigation dataset notes](src/data/irrigation/README.md) for geographic coverage and source details.

## Smart irrigation

The single planner at `/irrigation` lets a farmer select a saved crop, soil, field area, growth stage, and method, then enter measured soil-water values. Its offline estimate is available only where the bundled crop and district references match. Farmers can save a soil-check reminder, record completed watering, and review irrigation history. The app preserves existing irrigation history in the `IrrigationSchedule` table. No irrigation table is dropped and no irrigation records are deleted by this cleanup.

## Harvest records

Crop cycles can store an expected harvest date directly or derive it from the sowing date and farmer-entered crop duration. The `/harvests` center shows India-time countdowns. Confirming harvest records the actual harvest date, quantity, unit, quality/grade, storage notes, and calculated yield per acre where the unit and field area support the conversion. It marks the existing crop cycle harvested and adds a production record, which feeds the existing stock and sales pages.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

The current tests cover recommendation scoring, decimal sale calculations, inventory quantity caps, the offline irrigation estimate, weather data, and profit/loss arithmetic. Isolated Playwright API/browser tests are configured; see [soil workflow verification](docs/soil-improvement-verification.md).

## Current limitations

- Implemented: signup/login/logout, dashboard aggregates, farm and field creation, crop-cycle creation, rule-based crop recommendation, Gemini-powered assistant, seven-day generated sample weather and planning guidance, seasonal crop registration, private manual market quotes, expense creation, production and sales records with inventory caps, crop stock inventory with configurable low/high thresholds, the offline Smart Irrigation Planner with optional online ETo and irrigation history, reports, harvest countdowns, and harvest confirmation integrated with production stock.
- Remaining: edit/delete workflows, budget management and threshold-alert generation, report date filters and CSV exports, editable profile/location, richer validation feedback, broader integration coverage outside the soil workflow, and a production-ready session revocation strategy.
- Browser authorization is not used: protected server operations derive the user from the signed session and scope database lookups to that user.
- Session tokens expire after 14 days; signing keys must be rotated and HTTPS must be enabled in production.
- Weather depends on upstream API availability and valid coordinates. Forecast requests use a server timeout and bypass the fetch cache. Provider terms and attribution should be reviewed before commercial deployment.
- Irrigation screen translations are available in English and Hindi; other selected languages fall back to English for that screen.

See [soil workflow improvements and actual reference coverage](docs/soil-improvement-verification.md) and [MySQL backup/restore procedures](docs/mysql-backup-restore.md).

## Crop loss and prevention

`/crop-loss` adds measured allocations for existing harvested lots, weighted year/season/crop/field analytics, conditional INR valuation, on-request weather/soil review and existing-model reminders. See [scope, migration, setup and limitations](docs/crop-loss-analysis.md). No expected yield, missing price or demo forecast is used to infer real losses.

## AI Smart Fertilizer & Crop Nutrition Management System

The Fertilizer Recommendation menu opens the existing Soil Health dashboard at `/soil-health`. Saved links retain their crop, field, report, and plan selections. Select a saved crop cycle to begin. Choose a saved soil report, a Soil Health Card PDF, a photograph, manual entry, or no soil report. The district, area, stage, linked history and other available farm details come from saved records. Review any applicable published conditions before calculating a regional dose. Use **Advanced Soil Analysis** for laboratory samples, the manual SHC/KVK calculator, sample history, research coverage, and fertilizer inventory.

The calculation works on the application server with the database and bundled data when external services are unavailable. Gemini is optional and only supplies reviewed document drafts, visible photo observations, and explanations. Keep API keys on the server. Connect `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) and `GEMINI_MODEL` for those features. Open-Meteo is requested separately. Browser-disconnected operation requires its own offline sync layer.

The fertilizer stock ledger uses the additive migration `202611180003_fertilizer_stock`. Apply reviewed migrations through your normal deployment process after backing up the target database. The redesigned route continues to use the existing soil report and attachment records.

See the [fertilizer module upgrade and source coverage](docs/fertilizer-module-upgrade.md).
