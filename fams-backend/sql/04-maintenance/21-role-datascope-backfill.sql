-- =============================================================
-- D1 存量角色数据范围显式赋值（2026-11-16）：只补空值，不覆盖已有配置
--
-- GenericService.dataScopeOf 对「角色未配 dataScope」按 ALL 兜底，
-- 集团化后空值会变成跨公司放行。这里按 README 第 6 节角色→范围映射，
-- 为角色表中 data_scope 为 NULL / 空串的行补上显式值。
-- 已配置（含管理员手工调整）的行一律不动。
--
-- 用法：mysql -h 127.0.0.1 -u root -p fams < 21-role-datascope-backfill.sql
-- 执行前：mysqldump --single-transaction fams > db-baseline/backup-before-d1.sql
-- =============================================================

USE `fams`;

UPDATE `org_roles`
SET `data_scope` = CASE
  WHEN `code` IN ('ROLE_ADMIN') THEN 'ALL'
  WHEN `code` IN ('ROLE_AUDITOR', 'ROLE_VP', 'ROLE_LEADERSHIP') THEN 'ALL'
  WHEN `code` IN ('ROLE_ASSET', 'ROLE_FINANCE', 'ROLE_WAREHOUSE') THEN 'COMPANY'
  WHEN `code` IN ('ROLE_LEADER') THEN 'DEPT'
  WHEN `code` IN ('ROLE_USER') THEN 'DEPT_ONLY'
  ELSE 'COMPANY'
END
WHERE `data_scope` IS NULL OR TRIM(`data_scope`) = '';

-- 同时为组织范围补显式值（集团化后 orgScope 参与范围判定）
UPDATE `org_roles`
SET `org_scope` = CASE
  WHEN `code` IN ('ROLE_ADMIN', 'ROLE_AUDITOR', 'ROLE_VP', 'ROLE_LEADERSHIP') THEN 'GROUP'
  WHEN `code` IN ('ROLE_ASSET', 'ROLE_FINANCE', 'ROLE_WAREHOUSE') THEN 'COMPANY'
  ELSE 'DEPT'
END
WHERE `org_scope` IS NULL OR TRIM(`org_scope`) = '';

-- 复核：不应再存在空的数据范围或组织范围
SELECT `id`, `code`, `name`, `org_scope`, `data_scope`, `status`
FROM `org_roles` ORDER BY `sort`, `code`;

SELECT COUNT(*) AS empty_scope_rows FROM `org_roles`
WHERE `data_scope` IS NULL OR TRIM(`data_scope`) = '' OR `org_scope` IS NULL OR TRIM(`org_scope`) = '';
