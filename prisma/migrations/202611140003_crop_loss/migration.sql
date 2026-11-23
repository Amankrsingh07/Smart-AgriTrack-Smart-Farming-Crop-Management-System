-- Additive: source production, sales, crop cycles and reports remain unchanged.
CREATE TABLE `CropLossAssessment` (
 `id` VARCHAR(191) NOT NULL, `productionId` VARCHAR(191) NOT NULL,
 `assessedDate` DATE NOT NULL,
 `marketable` DECIMAL(12,3) NOT NULL, `damaged` DECIMAL(12,3) NOT NULL, `wasted` DECIMAL(12,3) NOT NULL,
 `unit` VARCHAR(24) NOT NULL, `harvestedSnapshot` DECIMAL(12,3) NOT NULL,
 `quantitiesConfirmed` BOOLEAN NOT NULL DEFAULT false, `evidence` VARCHAR(500) NOT NULL,
 `pricePerUnit` DECIMAL(12,2) NULL, `damagedRecovery` DECIMAL(14,2) NULL,
 `priceEvidence` VARCHAR(500) NULL, `priceConfirmed` BOOLEAN NOT NULL DEFAULT false,
 `cause` VARCHAR(80) NOT NULL, `notes` TEXT NULL,
 `version` INTEGER NOT NULL DEFAULT 1, `revisions` JSON NOT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`), UNIQUE INDEX `CropLossAssessment_productionId_key` (`productionId`),
 INDEX `CropLossAssessment_assessedDate_idx` (`assessedDate`),
 CONSTRAINT `CropLossAssessment_productionId_fkey` FOREIGN KEY (`productionId`) REFERENCES `Production` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
