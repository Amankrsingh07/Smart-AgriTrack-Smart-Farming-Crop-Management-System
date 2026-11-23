ALTER TABLE `CropCycle`
  ADD COLUMN `expectedHarvestQuantity` DECIMAL(12, 3) NULL,
  ADD COLUMN `expectedHarvestUnit` VARCHAR(24) NULL;
