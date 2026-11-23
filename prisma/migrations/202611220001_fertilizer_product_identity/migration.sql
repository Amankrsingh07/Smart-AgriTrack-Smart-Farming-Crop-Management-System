ALTER TABLE `FertilizerProduct`
    ADD COLUMN `manufacturer` VARCHAR(120) NULL,
    ADD COLUMN `packSizeKg` DECIMAL(10,3) NULL;
