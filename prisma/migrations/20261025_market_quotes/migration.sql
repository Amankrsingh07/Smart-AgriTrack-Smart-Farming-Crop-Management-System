CREATE TABLE `MarketQuote` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `crop` VARCHAR(191) NOT NULL,
  `mandi` VARCHAR(191) NOT NULL,
  `price` DECIMAL(12,2) NOT NULL,
  `unit` VARCHAR(191) NOT NULL,
  `quoteDate` DATETIME(3) NOT NULL,
  `source` VARCHAR(191) NOT NULL DEFAULT 'Manual user entry',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `MarketQuote_userId_quoteDate_idx`(`userId`, `quoteDate`),
  PRIMARY KEY (`id`),
  CONSTRAINT `MarketQuote_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
