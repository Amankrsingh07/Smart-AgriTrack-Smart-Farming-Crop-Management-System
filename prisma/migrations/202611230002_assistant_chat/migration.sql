CREATE TABLE `AssistantConversation` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `cropCycleId` VARCHAR(191) NULL,
  `title` VARCHAR(180) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `AssistantConversation_userId_updatedAt_idx` (`userId`, `updatedAt`),
  INDEX `AssistantConversation_cropCycleId_idx` (`cropCycleId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `AssistantConversation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AssistantConversation_cropCycleId_fkey` FOREIGN KEY (`cropCycleId`) REFERENCES `CropCycle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AssistantMessage` (
  `id` VARCHAR(191) NOT NULL,
  `conversationId` VARCHAR(191) NOT NULL,
  `sequence` INTEGER NOT NULL,
  `requestId` VARCHAR(80) NULL,
  `role` VARCHAR(12) NOT NULL,
  `content` TEXT NOT NULL,
  `mode` VARCHAR(12) NULL,
  `advice` JSON NULL,
  `sources` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AssistantMessage_conversationId_sequence_idx` (`conversationId`, `sequence`),
  UNIQUE INDEX `AssistantMessage_conversationId_sequence_key` (`conversationId`, `sequence`),
  UNIQUE INDEX `AssistantMessage_conversationId_requestId_key` (`conversationId`, `requestId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `AssistantMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `AssistantConversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
