-- Distinguish full-season total ETc profiles from individual growth-stage values.
ALTER TABLE `CropWaterStage`
    ADD COLUMN `isFullSeasonTotal` BOOLEAN NOT NULL DEFAULT false;
