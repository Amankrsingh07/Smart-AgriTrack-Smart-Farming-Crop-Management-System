ALTER TABLE `CropSoilRequirement`
  ADD COLUMN `minPh` DECIMAL(4,2) NULL,
  ADD COLUMN `maxPh` DECIMAL(4,2) NULL,
  ADD COLUMN `minNitrogenKgHa` DECIMAL(10,2) NULL,
  ADD COLUMN `maxNitrogenKgHa` DECIMAL(10,2) NULL,
  ADD COLUMN `minPhosphorusKgHa` DECIMAL(10,2) NULL,
  ADD COLUMN `maxPhosphorusKgHa` DECIMAL(10,2) NULL,
  ADD COLUMN `minPotassiumKgHa` DECIMAL(10,2) NULL,
  ADD COLUMN `maxPotassiumKgHa` DECIMAL(10,2) NULL,
  ADD COLUMN `minOrganicCarbonPercent` DECIMAL(5,3) NULL,
  ADD COLUMN `maxOrganicCarbonPercent` DECIMAL(5,3) NULL,
  ADD COLUMN `minSoilMoisturePercent` DECIMAL(5,2) NULL,
  ADD COLUMN `maxSoilMoisturePercent` DECIMAL(5,2) NULL,
  ADD COLUMN `fertilizerRecommendation` TEXT NULL,
  ADD COLUMN `source` VARCHAR(191) NULL,
  ADD COLUMN `sourceUrl` TEXT NULL;

ALTER TABLE `CropRecommendation`
  ADD COLUMN `stateName` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `blockName` VARCHAR(191) NULL,
  ADD COLUMN `villageName` VARCHAR(191) NULL,
  ADD COLUMN `inputSnapshot` JSON NULL,
  ADD COLUMN `modelVersion` VARCHAR(191) NOT NULL DEFAULT 'rules-v1';

ALTER TABLE `Crop` ADD COLUMN `source` VARCHAR(191) NULL, ADD COLUMN `sourceUrl` TEXT NULL;
ALTER TABLE `CropSeason` ADD COLUMN `source` VARCHAR(191) NULL, ADD COLUMN `sourceUrl` TEXT NULL;
ALTER TABLE `CropClimateRequirement`
  ADD COLUMN `minHumidityPercent` DECIMAL(5,2) NULL,
  ADD COLUMN `maxHumidityPercent` DECIMAL(5,2) NULL,
  ADD COLUMN `source` VARCHAR(191) NULL,
  ADD COLUMN `sourceUrl` TEXT NULL;
ALTER TABLE `CropDistrictSuitability` ADD COLUMN `source` VARCHAR(191) NULL, ADD COLUMN `sourceUrl` TEXT NULL;
ALTER TABLE `CropLocationSuitability` ADD COLUMN `source` VARCHAR(191) NULL, ADD COLUMN `sourceUrl` TEXT NULL;
