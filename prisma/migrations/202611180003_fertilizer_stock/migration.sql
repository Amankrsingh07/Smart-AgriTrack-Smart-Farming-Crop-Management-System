CREATE TABLE `FertilizerStockMovement` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `requestKey` VARCHAR(64) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `deltaKg` DECIMAL(12, 3) NOT NULL,
    `occurredOn` DATE NOT NULL,
    `batchNumber` VARCHAR(80) NULL,
    `supplier` VARCHAR(120) NULL,
    `note` VARCHAR(300) NULL,
    `totalCost` DECIMAL(12, 2) NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `FertilizerStockMovement_productId_requestKey_key` (`productId`, `requestKey`),
    INDEX `FertilizerStockMovement_productId_occurredOn_idx` (`productId`, `occurredOn`),
    PRIMARY KEY (`id`),
    CONSTRAINT `FertilizerStockMovement_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `FertilizerProduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
