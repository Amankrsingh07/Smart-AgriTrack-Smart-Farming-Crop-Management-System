-- Rows created without explicit provenance are estimates by default.
-- Existing CropWaterStage records and values are intentionally preserved.
ALTER TABLE `CropWaterStage`
  ALTER `dataStatus` SET DEFAULT 'ESTIMATED';
