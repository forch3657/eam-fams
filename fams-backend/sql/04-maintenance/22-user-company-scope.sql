-- =============================================================
-- D2 用户授权公司集合与组织层级物化（2026-11-16）：只加列，不改现有数据主键
--
-- 1) org_users.scope_company_ids：显式授权可访问的其它公司（JSON 数组文本），
--    CompanyScopeResolver 在主体构建时并入可见公司集合。
-- 2) org_companies.path / level：层级路径与层级号，用于展示与缓存加速；
--    鉴权仍以 parent_id 逐级展开为准（见 CompanyScopeResolver）。
-- 幂等：information_schema 判列后才 ADD，重复执行无副作用。
--
-- 用法：mysql -h 127.0.0.1 -u root fams < 22-user-company-scope.sql
-- 执行前：mysqldump --single-transaction fams > db-baseline/backup-before-d2.sql
-- =============================================================

USE `fams`;

-- org_users.scope_company_ids
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='fams' AND TABLE_NAME='org_users' AND COLUMN_NAME='scope_company_ids');
SET @sql = IF(@col=0,
  'ALTER TABLE `org_users` ADD COLUMN `scope_company_ids` TEXT COMMENT ''D2 显式授权公司 JSON 数组'' AFTER `dept_id`',
  'SELECT ''skip: org_users.scope_company_ids exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- org_companies.path
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='fams' AND TABLE_NAME='org_companies' AND COLUMN_NAME='path');
SET @sql = IF(@col=0,
  'ALTER TABLE `org_companies` ADD COLUMN `path` VARCHAR(1024) COMMENT ''D2 层级路径'' AFTER `parent_id`',
  'SELECT ''skip: org_companies.path exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- org_companies.level
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='fams' AND TABLE_NAME='org_companies' AND COLUMN_NAME='level');
SET @sql = IF(@col=0,
  'ALTER TABLE `org_companies` ADD COLUMN `level` INT DEFAULT 1 COMMENT ''D2 层级号'' AFTER `path`',
  'SELECT ''skip: org_companies.level exists'' AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回填存量公司 path/level：按 parent_id 逐级拼接（三级组织，最多 10 层保护）
UPDATE `org_companies` c
LEFT JOIN `org_companies` p ON c.`parent_id` = p.`id`
LEFT JOIN `org_companies` g ON p.`parent_id` = g.`id`
SET c.`level` = CASE WHEN g.`id` IS NOT NULL THEN 3 WHEN p.`id` IS NOT NULL THEN 2 ELSE 1 END,
    c.`path` = CONCAT('/',
      COALESCE(CONCAT(g.`id`, '/'), ''),
      COALESCE(CONCAT(p.`id`, '/'), ''),
      c.`id`)
WHERE c.`path` IS NULL OR TRIM(c.`path`) = '';

-- 复核
SELECT `id`, `name`, `parent_id`, `path`, `level` FROM `org_companies` ORDER BY `level`, `code`;
SELECT COUNT(*) AS users_with_scope FROM `org_users`
  WHERE `scope_company_ids` IS NOT NULL AND TRIM(`scope_company_ids`) <> '';
