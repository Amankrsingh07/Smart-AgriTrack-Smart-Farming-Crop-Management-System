ALTER TABLE `CropWaterStage`
  ADD COLUMN `publicationTitle` VARCHAR(255) NULL,
  ADD COLUMN `publicationYear` INTEGER NULL,
  ADD COLUMN `tableReference` VARCHAR(120) NULL;
