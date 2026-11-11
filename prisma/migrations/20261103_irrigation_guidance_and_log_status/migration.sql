-- Additive metadata only; existing farmer and irrigation records are preserved.
ALTER TABLE `CropWaterStage`
  ADD COLUMN `cropCoefficient` DECIMAL(5,3) NULL,
  ADD COLUMN `rootDepthMeters` DECIMAL(5,2) NULL,
  ADD COLUMN `allowableDepletionFraction` DECIMAL(5,3) NULL,
  ADD COLUMN `publicationDate` DATE NULL,
  ADD COLUMN `verifiedAt` DATE NULL;

ALTER TABLE `IrrigationSchedule`
  ADD COLUMN `actualQuantityUnit` VARCHAR(16) NULL,
  ADD COLUMN `status` VARCHAR(16) NULL;

UPDATE `IrrigationSchedule`
SET `status` = CASE WHEN `completedAt` IS NOT NULL THEN 'COMPLETED' ELSE 'PLANNED' END
WHERE `status` IS NULL;

UPDATE `IrrigationSchedule`
SET `actualQuantityUnit` = 'L'
WHERE `actualQuantityLiters` IS NOT NULL AND `actualQuantityUnit` IS NULL;
