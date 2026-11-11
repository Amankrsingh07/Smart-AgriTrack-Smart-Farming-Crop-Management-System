-- Add season-aware, source-attributed water profile fields without changing existing crop data.
ALTER TABLE `CropWaterStage`
    ADD COLUMN `cropSeasonId` VARCHAR(191) NULL,
    ADD COLUMN `waterMeasure` ENUM('CROP_ETC', 'EFFECTIVE_RAINFALL', 'IRRIGATION_REQUIREMENT', 'CROP_WATER_PLUS_EFFECTIVE_RAINFALL') NULL,
    ADD COLUMN `minimumWaterRequirementMm` DECIMAL(8, 2) NULL,
    ADD COLUMN `maximumWaterRequirementMm` DECIMAL(8, 2) NULL,
    ADD COLUMN `source` VARCHAR(191) NULL,
    ADD COLUMN `sourceUrl` TEXT NULL;

DROP INDEX `CropWaterStage_cropId_stageName_key` ON `CropWaterStage`;
CREATE UNIQUE INDEX `CropWaterStage_cropId_cropSeasonId_stageName_waterMeasure_key`
    ON `CropWaterStage`(`cropId`, `cropSeasonId`, `stageName`, `waterMeasure`);
CREATE INDEX `CropWaterStage_cropSeasonId_waterMeasure_idx`
    ON `CropWaterStage`(`cropSeasonId`, `waterMeasure`);

ALTER TABLE `CropWaterStage`
    ADD CONSTRAINT `CropWaterStage_cropSeasonId_cropId_fkey`
    FOREIGN KEY (`cropSeasonId`, `cropId`) REFERENCES `CropSeason`(`id`, `cropId`)
    ON DELETE CASCADE ON UPDATE CASCADE;
