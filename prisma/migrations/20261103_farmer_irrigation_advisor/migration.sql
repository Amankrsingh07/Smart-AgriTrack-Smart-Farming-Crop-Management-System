ALTER TABLE `IrrigationSchedule`
  ADD COLUMN `soilMoistureStatus` VARCHAR(12) NULL,
  ADD COLUMN `soilMoistureSource` VARCHAR(24) NULL,
  ADD COLUMN `advisoryStatus` VARCHAR(24) NULL,
  ADD COLUMN `isCheckOnly` BOOLEAN NOT NULL DEFAULT false;
