-- =============================================================================
-- 11-role-permissions.sql
-- 全角色权限梳理后的基线校准（2026-11-05）
--
-- 背景：资产使用人（R3，如陈学知）登录后可看到固定资产全部 8 个页签，
--       却连登录页承诺的「借出 / 报修发起」都点不了；财务/仓管/审计等审批人
--       又缺 wm:todo / fa:inbound 等必要权限。根因是角色权限与岗位职责错配，
--       且维修单据与资产处置单据共用 fa:dispose，导致「给报修权就得给处置权」。
--
-- 本脚本与「管理员在 /system/role 角色管理页配置」等价，供重部署 / 可复跑使用：
--   - 新增专用权限码 fa:repair（由 fams-frontend/src/config/permissions.js 导出契约），
--     fixed-asset-doc-lists-repair 的 write/delete 规则已同步 contract 与 PermissionPolicy；
--   - 重置 8 个内置角色（R1~R8）权限；R7（分管副总，生产库为 DISABLED）只收敛权限、
--     不改 status；ROLE_LEADERSHIP（领导班子，自定义角色）完全不动。
--
-- 幂等：WHERE permissions <> 目标值，重复执行不会重复 bump version。
-- 执行（root，DDL/DML 管理员账号）：
--   $env:MYSQL_PWD = '<MySQL 管理员口令>'
--   & 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' -h 127.0.0.1 -u root `
--       -D fams --default-character-set=utf8mb4 -e "source F:/work/EAM-FAMS/fams-backend/sql/04-maintenance/11-role-permissions.sql"
--   Remove-Item Env:MYSQL_PWD
-- =============================================================================

-- R1 系统管理员：全部 40 个权限码（补 fa:repair）
UPDATE `org_roles` SET `permissions` = '["fa:view","fa:add","fa:edit","fa:delete","fa:export","fa:inbound","fa:dispatch","fa:borrow","fa:change","fa:dispose","fa:repair","fa:inventory","fa:depreciation","fa:report","fa:settings","lv:view","lv:edit","lv:export","lv:inbound","lv:requisition","lv:return","lv:report","lv:settings","wm:view","wm:todo","wm:alert","wm:overview","wm:message","org:company","org:dept","org:user","org:role","sys:dict","sys:log","sys:workflow","sys:params","sys:message","sys:template","sys:terminal","sys:import"]',
  `version` = `version` + 1, `update_by` = 'migration-11', `update_time` = NOW(3)
WHERE `id` = 'R1' AND `permissions` <> '["fa:view","fa:add","fa:edit","fa:delete","fa:export","fa:inbound","fa:dispatch","fa:borrow","fa:change","fa:dispose","fa:repair","fa:inventory","fa:depreciation","fa:report","fa:settings","lv:view","lv:edit","lv:export","lv:inbound","lv:requisition","lv:return","lv:report","lv:settings","wm:view","wm:todo","wm:alert","wm:overview","wm:message","org:company","org:dept","org:user","org:role","sys:dict","sys:log","sys:workflow","sys:params","sys:message","sys:template","sys:terminal","sys:import"]';

-- R2 资产管理员：固定资产全生命周期 + 低值出入库（补 fa:repair；不含 fa:delete / org:* / sys:*）
UPDATE `org_roles` SET `permissions` = '["fa:view","fa:add","fa:edit","fa:export","fa:inbound","fa:dispatch","fa:borrow","fa:change","fa:dispose","fa:repair","fa:inventory","fa:depreciation","fa:report","fa:settings","lv:view","lv:edit","lv:export","lv:inbound","lv:requisition","lv:return","lv:report","lv:settings","wm:view","wm:todo","wm:alert","wm:overview","wm:message"]',
  `version` = `version` + 1, `update_by` = 'migration-11', `update_time` = NOW(3)
WHERE `id` = 'R2' AND `permissions` <> '["fa:view","fa:add","fa:edit","fa:export","fa:inbound","fa:dispatch","fa:borrow","fa:change","fa:dispose","fa:repair","fa:inventory","fa:depreciation","fa:report","fa:settings","lv:view","lv:edit","lv:export","lv:inbound","lv:requisition","lv:return","lv:report","lv:settings","wm:view","wm:todo","wm:alert","wm:overview","wm:message"]';

-- R3 资产使用人【本次反馈主角】：只读台账 + 发起借出 / 变更 / 报修 + 低值领用退库 + 工作台。
-- 不给 fa:dispose（资产处置）、fa:edit（改台账）、fa:inventory（发起盘点）等管理权。
UPDATE `org_roles` SET `permissions` = '["fa:view","fa:borrow","fa:change","fa:repair","lv:view","lv:requisition","lv:return","wm:view","wm:todo","wm:message"]',
  `remark` = '资产使用人：查看台账，发起借出/变更/报修与低值领用退库，处理本人待办',
  `version` = `version` + 1, `update_by` = 'migration-11', `update_time` = NOW(3)
WHERE `id` = 'R3' AND `permissions` <> '["fa:view","fa:borrow","fa:change","fa:repair","lv:view","lv:requisition","lv:return","wm:view","wm:todo","wm:message"]';

-- R4 财务管理员：WF8 大额处置的「财务管理员复核」审批人，必须有 wm:todo 才能在工作台看到待办
UPDATE `org_roles` SET `permissions` = '["fa:view","fa:export","fa:depreciation","fa:report","lv:view","lv:report","sys:log","wm:view","wm:todo","wm:overview","wm:message"]',
  `version` = `version` + 1, `update_by` = 'migration-11', `update_time` = NOW(3)
WHERE `id` = 'R4' AND `permissions` <> '["fa:view","fa:export","fa:depreciation","fa:report","lv:view","lv:report","sys:log","wm:view","wm:todo","wm:overview","wm:message"]';

-- R5 部门主管：只做审批与部门查询，收回 fa:edit（改台账）/ fa:dispatch（派发）/
-- fa:borrow（发起借出）/ fa:inventory（发起盘点）四个与审批职责无关的执行权。
-- 审批动作走 /api/approvals/action，按流程点名到人，不依赖这些写码。
UPDATE `org_roles` SET `permissions` = '["fa:view","fa:report","lv:view","lv:requisition","lv:report","wm:view","wm:todo","wm:alert","wm:message"]',
  `version` = `version` + 1, `update_by` = 'migration-11', `update_time` = NOW(3)
WHERE `id` = 'R5' AND `permissions` <> '["fa:view","fa:report","lv:view","lv:requisition","lv:report","wm:view","wm:todo","wm:alert","wm:message"]';

-- R6 审计员：补 fa:export，让内审能导出盘点/资产报表作审计证据（原有 fa:report 只读查看）
UPDATE `org_roles` SET `permissions` = '["fa:view","fa:export","fa:report","lv:view","lv:report","sys:log","wm:view","wm:todo","wm:overview","wm:message"]',
  `version` = `version` + 1, `update_by` = 'migration-11', `update_time` = NOW(3)
WHERE `id` = 'R6' AND `permissions` <> '["fa:view","fa:export","fa:report","lv:view","lv:report","sys:log","wm:view","wm:todo","wm:overview","wm:message"]';

-- R8 仓管员：WF1「仓管验收」环节审批人，补 fa:inbound 才能办理 / 查看入库验收
UPDATE `org_roles` SET `permissions` = '["fa:view","fa:inbound","fa:report","lv:view","lv:inbound","lv:requisition","lv:return","lv:report","wm:view","wm:todo","wm:alert","wm:message"]',
  `version` = `version` + 1, `update_by` = 'migration-11', `update_time` = NOW(3)
WHERE `id` = 'R8' AND `permissions` <> '["fa:view","fa:inbound","fa:report","lv:view","lv:inbound","lv:requisition","lv:return","lv:report","wm:view","wm:todo","wm:alert","wm:message"]';

-- R7 分管副总：生产库该角色为 DISABLED（领导班子实际走 ROLE_LEADERSHIP），
-- 这里只收敛权限、不改 status，避免将来启用时把台账编辑/资产处置权一并带进来。
-- 审批资格由流程按 vp_id 点名到人，不依赖 fa:edit / fa:dispose。
UPDATE `org_roles` SET `permissions` = '["fa:view","fa:report","lv:view","lv:report","wm:view","wm:todo","wm:overview","wm:message"]',
  `version` = `version` + 1, `update_by` = 'migration-11', `update_time` = NOW(3)
WHERE `id` = 'R7' AND `permissions` <> '["fa:view","fa:report","lv:view","lv:report","wm:view","wm:todo","wm:overview","wm:message"]';

-- 复核：应返回 40 个权限码内的合法值，且 9 个角色权限无越权残留
SELECT `id`, `code`, `status`, JSON_LENGTH(`permissions`) AS perm_count, `version`
FROM `org_roles` ORDER BY `sort`;
