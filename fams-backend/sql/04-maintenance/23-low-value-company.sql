-- =============================================================
-- D2 低值资产按公司隔离（2026-11-16）：物品台账与三类单据加 company_id
--
-- 1) low_value_items.company_id：物品归属公司；库存按公司独立，避免 A 公司领用扣 B 公司库存。
-- 2) low_value_inbound / requisition / return .company_id：单据归属公司。
-- 回填口径：优先取单据 dept_id 对应部门的 company_id；取不到则按创建人公司；
--   物品台账无部门列，统一回填到集团主公司（研究院），由管理员按需调整。
-- 幂等：information_schema 判列后才 ADD。
--
-- 用法：mysql -h 127.0.0.1 -u root fams < 23-low-value-company.sql
-- 执行前：mysqldump --single-transaction fams > db-baseline/backup-before-d2.sql
-- =============================================================

USE `fams`;

-- low_value_items.company_id
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='fams' AND TABLE_NAME='low_value_items' AND COLUMN_NAME='company_id');
SET @sql = IF(@col=0,
  'ALTER TABLE `low_value_items` ADD COLUMN `company_id` VARCHAR(64) COMMENT ''D2 归属公司'' AFTER `code`',
  'SELECT ''skip: low_value_items.company_id exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 三类低值单据 company_id
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='fams' AND TABLE_NAME='low_value_inbound' AND COLUMN_NAME='company_id');
SET @sql = IF(@col=0,
  'ALTER TABLE `low_value_inbound` ADD COLUMN `company_id` VARCHAR(64) COMMENT ''D2 归属公司'' AFTER `doc_no`',
  'SELECT ''skip: low_value_inbound.company_id exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='fams' AND TABLE_NAME='low_value_requisition' AND COLUMN_NAME='company_id');
SET @sql = IF(@col=0,
  'ALTER TABLE `low_value_requisition` ADD COLUMN `company_id` VARCHAR(64) COMMENT ''D2 归属公司'' AFTER `doc_no`',
  'SELECT ''skip: low_value_requisition.company_id exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='fams' AND TABLE_NAME='low_value_return' AND COLUMN_NAME='company_id');
SET @sql = IF(@col=0,
  'ALTER TABLE `low_value_return` ADD COLUMN `company_id` VARCHAR(64) COMMENT ''D2 归属公司'' AFTER `doc_no`',
  'SELECT ''skip: low_value_return.company_id exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 物品台账回填：集团主公司（研究院）。存量仅演示数据，管理员可按实际归属调整。
UPDATE `low_value_items`
SET `company_id` = 'mvsv021s37'
WHERE `company_id` IS NULL OR TRIM(`company_id`) = '';

-- 单据回填：部门 → 公司；部门查不到则创建人公司；再兜底研究院
UPDATE `low_value_requisition` d
LEFT JOIN `org_departments` dep ON d.`dept_id` = dep.`id`
LEFT JOIN `org_users` u ON d.`creator_id` = u.`id`
SET d.`company_id` = COALESCE(
  NULLIF(dep.`company_id`, ''),
  NULLIF(u.`company_id`, ''),
  'mvsv021s37')
WHERE d.`company_id` IS NULL OR TRIM(d.`company_id`) = '';

UPDATE `low_value_inbound` d
LEFT JOIN `org_departments` dep ON d.`dept_id` = dep.`id`
LEFT JOIN `org_users` u ON d.`creator_id` = u.`id`
SET d.`company_id` = COALESCE(NULLIF(dep.`company_id`, ''), NULLIF(u.`company_id`, ''), 'mvsv021s37')
WHERE d.`company_id` IS NULL OR TRIM(d.`company_id`) = '';

UPDATE `low_value_return` d
LEFT JOIN `org_departments` dep ON d.`dept_id` = dep.`id`
LEFT JOIN `org_users` u ON d.`creator_id` = u.`id`
SET d.`company_id` = COALESCE(NULLIF(dep.`company_id`, ''), NULLIF(u.`company_id`, ''), 'mvsv021s37')
WHERE d.`company_id` IS NULL OR TRIM(d.`company_id`) = '';

-- 复核：不应再有空归属
SELECT 'low_value_items' AS tbl, COUNT(*) AS missing FROM `low_value_items`
  WHERE `company_id` IS NULL OR TRIM(`company_id`)=''
UNION ALL SELECT 'low_value_inbound', COUNT(*) FROM `low_value_inbound`
  WHERE `company_id` IS NULL OR TRIM(`company_id`)=''
UNION ALL SELECT 'low_value_requisition', COUNT(*) FROM `low_value_requisition`
  WHERE `company_id` IS NULL OR TRIM(`company_id`)=''
UNION ALL SELECT 'low_value_return', COUNT(*) FROM `low_value_return`
  WHERE `company_id` IS NULL OR TRIM(`company_id`)='';
