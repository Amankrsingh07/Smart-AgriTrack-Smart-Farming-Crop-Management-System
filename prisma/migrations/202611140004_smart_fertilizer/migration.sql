-- CreateTable
CREATE TABLE `FertilizerReference` (
    `id` VARCHAR(191) NOT NULL,
    `metadata` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FertilizerPlan` (
    `id` VARCHAR(191) NOT NULL,
    `cropCycleId` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NOT NULL,
    `input` JSON NOT NULL,
    `result` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FertilizerPlan_cropCycleId_createdAt_idx`(`cropCycleId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FertilizerProduct` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `composition` JSON NOT NULL,
    `source` VARCHAR(500) NOT NULL,
    `organic` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FertilizerProduct_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FertilizerPrice` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `price` DECIMAL(12, 2) NOT NULL,
    `bagKg` DECIMAL(10, 3) NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FertilizerPrice_productId_recordedAt_idx`(`productId`, `recordedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FertilizerApplication` (
    `id` VARCHAR(191) NOT NULL,
    `cropCycleId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NULL,
    `requestKey` VARCHAR(191) NOT NULL,
    `slot` VARCHAR(191) NULL,
    `product` VARCHAR(100) NOT NULL,
    `quantityKg` DECIMAL(12, 3) NOT NULL,
    `composition` JSON NOT NULL,
    `scheduledDate` DATE NOT NULL,
    `appliedDate` DATE NULL,
    `offsetDays` INTEGER NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PLANNED',
    `method` VARCHAR(120) NULL,
    `cost` DECIMAL(12, 2) NULL,
    `expenseId` VARCHAR(191) NULL,
    `notes` VARCHAR(1000) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `revisions` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FertilizerApplication_requestKey_key`(`requestKey`),
    UNIQUE INDEX `FertilizerApplication_slot_key`(`slot`),
    UNIQUE INDEX `FertilizerApplication_expenseId_key`(`expenseId`),
    INDEX `FertilizerApplication_cropCycleId_status_scheduledDate_idx`(`cropCycleId`, `status`, `scheduledDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FertilizerAnalysis` (
    `id` VARCHAR(191) NOT NULL,
    `cropCycleId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `metadata` JSON NOT NULL,
    `image` LONGBLOB NULL,
    `mediaType` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FertilizerAnalysis_cropCycleId_createdAt_idx`(`cropCycleId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FertilizerPlan` ADD CONSTRAINT `FertilizerPlan_cropCycleId_fkey` FOREIGN KEY (`cropCycleId`) REFERENCES `CropCycle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertilizerPlan` ADD CONSTRAINT `FertilizerPlan_referenceId_fkey` FOREIGN KEY (`referenceId`) REFERENCES `FertilizerReference`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertilizerProduct` ADD CONSTRAINT `FertilizerProduct_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertilizerPrice` ADD CONSTRAINT `FertilizerPrice_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `FertilizerProduct`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertilizerApplication` ADD CONSTRAINT `FertilizerApplication_cropCycleId_fkey` FOREIGN KEY (`cropCycleId`) REFERENCES `CropCycle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertilizerApplication` ADD CONSTRAINT `FertilizerApplication_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `FertilizerPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertilizerApplication` ADD CONSTRAINT `FertilizerApplication_expenseId_fkey` FOREIGN KEY (`expenseId`) REFERENCES `Expense`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FertilizerAnalysis` ADD CONSTRAINT `FertilizerAnalysis_cropCycleId_fkey` FOREIGN KEY (`cropCycleId`) REFERENCES `CropCycle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

