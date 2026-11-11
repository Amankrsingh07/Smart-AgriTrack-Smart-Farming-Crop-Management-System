CREATE TABLE `InventoryThreshold` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `cropName` VARCHAR(100) NOT NULL,
    `unit` VARCHAR(24) NOT NULL,
    `lowStock` DECIMAL(12, 3) NOT NULL,
    `highStock` DECIMAL(12, 3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `InventoryThreshold_userId_cropName_unit_key`(`userId`, `cropName`, `unit`),
    INDEX `InventoryThreshold_userId_idx`(`userId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `InventoryThreshold_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
