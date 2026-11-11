# Irrigation reference data review

This is a review only. The configured coefficients and efficiencies were not changed.

## Wheat initial crop coefficient

- Exact JSON path: `src/data/irrigation/crop_kc.json` → `crops[0].initial` (`0.7`).
- Exact `reference` text: `FAO-56 Table 12, winter wheat, non-frozen soils`.
- The dataset metadata identifies the source as FAO Irrigation and Drainage Paper 56, Chapter 6, Table 12. Table 12 gives typical standard crop coefficients for non-stressed, well-managed crops under sub-humid reference conditions (minimum relative humidity around 45%, 2 m/s wind), with FAO-56 adjustments required for local climate and management. FAO also explains that the initial coefficient depends on wetting interval and reference ET.
- The “non-frozen soils” qualifier makes this a relevant winter-wheat reference where the soil is not frozen; it does not establish 0.70 as a locally validated coefficient for all Indian wheat-growing conditions. It is a reasonable sourced baseline only when the reference assumptions are suitable, and should be adjusted with local conditions and wetting practice.
- Source: [FAO-56 Table 12 and crop coefficient conditions](https://www.fao.org/4/x0490e/x0490e0b.htm).

## Missing development coefficients

- Wheat: `src/data/irrigation/crop_kc.json` → `crops[0].development` is `null`; its exact `reference` text is `FAO-56 Table 12, winter wheat, non-frozen soils`.
- Maize: `src/data/irrigation/crop_kc.json` → `crops[2].development` is `null`; its exact `reference` text is `FAO-56 Table 12, field maize`.
- The current dataset deliberately does not supply a development-stage value. Options for a future, separately reviewed change are to add a verified crop- and location-appropriate source, or implement documented FAO-56 interpolation from initial to mid-season using crop stage durations. No value or interpolation behavior was added in this change.

## Surface/flood efficiency

- Exact JSON path: `src/data/irrigation/irrigation_efficiency.json` → `methods[2].efficiencyPercent` (`min: 30`, `max: 35`).
- Exact `source` text: `ICAR, Drip Fertigation for Higher Crop Production, Table 1 (reported overall efficiency)`.
- ICAR Table 1 labels separate columns for “Application efficiency”, “Surface water moisture evaporation efficiency”, and “Overall efficiency”. Its surface irrigation row reports 40–70% application efficiency, 30–40% for the surface-water moisture/evaporation column, and 30–35% overall efficiency. The configured 30–35% is the overall figure, not the application-efficiency column.
- For net requirement `N` litres, gross application using 30–35% overall efficiency is `N / 0.35` to `N / 0.30`, or about 2.86–3.33 times the net litres. This wider gross range reflects the published efficiency range; it is not a measured efficiency for a particular installed field system.
- Source: [ICAR, Table 1](https://epubs.icar.org.in/index.php/IndFarm/article/download/72783/30772/184021).
