# AgriTrack – Smart Farming & Crop Management System

AgriTrack is a Next.js application for organizing a farmer's locations, fields, crop cycles, and farm expenses. It uses per-account authorization and a MySQL database through Prisma. It includes offline reference data and optional online services: the assistant uses Gemini, live mandi prices use data.gov.in, and current weather uses Open-Meteo. Crop advice falls back to local examples when Gemini is unavailable.

## Technology

- Next.js App Router, React, TypeScript, Tailwind CSS
- MySQL and Prisma ORM
- Secure password hashing with bcryptjs and signed, HTTP-only session cookies
- Gemini-powered assistant, local crop-advice fallback, and bundled location/catalog data
- Lucide React dependency is included for future icon use; current navigation uses text symbols

## Prerequisites

- Node.js 20 or newer and npm
- A MySQL 8 compatible database
- Internet access and `GEMINI_API_KEY` for the assistant; offline crop-advice examples remain available

## Setup

```sh
npm install
cp .env.example .env
```

Set `DATABASE_URL` to your MySQL connection string and `SESSION_SECRET` to a random secret with at least 32 characters. Keep `.env` private and do not commit it. Do not paste production credentials into `.env.example`.

Never zip or share `.env`, `.env.local`, or `prisma/aiven-ca.pem`; these files contain credentials or private connection material and are ignored by Git. If `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `SESSION_SECRET`, database credentials, or API keys were shared, rotate them immediately.

## Database

```sh
npm run db:generate
npm run db:deploy
npm run db:seed
```

SQL migrations are committed under `prisma/migrations`. `db:deploy` applies committed migrations, including account-scoped manual market entries and inventory thresholds. Use `db:migrate` locally to create a new migration after schema edits. Existing illustrative crop profiles, if present, are not authoritative agricultural recommendations. Verify crop/location/soil requirements with reliable local agricultural sources before production use. Migration commands create additive schema changes; do not use `prisma migrate reset` against a database containing user data.

Phase 1 location records are stored in `prisma/data/states.json` and `prisma/data/districts.json`, with LGD codes, source URL, and source date retained in the files and imported rows. The bundled snapshot is dated 23 Sep 2026; refresh it from the official LGD/OGD release before treating it as current. It contains 36 states/UTs and 784 districts, but no district coordinates. Coordinates remain null until verified data is provided. Crop suitability profiles remain incomplete; do not add unverified suitability values. The seed uses LGD codes for idempotent location upserts and preserves existing non-null coordinates when source coordinates are missing.

Crop water stages are linked to crop seasons and require a source URL. Crop recommendation continues to use these shared crop-water records. The irrigation planner uses bundled FAO-56 crop coefficients, FAO AQUASTAT historic district climate normals, typical soil-water references, and published irrigation-method efficiency ranges. It calculates a crop-demand estimate and shows an application range. It does not subtract rainfall or represent field-specific measurements; paddy dose is withheld because ponding, seepage, and percolation are not represented. See [irrigation dataset notes](src/data/irrigation/README.md) for sources and limits.

Location lookup endpoints: `GET /api/locations/states` and `GET /api/locations/districts?stateId=<state-id-or-lgd-code>`. Responses use `{ success, data }`, with a consistent `{ success: false, error }` shape on errors.

## Run

```sh
npm run dev
```

Open <http://localhost:3000>. Signup creates an account; dashboard, farm, crop, expense, and alert records are scoped to the signed-in user.

## Offline presentation mode

Run the Next.js server and MySQL on the same computer or local network. Install dependencies before the presentation (`npm install` may require internet). Core records and bundled reference data work locally; the assistant, live mandi prices, and current weather need internet and their configured services. Keep `DATABASE_URL` pointed at your local MySQL instance and set `SESSION_SECRET` as described above. User accounts, farm records, quotes, analytics, and language preferences are stored locally in MySQL. India state/district records and crop references are bundled with the project.

The general weather screen can display deterministic sample values generated on the computer; these are labeled and are not a forecast or observed weather. Crop advice uses local examples when the Gemini service is unavailable; the farm assistant requires Gemini and an internet connection. The market page bundles `src/data/mandi-prices.json`, downloaded from data.gov.in on 3 Nov 2026; it contains 13,253 official records dated 3 Nov 2026. Online mandi search requires `DATA_GOV_IN_API_KEY`. Refreshing the offline snapshot requires downloading and replacing the file manually. Enter locally observed mandi prices with the manual quote form. The PDF/print action uses the browser's built-in print dialog.

The Soil Health Card check at `/fertilizer-recommendation` works offline from farmer-entered lab values. It uses general N/P/K screening bands bundled from the Government of India's Soil Health Card Portal Teacher's Manual in `src/data/soil-health-reference.json`; demo values are marked synthetic. It saves checks to the signed-in account using the existing `FertilizerRecommendationHistory` migration. This screen reports nutrient classes and asks farmers to consult the crop-specific SHC recommendation; it does not calculate fertilizer product or application quantities. Apply pending local database migrations with `npm run db:deploy`.

The recommendation score is comparative, not a scientific model: location/season match adds 40 points, soil match adds 25 (or subtracts 15), and water match adds 20 (or subtracts 8 per configured water level of difference). These inputs are stored crop profiles and require local verification.

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

The current tests cover recommendation scoring, decimal sale calculations, inventory quantity caps, the offline irrigation estimate, weather data, and profit/loss arithmetic. Database integration and browser end-to-end tests are not configured.

## Current limitations

- Implemented: signup/login/logout, dashboard aggregates, farm and field creation, crop-cycle creation, rule-based crop recommendation, Gemini-powered assistant, seven-day generated sample weather and planning guidance, seasonal crop registration, private manual market quotes, expense creation, production and sales records with inventory caps, crop stock inventory with configurable low/high thresholds, the offline Smart Irrigation Planner with optional online ETo and irrigation history, reports, harvest countdowns, and harvest confirmation integrated with production stock.
- Remaining: edit/delete workflows, budget management and threshold-alert generation, report date filters and CSV exports, editable profile/location, richer validation feedback, database/browser integration tests, and a production-ready session revocation strategy.
- Browser authorization is not used: protected server operations derive the user from the signed session and scope database lookups to that user.
- Session tokens expire after 14 days; signing keys must be rotated and HTTPS must be enabled in production.
- Weather depends on upstream API availability and valid coordinates. The current server fetch records provider time and uses a 30-minute cache; provider terms and attribution should be reviewed before commercial deployment.
- Irrigation screen translations are available in English and Hindi; other selected languages fall back to English for that screen.
