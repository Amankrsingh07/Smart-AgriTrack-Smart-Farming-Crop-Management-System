ALTER TABLE `CropCycle` ADD COLUMN `cropDurationDays` INTEGER NULL;
ALTER TABLE `CropCycle` ADD COLUMN `growthStageUpdatedAt` DATETIME(3) NULL;
ALTER TABLE `Production` ADD COLUMN `storageDetails` TEXT NULL;
ALTER TABLE `Production` ADD COLUMN `yieldPerAcre` DECIMAL(12, 3) NULL;

CREATE TABLE `HarvestNotification` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `cropCycleId` VARCHAR(191) NOT NULL,
  `expectedDate` DATE NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `message` TEXT NOT NULL,
  `weatherWarning` TEXT NULL,
  `href` VARCHAR(191) NOT NULL,
  `readAt` DATETIME(3) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `firstSentAt` DATETIME(3) NULL,
  `lastSentAt` DATETIME(3) NULL,
  `nextReminderAt` DATETIME(3) NOT NULL,
  `snoozedUntil` DATETIME(3) NULL,
  `reminderCount` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `HarvestNotification_userId_readAt_nextReminderAt_idx` (`userId`, `readAt`, `nextReminderAt`),
  INDEX `HarvestNotification_status_nextReminderAt_idx` (`status`, `nextReminderAt`),
  UNIQUE INDEX `HarvestNotification_cropCycleId_key` (`cropCycleId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `HarvestNotification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `HarvestNotification_cropCycleId_fkey` FOREIGN KEY (`cropCycleId`) REFERENCES `CropCycle` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `HarvestReminderSettings` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `reminderIntervalHours` INTEGER NOT NULL DEFAULT 24,
  `pushEnabled` BOOLEAN NOT NULL DEFAULT true,
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `HarvestReminderSettings_userId_key` (`userId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `HarvestReminderSettings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PushSubscription` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `endpoint` VARCHAR(512) NOT NULL,
  `p256dh` VARCHAR(191) NOT NULL,
  `auth` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PushSubscription_userId_endpoint_key` (`userId`, `endpoint`),
  INDEX `PushSubscription_userId_idx` (`userId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `PushSubscription_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
