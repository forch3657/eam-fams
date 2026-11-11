-- =============================================================
-- WF4 资产借出流程：补「借用人确认接收」环节（2026-11-11）
--
-- 业务裁决：借出要能回答「借给谁、哪个部门、什么用途」，并经借用人确认接收；
-- 归还维持现状（BORROWED → IDLE、清空 userId），不做配置管理前置。
--
-- s3 用 DOC_BORROWER（按借出单 borrowerId 解析唯一审批人）+
-- HAS_BORROWER 触发条件：历史单据 / 未填借用人的存量 E2E 单据上该环节不生效，
-- 避免提交时被 fail-closed 预解析拦死，也不影响在途单据。
-- 依赖 P2 新增的审批人类型与条件类型，必须与新版本后端一起生效。
--
-- 用法：mysql --default-character-set=utf8mb4 -h 127.0.0.1 -u root -p fams < 18-wf4-borrower.sql
-- 幂等：steps 与目标值不一致才更新，重复执行不会重复 bump version
-- =============================================================

USE `fams`;

SET @steps := '[{"key":"s1","name":"部门主管审批","approverType":"DEPT_LEADER","approverRoleId":"R5","approver":"部门主管","mode":"ANY","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s2","name":"资产管理员审核","approverRoleId":"R2","approver":"资产管理员","mode":"SEQUENCE","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s3","name":"借用人确认接收","approverType":"DOC_BORROWER","approverRoleId":"R3","approver":"借出借用人","mode":"ANY","conditionType":"HAS_BORROWER","conditionValue":0,"condition":"已登记借用人"}]';

UPDATE `system_workflow_flows`
SET `steps` = @steps,
    `version` = `version` + 1,
    `update_time` = NOW(3)
WHERE `code` = 'FLOW_BORROW'
  AND (`steps` IS NULL OR `steps` <> @steps);

SELECT `code`, `name`, `steps`
FROM `system_workflow_flows`
WHERE `code` = 'FLOW_BORROW';
