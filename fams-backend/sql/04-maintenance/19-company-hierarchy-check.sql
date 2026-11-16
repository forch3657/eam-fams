-- =============================================================
-- D1 公司层级复核与索引（2026-11-16）：幂等、只做加法
--
-- 背景：集团 → 二级研究院 → 三家三级子公司的架构已由管理员在「公司管理」建立，
-- 但 parent_id 此前不参与任何权限判定。D1 的 CompanyScopeResolver 按 parent_id
-- 递归展开可见公司集合，因此这里先复核层级数据质量并补索引。
--
-- 说明：path/level 物化列不在本脚本新增——契约字段需由
-- fams-frontend/src/services/contract/schema.js 导出，避免制造 schema 漂移（S-10）；
-- 该优化随 D2 契约扩字段一并落地，当前递归展开功能等价。
--
-- 用法：mysql -h 127.0.0.1 -u root -p fams < 19-company-hierarchy-check.sql
-- 执行前：mysqldump --single-transaction fams > db-baseline/backup-before-d1.sql
-- =============================================================

USE `fams`;

-- -------------------------------------------------------------
-- 1. 索引（DDL 幂等）
-- -------------------------------------------------------------
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_companies' AND INDEX_NAME = 'idx_org_companies_parent');
SET @ddl := IF(@idx = 0,
  'ALTER TABLE `org_companies` ADD INDEX `idx_org_companies_parent` (`parent_id`)',
  'SELECT ''org_companies.idx_org_companies_parent already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -------------------------------------------------------------
-- 2. 只读复核：公司层级、孤儿引用、层级深度
-- -------------------------------------------------------------
-- 2.1 全部公司及其层级路径（上限 6 层，防环）
WITH RECURSIVE company_tree AS (
  SELECT id, code, name, parent_id, 1 AS lvl, CAST(name AS CHAR(1000)) AS path
  FROM org_companies WHERE parent_id IS NULL OR parent_id = ''
  UNION ALL
  SELECT c.id, c.code, c.name, c.parent_id, t.lvl + 1, CONCAT(t.path, ' / ', c.name)
  FROM org_companies c JOIN company_tree t ON c.parent_id = t.id
  WHERE t.lvl < 6
)
SELECT id, code, name, parent_id, lvl, path FROM company_tree ORDER BY path;

-- 2.2 孤儿公司：parent_id 指向不存在的公司（应为 0 行）
SELECT c.id, c.code, c.name, c.parent_id AS missing_parent
FROM org_companies c
LEFT JOIN org_companies p ON p.id = c.parent_id
WHERE c.parent_id IS NOT NULL AND c.parent_id <> '' AND p.id IS NULL;

-- 2.3 自身引用（应为 0 行）
SELECT id, code, name FROM org_companies WHERE parent_id = id;

-- 2.4 根节点数量（集团化后应为 1 行）
SELECT COUNT(*) AS root_count FROM org_companies WHERE parent_id IS NULL OR parent_id = '';

-- 2.5 存量业务数据归属核对（company_id 为空或指向不存在公司，应为 0 行）
SELECT 'fixed_assets' AS tbl, COUNT(*) AS bad_rows FROM fixed_assets a
  LEFT JOIN org_companies c ON c.id = a.company_id
  WHERE a.company_id IS NOT NULL AND a.company_id <> '' AND c.id IS NULL
UNION ALL
SELECT 'org_departments', COUNT(*) FROM org_departments d
  LEFT JOIN org_companies c ON c.id = d.company_id
  WHERE d.company_id IS NOT NULL AND d.company_id <> '' AND c.id IS NULL
UNION ALL
SELECT 'org_users', COUNT(*) FROM org_users u
  LEFT JOIN org_companies c ON c.id = u.company_id
  WHERE u.company_id IS NOT NULL AND u.company_id <> '' AND c.id IS NULL;
