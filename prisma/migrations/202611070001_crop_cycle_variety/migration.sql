ALTER TABLE `CropCycle`
  ADD COLUMN `cropVariety` VARCHAR(120) NULL;

UPDATE `CropCycle` AS cycle
INNER JOIN `CropCalendar` AS calendar ON calendar.`cropCycleId` = cycle.`id`
SET cycle.`cropVariety` = calendar.`cropVariety`
WHERE cycle.`cropVariety` IS NULL AND calendar.`cropVariety` IS NOT NULL;
