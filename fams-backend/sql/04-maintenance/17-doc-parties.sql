-- =============================================================
-- 派发单「实际领用人」+ 借出单「借用人 / 借用部门 / 用途」（2026-11-11）
--
-- 业务裁决：
-- - 派发（WF2）台账使用人必须取实际领用人 receiverId，不再用单据创建人（资产管理员）兜底；
-- - 借出（WF4）要能回答「借给谁、哪个部门、什么用途」，但台账 userId / deptId
--   仍保持原责任人不变（BORROW 分支只改资产状态）；归还维持现状回 IDLE、清空 userId。
--
-- 契约字段由前端 schema.js 导出，RowCodec 只保留契约声明的列，
-- 因此本 DDL 必须与 resources.json 同时生效。
--
-- 用法：mysql --default-character-set=utf8mb4 -h 127.0.0.1 -u root -p fams < 17-doc-parties.sql
-- 幂等：逐列检查 information_schema，列已存在则跳过
-- =============================================================

USE `fams`;

SET @tbl := 'fixed_asset_doc_lists_alloc';
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'receiver_id');
SET @ddl := IF(@col = 0, 'ALTER TABLE `fixed_asset_doc_lists_alloc` ADD COLUMN `receiver_id` VARCHAR(255) NULL COMMENT ''→org-users 实际领用人，派发完结回写台账 userId'' AFTER `dept_id`', 'SELECT ''receiver_id already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @tbl := 'fixed_asset_doc_lists_borrow';
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'borrower_id');
SET @ddl := IF(@col = 0, 'ALTER TABLE `fixed_asset_doc_lists_borrow` ADD COLUMN `borrower_id` VARCHAR(255) NULL COMMENT ''→org-users 借用人'' AFTER `creator_id`', 'SELECT ''borrower_id already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'borrower_dept_id');
SET @ddl := IF(@col = 0, 'ALTER TABLE `fixed_asset_doc_lists_borrow` ADD COLUMN `borrower_dept_id` VARCHAR(255) NULL COMMENT ''→org-departments 借用部门'' AFTER `borrower_id`', 'SELECT ''borrower_dept_id already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'borrow_purpose');
SET @ddl := IF(@col = 0, 'ALTER TABLE `fixed_asset_doc_lists_borrow` ADD COLUMN `borrow_purpose` VARCHAR(255) NULL COMMENT ''借用用途'' AFTER `borrower_dept_id`', 'SELECT ''borrow_purpose already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND ((TABLE_NAME = 'fixed_asset_doc_lists_alloc' AND COLUMN_NAME = 'receiver_id')
    OR (TABLE_NAME = 'fixed_asset_doc_lists_borrow' AND COLUMN_NAME IN ('borrower_id','borrower_dept_id','borrow_purpose')))
ORDER BY TABLE_NAME, ORDINAL_POSITION;
