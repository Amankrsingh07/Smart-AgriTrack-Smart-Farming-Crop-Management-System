-- Additive only. Existing reports and input/result snapshots are untouched.
CREATE TABLE `SoilReportAttachment` (
 `id` VARCHAR(191) NOT NULL,
 `reportId` VARCHAR(191) NOT NULL,
 `filename` VARCHAR(200) NOT NULL,
 `mediaType` VARCHAR(40) NOT NULL,
 `size` INTEGER NOT NULL,
 `sha256` CHAR(64) NOT NULL,
 `content` LONGBLOB NOT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`),
 INDEX `SoilReportAttachment_reportId_createdAt_idx` (`reportId`, `createdAt`),
 CONSTRAINT `SoilReportAttachment_reportId_fkey` FOREIGN KEY (`reportId`)
 REFERENCES `FertilizerRecommendationHistory` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
