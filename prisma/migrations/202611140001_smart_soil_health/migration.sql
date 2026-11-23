-- Additive only: existing JSON reports, IDs and timestamps are retained byte-for-byte.
-- Historical rows deliberately remain unlinked; crop names must not be guessed into IDs.
ALTER TABLE `FertilizerRecommendationHistory`
  ADD COLUMN `sampleDate` DATE NULL,
  ADD COLUMN `farmId` VARCHAR(191) NULL,
  ADD COLUMN `fieldId` VARCHAR(191) NULL,
  ADD COLUMN `cropId` VARCHAR(191) NULL,
  ADD COLUMN `cropCycleId` VARCHAR(191) NULL;
CREATE INDEX `FertilizerRecommendationHistory_userId_fieldId_sampleDate_idx` ON `FertilizerRecommendationHistory` (`userId`, `fieldId`, `sampleDate`);
CREATE INDEX `FertilizerRecommendationHistory_farmId_idx` ON `FertilizerRecommendationHistory` (`farmId`);
CREATE INDEX `FertilizerRecommendationHistory_fieldId_idx` ON `FertilizerRecommendationHistory` (`fieldId`);
CREATE INDEX `FertilizerRecommendationHistory_cropId_idx` ON `FertilizerRecommendationHistory` (`cropId`);
CREATE INDEX `FertilizerRecommendationHistory_cropCycleId_idx` ON `FertilizerRecommendationHistory` (`cropCycleId`);
ALTER TABLE `FertilizerRecommendationHistory`
  ADD CONSTRAINT `FertilizerRecommendationHistory_farmId_fkey` FOREIGN KEY (`farmId`) REFERENCES `Farm` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `FertilizerRecommendationHistory_fieldId_fkey` FOREIGN KEY (`fieldId`) REFERENCES `Field` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `FertilizerRecommendationHistory_cropId_fkey` FOREIGN KEY (`cropId`) REFERENCES `Crop` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `FertilizerRecommendationHistory_cropCycleId_fkey` FOREIGN KEY (`cropCycleId`) REFERENCES `CropCycle` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
