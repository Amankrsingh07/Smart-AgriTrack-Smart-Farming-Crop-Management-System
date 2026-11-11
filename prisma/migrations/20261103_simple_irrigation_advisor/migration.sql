-- Store the last watering date for the rule-based advisor. Existing schedules
-- remain unchanged and can be backfilled by farmers when they next use the form.
ALTER TABLE `IrrigationSchedule`
  ADD COLUMN `lastWateredAt` DATE NULL;
