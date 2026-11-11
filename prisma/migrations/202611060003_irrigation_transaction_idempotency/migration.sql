-- Add a stable client transaction key for retry-safe completed watering submissions.
-- Existing irrigation rows remain unchanged; MySQL permits multiple NULL values in a unique index.
ALTER TABLE `IrrigationSchedule`
  ADD COLUMN `clientTransactionId` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `IrrigationSchedule_clientTransactionId_key` (`clientTransactionId`);
