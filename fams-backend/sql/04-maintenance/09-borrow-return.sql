-- =============================================================
-- 借出归还登记（4B）：仅 `fixed_asset_doc_lists_borrow` 增加 4 列
--
-- 8 类 `fixed-asset-doc-lists-*` 共用一套动态契约模板，借出单已改为独立静态契约，
-- 因此归还字段不能加到其它 7 张表上。
-- 历史上归还登记由 /api/approvals/action 的 action=return 完成（写归还人/时间/备注、
-- 台账 BORROWED→IN_USE）。**2026-11-09 目标口径起该动作已停用并删除**，这 4 列改由
-- WF3 归还型退库单（关联 borrowDocId）在仓管验收完结时回写，台账改为 BORROWED→IDLE
-- 且清空使用人。本脚本只保留加列 DDL，供历史库结构对齐使用；不要据此复用旧动作。
--
-- 用法：mysql -h 127.0.0.1 -u root -p fams < 09-borrow-return.sql
-- 幂等：逐列检查 information_schema，已存在则跳过，可重复执行
-- =============================================================

USE `fams`;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_asset_doc_lists_borrow'
    AND COLUMN_NAME = 'return_date'
);
SET @ddl := IF(@col = 0,
  'ALTER TABLE `fixed_asset_doc_lists_borrow` ADD COLUMN `return_date` DATETIME(3) NULL COMMENT ''归还登记时间'' AFTER `remark`',
  'SELECT ''return_date already exists'' AS message'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_asset_doc_lists_borrow'
    AND COLUMN_NAME = 'return_remark'
);
SET @ddl := IF(@col = 0,
  'ALTER TABLE `fixed_asset_doc_lists_borrow` ADD COLUMN `return_remark` VARCHAR(255) NULL COMMENT ''归还备注'' AFTER `return_date`',
  'SELECT ''return_remark already exists'' AS message'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_asset_doc_lists_borrow'
    AND COLUMN_NAME = 'return_by'
);
SET @ddl := IF(@col = 0,
  'ALTER TABLE `fixed_asset_doc_lists_borrow` ADD COLUMN `return_by` VARCHAR(255) NULL COMMENT ''归还登记人 →org-users'' AFTER `return_remark`',
  'SELECT ''return_by already exists'' AS message'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_asset_doc_lists_borrow'
    AND COLUMN_NAME = 'returned'
);
SET @ddl := IF(@col = 0,
  'ALTER TABLE `fixed_asset_doc_lists_borrow` ADD COLUMN `returned` TINYINT(1) DEFAULT 0 COMMENT ''是否已登记归还'' AFTER `return_by`',
  'SELECT ''returned already exists'' AS message'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'fixed_asset_doc_lists_borrow'
  AND COLUMN_NAME IN ('return_date', 'return_remark', 'return_by', 'returned')
ORDER BY ORDINAL_POSITION;
