-- 审计员（R6）补 wm:todo：盘点流程「审计抽查确认」环节的审批人
--
-- 背景：WF9 资产盘点流程第三环由 R6 审计员审批，但 R6 只有只读码
-- （fa:view / fa:report / sys:log / wm:view / wm:overview / wm:message），没有 wm:todo：
--   1) 工作台待办不加载（待办聚合要求 wm:todo）→ 审计员看不到任何待办；
--   2) 读不到流程配置（system-workflow 读需 sys:workflow 或 wm:todo）→ 前端算不出当前环节；
--   3) 读不到用户表（审批人名单）→ 环节审批人解析不出来。
-- 结果是「审计抽查确认」这一环在界面上没法处理，只能绕过界面直接调接口。
--
-- 其它审批人角色（R2 / R5 / R7）都有 wm:todo，这里把 R6 补齐到同一口径：
-- 待办 = 等我处理的事。盘点单/计划的读权限已放开 fa:view（权限契约），
-- 审计员只读可见，写/删仍要 fa:inventory。
--
-- 幂等：已含 wm:todo 时不再改写。执行需管理员账号。

UPDATE `org_roles`
SET `permissions` = JSON_ARRAY_APPEND(`permissions`, '$', 'wm:todo'),
    `update_time` = NOW()
WHERE `code` = 'ROLE_AUDITOR'
  AND `status` = 'ENABLED'
  AND JSON_CONTAINS(`permissions`, '"wm:todo"') = 0;

-- 自检：审计员应含 wm:todo，且仍不含任何写码（fa:inventory / fa:edit 等）
SELECT `code`, `permissions` FROM `org_roles` WHERE `code` = 'ROLE_AUDITOR';
