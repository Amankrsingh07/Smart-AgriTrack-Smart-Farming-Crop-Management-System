ALTER TABLE `Field`
  ADD COLUMN `soilTexture` VARCHAR(191) NULL,
  ADD COLUMN `irrigationSource` VARCHAR(191) NULL;

ALTER TABLE `CropCycle`
  ADD COLUMN `growthStage` VARCHAR(60) NULL;

ALTER TABLE `IrrigationSchedule`
  ADD COLUMN `soilMoisturePercent` DECIMAL(5,2) NULL,
  ADD COLUMN `recommendedQuantityLiters` DECIMAL(14,2) NULL,
  ADD COLUMN `actualQuantityLiters` DECIMAL(14,2) NULL,
  ADD COLUMN `seasonalRequirementMm` DECIMAL(8,2) NULL,
  ADD COLUMN `cropGrowthStage` VARCHAR(60) NULL,
  ADD COLUMN `irrigationDepthMm` DECIMAL(8,2) NULL,
  ADD COLUMN `efficiencyPercent` DECIMAL(5,2) NULL,
  ADD COLUMN `flowRateLitersPerMinute` DECIMAL(10,2) NULL,
  ADD COLUMN `recommendationSource` TEXT NULL,
  ADD COLUMN `recommendationNotes` TEXT NULL;
