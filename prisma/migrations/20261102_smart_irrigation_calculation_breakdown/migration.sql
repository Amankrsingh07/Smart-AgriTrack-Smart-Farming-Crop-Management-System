ALTER TABLE `IrrigationSchedule`
  ADD COLUMN `netQuantityLiters` DECIMAL(14,2) NULL,
  ADD COLUMN `areaSquareMeters` DECIMAL(12,2) NULL,
  ADD COLUMN `areaAcres` DECIMAL(10,4) NULL,
  ADD COLUMN `netIrrigationDepthMm` DECIMAL(8,2) NULL,
  ADD COLUMN `systemFlowRateLitersPerMinute` DECIMAL(12,2) NULL,
  ADD COLUMN `flowRateScope` VARCHAR(10) NULL,
  ADD COLUMN `simultaneousEmitters` INT NULL;
