-- =============================================================
-- 派发单：使用部门列（2026-11-10）
--
-- 派发单新增「使用部门」，默认从领用人账号部门带出；审批完结时
-- ApprovalService.syncAssetLedger 的 patchIfPresent(doc, assetId, "deptId")
-- 把部门回写到 fixed_assets.dept_id。
-- 契约字段由前端 schema.js 导出，RowCodec 只保留契约声明的列，
-- 因此本 DDL 必须与 resources.json 同时生效。
--
-- 用法：mysql --default-character-set=utf8mb4 -h 127.0.0.1 -u root -p fams < 14-alloc-dept.sql
-- 幂等：检查 information_schema，列已存在则跳过
-- =============================================================

USE `fams`;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_asset_doc_lists_alloc'
    AND COLUMN_NAME = 'dept_id'
);
SET @ddl := IF(@col = 0,
  'ALTER TABLE `fixed_asset_doc_lists_alloc` ADD COLUMN `dept_id` VARCHAR(255) NULL COMMENT ''→org-departments 使用部门'' AFTER `creator_id`',
  'SELECT ''dept_id already exists'' AS message'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'fixed_asset_doc_lists_alloc'
  AND COLUMN_NAME = 'dept_id';
