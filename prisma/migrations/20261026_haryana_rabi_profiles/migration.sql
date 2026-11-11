-- Location examples based on ICAR Rabi advisory and CCS Haryana Agricultural University.
-- These are illustrative suitability entries, not a planting prescription.
INSERT IGNORE INTO `CropLocationSuitability` (`id`, `cropId`, `state`, `district`, `season`, `notes`)
SELECT 'haryana-rabi-wheat', `id`, 'Haryana', '', 'RABI', 'Illustrative Haryana Rabi profile based on ICAR/CCS HAU crop guidance; confirm soil, water, variety and sowing window with local KVK.' FROM `Crop` WHERE `name` = 'Wheat'
UNION ALL
SELECT 'haryana-rabi-mustard', `id`, 'Haryana', '', 'RABI', 'Illustrative Haryana Rabi profile based on ICAR/CCS HAU crop guidance; confirm soil, water, variety and sowing window with local KVK.' FROM `Crop` WHERE `name` = 'Mustard'
UNION ALL
SELECT 'haryana-rabi-chickpea', `id`, 'Haryana', '', 'RABI', 'Illustrative Haryana Rabi profile based on ICAR/CCS HAU crop guidance; confirm soil, water, variety and sowing window with local KVK.' FROM `Crop` WHERE `name` = 'Chickpea'
UNION ALL
SELECT 'haryana-bhiwani-rabi-barley', `id`, 'Haryana', 'Bhiwani', 'RABI', 'Illustrative Bhiwani Rabi profile based on CCS HAU district cropping pattern; confirm soil, water, variety and sowing window with local KVK.' FROM `Crop` WHERE `name` = 'Barley';
