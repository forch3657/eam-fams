-- =============================================================
-- D2 公司级配置与业务索引（2026-11-16）：加列 + company_id 复合索引
--
-- 1) system_params / system_workflow_flows .company_id：集团默认（空）+ 公司覆盖行。
-- 2) fixed_asset_doc_lists_dispose.transferee_company_id：跨公司转让受让公司（D3 闭环用）。
-- 3) 新归属列的查询索引，避免行级范围 IN 过滤触发全表扫描。
-- 幂等：information_schema 判列/判索引后才执行。
--
-- 用法：mysql -h 127.0.0.1 -u root fams < 24-company-scope-columns.sql
-- 执行前：mysqldump --single-transaction fams > db-baseline/backup-before-d2.sql
-- =============================================================

USE `fams`;

-- 配置集合 company_id
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='fams' AND TABLE_NAME='system_params' AND COLUMN_NAME='company_id');
SET @sql = IF(@col=0,
  'ALTER TABLE `system_params` ADD COLUMN `company_id` VARCHAR(64) COMMENT ''D2 公司覆盖，空=集团默认'' AFTER `name`',
  'SELECT ''skip: system_params.company_id exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='fams' AND TABLE_NAME='system_workflow_flows' AND COLUMN_NAME='company_id');
SET @sql = IF(@col=0,
  'ALTER TABLE `system_workflow_flows` ADD COLUMN `company_id` VARCHAR(64) COMMENT ''D2 公司覆盖，空=集团默认'' AFTER `code`',
  'SELECT ''skip: system_workflow_flows.company_id exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 处置单受让公司
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='fams' AND TABLE_NAME='fixed_asset_doc_lists_dispose' AND COLUMN_NAME='transferee_company_id');
SET @sql = IF(@col=0,
  'ALTER TABLE `fixed_asset_doc_lists_dispose` ADD COLUMN `transferee_company_id` VARCHAR(64) COMMENT ''D2 受让公司'' AFTER `buyer`',
  'SELECT ''skip: dispose.transferee_company_id exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- company_id 查询索引（幂等判索引）
SET @idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA='fams' AND TABLE_NAME='low_value_items' AND INDEX_NAME='idx_lvi_company');
SET @sql = IF(@idx=0,
  'CREATE INDEX `idx_lvi_company` ON `low_value_items` (`company_id`)',
  'SELECT ''skip: idx_lvi_company exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA='fams' AND TABLE_NAME='low_value_requisition' AND INDEX_NAME='idx_lvr_company');
SET @sql = IF(@idx=0,
  'CREATE INDEX `idx_lvr_company` ON `low_value_requisition` (`company_id`)',
  'SELECT ''skip: idx_lvr_company exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA='fams' AND TABLE_NAME='system_workflow_flows' AND INDEX_NAME='idx_swf_company');
SET @sql = IF(@idx=0,
  'CREATE INDEX `idx_swf_company` ON `system_workflow_flows` (`company_id`)',
  'SELECT ''skip: idx_swf_company exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 复核
SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA='fams' AND COLUMN_NAME IN ('company_id','scope_company_ids','path','level','transferee_company_id')
  AND TABLE_NAME IN ('org_users','org_companies','low_value_items','low_value_inbound',
    'low_value_requisition','low_value_return','system_params','system_workflow_flows',
    'fixed_asset_doc_lists_dispose')
ORDER BY TABLE_NAME, COLUMN_NAME;
