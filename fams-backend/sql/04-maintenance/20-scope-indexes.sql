-- =============================================================
-- D1 行级范围查询索引（2026-11-16）：幂等、只做加法
--
-- RowScopeGuard 对所有带 company_id 的集合追加 companyId IN (...) 过滤，
-- 这里为主要业务表补索引，避免公司数量增长后列表/报表退化为全表扫描。
--
-- 用法：mysql -h 127.0.0.1 -u root -p fams < 20-scope-indexes.sql
-- 执行前：mysqldump --single-transaction fams > db-baseline/backup-before-d1.sql
-- =============================================================

USE `fams`;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fixed_assets' AND INDEX_NAME = 'idx_fa_company');
SET @ddl := IF(@idx = 0, 'ALTER TABLE `fixed_assets` ADD INDEX `idx_fa_company` (`company_id`)',
  'SELECT ''fixed_assets.idx_fa_company already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fixed_asset_inventory_docs' AND INDEX_NAME = 'idx_inv_doc_company');
SET @ddl := IF(@idx = 0, 'ALTER TABLE `fixed_asset_inventory_docs` ADD INDEX `idx_inv_doc_company` (`company_id`)',
  'SELECT ''fixed_asset_inventory_docs.idx_inv_doc_company already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_departments' AND INDEX_NAME = 'idx_dept_company');
SET @ddl := IF(@idx = 0, 'ALTER TABLE `org_departments` ADD INDEX `idx_dept_company` (`company_id`)',
  'SELECT ''org_departments.idx_dept_company already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_users' AND INDEX_NAME = 'idx_user_company');
SET @ddl := IF(@idx = 0, 'ALTER TABLE `org_users` ADD INDEX `idx_user_company` (`company_id`)',
  'SELECT ''org_users.idx_user_company already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fixed_asset_settings_depreciation_plans' AND INDEX_NAME = 'idx_plan_company');
SET @ddl := IF(@idx = 0, 'ALTER TABLE `fixed_asset_settings_depreciation_plans` ADD INDEX `idx_plan_company` (`company_id`)',
  'SELECT ''fixed_asset_settings_depreciation_plans.idx_plan_company already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fixed_asset_report_depreciation_plan_details' AND INDEX_NAME = 'idx_plan_detail_company');
SET @ddl := IF(@idx = 0, 'ALTER TABLE `fixed_asset_report_depreciation_plan_details` ADD INDEX `idx_plan_detail_company` (`company_id`)',
  'SELECT ''fixed_asset_report_depreciation_plan_details.idx_plan_detail_company already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 复核：列出已建立的 company_id 索引
SELECT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME LIKE 'idx_%company%'
ORDER BY TABLE_NAME, INDEX_NAME;
