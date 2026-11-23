CREATE TABLE `StorageInspection` (
    `productionId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `inspectedOn` DATE NOT NULL,
    `findings` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`productionId`, `version`),
    CONSTRAINT `StorageInspection_productionId_fkey`
        FOREIGN KEY (`productionId`) REFERENCES `Production`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Alert`
    ADD COLUMN `completedAt` DATETIME(3) NULL,
    ADD COLUMN `cropName` VARCHAR(191) NULL,
    ADD COLUMN `productionId` VARCHAR(191) NULL,
    ADD COLUMN `dueOn` DATE NULL,
    ADD COLUMN `priority` VARCHAR(191) NULL,
    ADD COLUMN `actionId` VARCHAR(191) NULL;
