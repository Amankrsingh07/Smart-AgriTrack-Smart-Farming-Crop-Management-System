# Smart Irrigation Planner references

The planner reuses saved crop, crop stage, field soil texture (or soil type), irrigation method, area and farm location. Soil, stage and method can be corrected for the calculation without editing the field record.

| Dataset | Published source and use |
| --- | --- |
| `soil_reference.json` | [FAO-56 Table 19](https://www.fao.org/4/X0490E/x0490e0c.htm) contains volumetric field capacity and wilting point ranges. Estimated Mode uses the midpoint of each range for a matching texture when neither field value is entered. Sandy Clay Loam, Clay Loam and Sandy Clay use volumetric texture-class means from [USDA ARS WEPS Table H-3](https://infosys.ars.usda.gov/winderosion/weps/docs/weps_tech.pdf). Broad soil classes such as Alluvial require a known texture or field inputs. Table 8 capacity values are context only. |
| `crop_kc.json` | [FAO-56 Table 12](https://www.fao.org/4/x0490e/x0490e0b.htm) and the [FAO water management stage table](https://www.fao.org/4/s2022e/s2022e07.htm). Where the development coefficient is missing, the planner interpolates between the initial and mid-season coefficients only when the user supplies progress through development. Grouped or proxy entries are identified in the source. A mustard proxy does not enable a mustard dose. |
| `crop_water_parameters.json` | [FAO-56 Table 22](https://www.fao.org/4/X0490E/x0490E0e.htm) provides depletion fractions and maximum effective rooting-depth ranges. Estimated Mode uses the lower end only for configured crops with established roots. At early stages, a current effective root depth is required. |
| `et0_reference.json` | FAO AQUASTAT / CRU CL 2.0 district-centroid monthly ETo normals (1961–1990). These are a historical reference, separate from daily weather. Chhapra, Chapra and Chapara resolve to Saran only in Bihar. Unsupported locations never borrow a nearby normal. |
| `irrigation_efficiency.json` | Published application-efficiency ranges. The planner converts net depth to litres using field area, then shows the gross range. |

## Modes

- **Measured Mode.** Requires field capacity, wilting point, volumetric soil moisture, and effective root depth for upland crops. Uses offline district/month ETo or the selected day's Open-Meteo model ETo. A balance after the reading is a projection. Eligible measured effective rainfall and completed watering follow the existing history rules. Forecast rainfall remains separate. This mode alone can save upland soil-check reminders.
- **Estimated Mode.** Uses [Open-Meteo daily ET₀ and precipitation](https://open-meteo.com/en/docs) at saved farm coordinates or the geocoded district. The user confirms field capacity after drainage on a date 1–14 days before calculation and confirms subsequent watering is logged. For each day the planner adds ETc (ET₀ × Kc), credits model rainfall up to available storage, and credits recorded irrigation using the lower published efficiency for its known method. Missing weather days or a recorded watering with unknown method prevent an amount. The selected stage is held constant over the period, with the upper Kc used for ranges. Weather is modeled, including days in the past. No measured moisture is inferred. Check field conditions before watering.
- **Demo Mode.** Uses a synthetic maize field and weather in the browser. It requires no saved field. The planner API rejects demo or estimated save requests. Actual watering history and reminders remain separate.

## Flooded rice

The [FAO paddy approach](https://www.fao.org/4/t7202e/t7202e07.htm) uses a separate one-day pond balance for an already saturated field. It takes starting and target standing-water depths, bund overflow depth, daily seepage and percolation loss, and explicit rainfall (or model rainfall in Estimated Mode). It credits rainfall up to the bund, then deducts ETc and seepage/percolation. If standing water may be exhausted, the app withholds a refill amount. This model excludes land preparation, intentional drainage, nonflooded rice, and alternate wetting and drying.

The planner issues estimates with method and source details. It does not fill missing daily weather with a climate normal or assign missing field measurements. Existing irrigation and rainfall records remain in their original account-scoped tables. No schema migration is needed.
