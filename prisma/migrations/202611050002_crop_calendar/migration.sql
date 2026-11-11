CREATE TABLE `CropCalendarEvent` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `cropCycleId` VARCHAR(191) NULL,
  `title` VARCHAR(120) NOT NULL,
  `eventDate` DATE NOT NULL,
  `notes` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `CropCalendarEvent_userId_eventDate_idx` (`userId`, `eventDate`),
  INDEX `CropCalendarEvent_cropCycleId_idx` (`cropCycleId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CropCalendarEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CropCalendarEvent_cropCycleId_fkey` FOREIGN KEY (`cropCycleId`) REFERENCES `CropCycle` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
