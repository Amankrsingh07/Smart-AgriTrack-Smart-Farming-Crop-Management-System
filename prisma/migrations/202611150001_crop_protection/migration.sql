-- CreateTable
CREATE TABLE `CropProtectionAssessment` (
    `assignedExpertId` VARCHAR(191) NULL,
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `cropCycleId` VARCHAR(191) NULL,
    `cropName` VARCHAR(120) NOT NULL,
    `input` JSON NOT NULL,
    `findings` JSON NOT NULL,
    `recoveryStatus` VARCHAR(40) NOT NULL DEFAULT 'Expert review required',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CropProtectionAssessment_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CropProtectionPhoto` (
    `id` VARCHAR(191) NOT NULL,
    `assessmentId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `mediaType` VARCHAR(30) NOT NULL,
    `bytes` LONGBLOB NOT NULL,

    INDEX `CropProtectionPhoto_assessmentId_idx`(`assessmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CropProtectionFollowup` (
    `id` VARCHAR(191) NOT NULL,
    `assessmentId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(40) NOT NULL,
    `notes` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CropProtectionFollowup_assessmentId_createdAt_idx`(`assessmentId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CropProtectionExpertGrant` (
    `userId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(40) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CropProtectionReview` (
    `id` VARCHAR(191) NOT NULL,
    `assessmentId` VARCHAR(191) NOT NULL,
    `reviewerId` VARCHAR(191) NOT NULL,
    `reviewerName` VARCHAR(191) NOT NULL,
    `observations` TEXT NOT NULL,
    `suspectedCause` VARCHAR(500) NOT NULL,
    `verificationStatus` VARCHAR(60) NOT NULL,
    `laboratoryEvidence` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CropProtectionReview_assessmentId_createdAt_idx`(`assessmentId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CropProtectionAssessment` ADD CONSTRAINT `CropProtectionAssessment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CropProtectionAssessment` ADD CONSTRAINT `CropProtectionAssessment_cropCycleId_fkey` FOREIGN KEY (`cropCycleId`) REFERENCES `CropCycle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CropProtectionPhoto` ADD CONSTRAINT `CropProtectionPhoto_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `CropProtectionAssessment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CropProtectionFollowup` ADD CONSTRAINT `CropProtectionFollowup_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `CropProtectionAssessment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CropProtectionExpertGrant` ADD CONSTRAINT `CropProtectionExpertGrant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CropProtectionReview` ADD CONSTRAINT `CropProtectionReview_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `CropProtectionAssessment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

