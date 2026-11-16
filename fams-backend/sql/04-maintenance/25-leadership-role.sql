-- =============================================================
-- D4 新环境重建补齐领导班子角色（2026-11-16）
--
-- 背景：baseline-data.sql 只建 R1~R8 共 8 个内置角色；生产库的第 9 个角色
--       ROLE_LEADERSHIP（领导班子，id=mvu9z81n35）是自定义角色，历史上由管理员
--       在角色管理页手工创建。11-role-permissions.sql 只 UPDATE 它、21 脚本只补
--       空值，二者都不 INSERT。因此全新建库 + 跑完 06~24 后仍缺该角色，
--       与 9 角色权限矩阵不符，领导班子审批人配置与流程解析会失效。
--
-- 本脚本以生产实测值为准幂等补齐；已存在同名/同 id 行时不动，不覆盖既有配置。
-- 权限码与 dataScope/orgScope 口径见 docs/qa/role-permission-matrix.md。
--
-- 用法（管理员账号）：
--   $env:MYSQL_PWD = <管理员口令>
--   mysql -h 127.0.0.1 -u root --default-character-set=utf8mb4 `
--     -e "USE fams; SOURCE f:/work/EAM-FAMS/fams-backend/sql/04-maintenance/25-leadership-role.sql;"
--   Remove-Item Env:MYSQL_PWD
-- =============================================================

USE `fams`;

INSERT INTO `org_roles`
  (`id`, `code`, `name`, `org_scope`, `data_scope`, `status`, `sort`, `remark`, `permissions`, `create_by`, `create_time`, `update_by`, `update_time`, `version`)
SELECT
  'mvu9z81n35', 'ROLE_LEADERSHIP', '领导班子', 'COMPANY', 'ALL', 'ENABLED', 9,
  '领导班子，含董事会成员 总经理 副总',
  '["wm:view","wm:todo","wm:alert","wm:overview","wm:message","fa:view","fa:export","fa:report","lv:view","lv:export","lv:report"]',
  'migration-25', NOW(3), 'migration-25', NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `org_roles` WHERE `id` = 'mvu9z81n35' OR `code` = 'ROLE_LEADERSHIP'
);

-- 复核：应返回 9 个角色，领导班子 org_scope=COMPANY / data_scope=ALL / 11 个权限码
SELECT `id`, `code`, `name`, `org_scope`, `data_scope`, `status`,
       JSON_LENGTH(`permissions`) AS perm_count
FROM `org_roles` ORDER BY `sort`, `code`;
