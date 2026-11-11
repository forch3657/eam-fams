-- =============================================================
-- 调拨单：目标归属 + 调出前快照（2026-11-11）
--
-- 业务裁决：调拨不跨公司（不回写 assets.company_id）；三个目标字段中
-- 「新使用人」必填，调入部门 / 新存放地点选填；保留调出前快照供审计与
-- ASSET_CURRENT_USER 审批人解析（避免审批期间资产被改导致换审批人）。
-- 目标字段用 to* 前缀，避免与 ApproverResolver.deptIdOf 的
-- 「单据 deptId 优先」冲突，否则「调出部门主管」会被解析成调入部门主管。
--
-- 契约字段由前端 schema.js 导出，RowCodec 只保留契约声明的列，
-- 因此本 DDL 必须与 resources.json 同时生效。
--
-- 用法：mysql --default-character-set=utf8mb4 -h 127.0.0.1 -u root -p fams < 15-transfer-fields.sql
-- 幂等：逐列检查 information_schema，列已存在则跳过
-- =============================================================

USE `fams`;

SET @tbl := 'fixed_asset_doc_lists_transfer';

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'to_dept_id');
SET @ddl := IF(@col = 0, 'ALTER TABLE `fixed_asset_doc_lists_transfer` ADD COLUMN `to_dept_id` VARCHAR(255) NULL COMMENT ''→org-departments 调入部门（选填）'' AFTER `creator_id`', 'SELECT ''to_dept_id already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'to_user_id');
SET @ddl := IF(@col = 0, 'ALTER TABLE `fixed_asset_doc_lists_transfer` ADD COLUMN `to_user_id` VARCHAR(255) NULL COMMENT ''→org-users 新使用人（必填）'' AFTER `to_dept_id`', 'SELECT ''to_user_id already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'to_location');
SET @ddl := IF(@col = 0, 'ALTER TABLE `fixed_asset_doc_lists_transfer` ADD COLUMN `to_location` VARCHAR(255) NULL COMMENT ''新存放地点（选填）'' AFTER `to_user_id`', 'SELECT ''to_location already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'before_dept_id');
SET @ddl := IF(@col = 0, 'ALTER TABLE `fixed_asset_doc_lists_transfer` ADD COLUMN `before_dept_id` VARCHAR(255) NULL COMMENT ''调出前部门快照'' AFTER `to_location`', 'SELECT ''before_dept_id already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'before_user_id');
SET @ddl := IF(@col = 0, 'ALTER TABLE `fixed_asset_doc_lists_transfer` ADD COLUMN `before_user_id` VARCHAR(255) NULL COMMENT ''调出前使用人快照'' AFTER `before_dept_id`', 'SELECT ''before_user_id already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'before_location');
SET @ddl := IF(@col = 0, 'ALTER TABLE `fixed_asset_doc_lists_transfer` ADD COLUMN `before_location` VARCHAR(255) NULL COMMENT ''调出前存放地点快照'' AFTER `before_user_id`', 'SELECT ''before_location already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = @tbl
  AND COLUMN_NAME IN ('to_dept_id','to_user_id','to_location','before_dept_id','before_user_id','before_location')
ORDER BY ORDINAL_POSITION;
