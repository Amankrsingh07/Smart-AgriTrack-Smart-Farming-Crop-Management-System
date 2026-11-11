-- Add farmer-recorded rainfall to soil check observations. Existing schedules are preserved.
ALTER TABLE `IrrigationSchedule`
  ADD COLUMN `observedRainfallMm` DECIMAL(8,2) NULL;
