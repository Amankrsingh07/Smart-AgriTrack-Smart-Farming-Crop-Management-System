CREATE TABLE `StorageInspectionAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `productionId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `mediaType` VARCHAR(191) NOT NULL,
    `content` MEDIUMBLOB NOT NULL,
    INDEX `StorageInspectionAttachment_productionId_version_idx` (`productionId`, `version`),
    PRIMARY KEY (`id`),
    CONSTRAINT `StorageInspectionAttachment_productionId_version_fkey`
      FOREIGN KEY (`productionId`, `version`) REFERENCES `StorageInspection` (`productionId`, `version`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
