-- Phase 1 additive location and crop recommendation foundation.
-- Existing application tables and records are left in place.
CREATE TABLE `State` (
    `id` VARCHAR(191) NOT NULL,
    `lgdCode` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isUnionTerritory` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `source` VARCHAR(191) NULL,
    `sourceDate` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `State_lgdCode_key`(`lgdCode`),
    INDEX `State_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `District` (
    `id` VARCHAR(191) NOT NULL,
    `lgdCode` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `stateId` VARCHAR(191) NOT NULL,
    `latitude` DECIMAL(9, 6) NULL,
    `longitude` DECIMAL(9, 6) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `source` VARCHAR(191) NULL,
    `sourceDate` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `District_lgdCode_key`(`lgdCode`),
    UNIQUE INDEX `District_stateId_name_key`(`stateId`, `name`),
    INDEX `District_stateId_isActive_idx`(`stateId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CropSeason` (
    `id` VARCHAR(191) NOT NULL,
    `cropId` VARCHAR(191) NOT NULL,
    `season` ENUM('KHARIF', 'RABI', 'ZAID') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `CropSeason_cropId_season_key`(`cropId`, `season`),
    UNIQUE INDEX `CropSeason_id_cropId_key`(`id`, `cropId`),
    INDEX `CropSeason_season_idx`(`season`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CropSoilRequirement` (
    `id` VARCHAR(191) NOT NULL,
    `cropId` VARCHAR(191) NOT NULL,
    `soilType` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `CropSoilRequirement_cropId_soilType_key`(`cropId`, `soilType`),
    INDEX `CropSoilRequirement_soilType_idx`(`soilType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CropClimateRequirement` (
    `id` VARCHAR(191) NOT NULL,
    `cropId` VARCHAR(191) NOT NULL,
    `minTemperatureC` DECIMAL(5, 2) NULL,
    `maxTemperatureC` DECIMAL(5, 2) NULL,
    `minRainfallMm` DECIMAL(8, 2) NULL,
    `maxRainfallMm` DECIMAL(8, 2) NULL,
    `cropDurationDays` INTEGER NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `CropClimateRequirement_cropId_key`(`cropId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CropWaterStage` (
    `id` VARCHAR(191) NOT NULL,
    `cropId` VARCHAR(191) NOT NULL,
    `stageName` VARCHAR(191) NOT NULL,
    `startDay` INTEGER NULL,
    `endDay` INTEGER NULL,
    `waterRequirementMm` DECIMAL(8, 2) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `CropWaterStage_cropId_stageName_key`(`cropId`, `stageName`),
    INDEX `CropWaterStage_cropId_startDay_idx`(`cropId`, `startDay`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CropDistrictSuitability` (
    `id` VARCHAR(191) NOT NULL,
    `cropId` VARCHAR(191) NOT NULL,
    `districtId` VARCHAR(191) NOT NULL,
    `cropSeasonId` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `CropDistrictSuitability_cropId_districtId_cropSeasonId_key`(`cropId`, `districtId`, `cropSeasonId`),
    INDEX `CropDistrictSuitability_districtId_cropSeasonId_idx`(`districtId`, `cropSeasonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CropRecommendation` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `districtId` VARCHAR(191) NULL,
    `season` ENUM('KHARIF', 'RABI', 'ZAID') NOT NULL,
    `weatherSnapshot` JSON NULL,
    `explanation` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `CropRecommendation_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `CropRecommendation_districtId_season_idx`(`districtId`, `season`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CropRecommendationItem` (
    `id` VARCHAR(191) NOT NULL,
    `recommendationId` VARCHAR(191) NOT NULL,
    `cropId` VARCHAR(191) NOT NULL,
    `cropSeasonId` VARCHAR(191) NOT NULL,
    `rank` INTEGER NOT NULL,
    `explanation` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `CropRecommendationItem_recommendationId_rank_key`(`recommendationId`, `rank`),
    INDEX `CropRecommendationItem_cropId_cropSeasonId_idx`(`cropId`, `cropSeasonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `District` ADD CONSTRAINT `District_stateId_fkey` FOREIGN KEY (`stateId`) REFERENCES `State`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CropSeason` ADD CONSTRAINT `CropSeason_cropId_fkey` FOREIGN KEY (`cropId`) REFERENCES `Crop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CropSoilRequirement` ADD CONSTRAINT `CropSoilRequirement_cropId_fkey` FOREIGN KEY (`cropId`) REFERENCES `Crop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CropClimateRequirement` ADD CONSTRAINT `CropClimateRequirement_cropId_fkey` FOREIGN KEY (`cropId`) REFERENCES `Crop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CropWaterStage` ADD CONSTRAINT `CropWaterStage_cropId_fkey` FOREIGN KEY (`cropId`) REFERENCES `Crop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CropDistrictSuitability` ADD CONSTRAINT `CropDistrictSuitability_cropId_fkey` FOREIGN KEY (`cropId`) REFERENCES `Crop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CropDistrictSuitability` ADD CONSTRAINT `CropDistrictSuitability_districtId_fkey` FOREIGN KEY (`districtId`) REFERENCES `District`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CropDistrictSuitability` ADD CONSTRAINT `CropDistrictSuitability_cropSeasonId_cropId_fkey` FOREIGN KEY (`cropSeasonId`, `cropId`) REFERENCES `CropSeason`(`id`, `cropId`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CropRecommendation` ADD CONSTRAINT `CropRecommendation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CropRecommendation` ADD CONSTRAINT `CropRecommendation_districtId_fkey` FOREIGN KEY (`districtId`) REFERENCES `District`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `CropRecommendationItem` ADD CONSTRAINT `CropRecommendationItem_recommendationId_fkey` FOREIGN KEY (`recommendationId`) REFERENCES `CropRecommendation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CropRecommendationItem` ADD CONSTRAINT `CropRecommendationItem_cropId_fkey` FOREIGN KEY (`cropId`) REFERENCES `Crop`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CropRecommendationItem` ADD CONSTRAINT `CropRecommendationItem_cropSeasonId_cropId_fkey` FOREIGN KEY (`cropSeasonId`, `cropId`) REFERENCES `CropSeason`(`id`, `cropId`) ON DELETE RESTRICT ON UPDATE CASCADE;
