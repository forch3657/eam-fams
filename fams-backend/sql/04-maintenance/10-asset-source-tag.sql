-- =============================================================
-- 固定资产导入：期初状态标注列（5B）
--
-- 导入「借出中 / 维修中 / 派发中 / 处置中」时不再阻断（BUG-003 已定
-- 「期初允许无单据，状态以台账为准」），改为行级告警 + 在资产上写
-- source_tag = '期初导入'，便于上线后按这个标记筛出需要补录单据的资产。
--
-- 用法：mysql -h 127.0.0.1 -u root -p fams < 10-asset-source-tag.sql
-- 幂等：检查 information_schema，列已存在则跳过
-- =============================================================

USE `fams`;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_assets'
    AND COLUMN_NAME = 'source_tag'
);
SET @ddl := IF(@col = 0,
  'ALTER TABLE `fixed_assets` ADD COLUMN `source_tag` VARCHAR(64) NULL COMMENT ''数据来源标注，如「期初导入」'' AFTER `lease_months`',
  'SELECT ''source_tag already exists'' AS message'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'fixed_assets'
  AND COLUMN_NAME = 'source_tag';
