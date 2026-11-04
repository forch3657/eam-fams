-- ============================================================
-- 流程环节改为「按单据归属部门解析审批人」
--
--   R5 部门主管 → DEPT_LEADER（部门负责人，唯一）
--   R7 分管副总 → DEPT_VP  （分管领导，唯一）
--   其余角色环节（R2 资产管理员 / R4 财务 / R6 审计 / R8 仓管）保持 ROLE
--
-- 幂等：只替换还没有 approverType 的环节，重复执行不会叠加。
-- ============================================================

UPDATE `system_workflow_flows`
SET `steps` = REPLACE(`steps`, '"approverRoleId":"R5"', '"approverType":"DEPT_LEADER","approverRoleId":"R5"')
WHERE `steps` LIKE '%"approverRoleId":"R5"%'
  AND `steps` NOT LIKE '%"approverType":"DEPT_LEADER","approverRoleId":"R5"%';

UPDATE `system_workflow_flows`
SET `steps` = REPLACE(`steps`, '"approverRoleId":"R7"', '"approverType":"DEPT_VP","approverRoleId":"R7"')
WHERE `steps` LIKE '%"approverRoleId":"R7"%'
  AND `steps` NOT LIKE '%"approverType":"DEPT_VP","approverRoleId":"R7"%';

-- 自检：确认生效环节
SELECT `code`, `steps` FROM `system_workflow_flows` WHERE `enabled` = 1 ORDER BY `code`;
