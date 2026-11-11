-- =============================================================
-- WF5 资产调拨审批链优化（2026-11-11）
--
-- 用户裁决：
-- 1. 空闲资产可以派发、不能调拨（服务端 validateAssetPrecondition 已拦并给提示）；
-- 2. 调拨必须经手「现任使用人交出确认」与「新使用人接收确认」；
-- 3. 大额分管副总审批前移到「资产管理员办理调拨」之前，做事前批准而非事后备案。
--
-- 环节依赖 P2 新增的两种审批人类型（ASSET_CURRENT_USER / DOC_TARGET_USER）
-- 与 HAS_ASSET_USER 触发条件，必须与新版本后端一起生效。
-- 目标字段 to* / 调出前快照 before* 见 15-transfer-fields.sql。
--
-- 用法：mysql --default-character-set=utf8mb4 -h 127.0.0.1 -u root -p fams < 16-wf5-transfer-chain.sql
-- 幂等：steps 与目标值不一致才更新，重复执行不会重复 bump version
-- =============================================================

USE `fams`;

SET @steps := '[{"key":"s1","name":"现任使用人交出确认","approverType":"ASSET_CURRENT_USER","approverRoleId":"R3","approver":"现任资产使用人","mode":"ANY","conditionType":"HAS_ASSET_USER","conditionValue":0,"condition":"存在现任资产使用人"},{"key":"s2","name":"调出部门主管审批","approverType":"DEPT_LEADER","approverRoleId":"R5","approver":"部门主管","mode":"ANY","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s3","name":"新使用人接收确认","approverType":"DOC_TARGET_USER","approverRoleId":"R3","approver":"调拨后新使用人","mode":"ANY","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s4","name":"大额调拨分管副总审批","approverType":"DEPT_VP","approverRoleId":"R7","approver":"分管副总","mode":"ANY","conditionType":"AMOUNT_GT","conditionValue":200000,"condition":"单据金额大于 200000 元"},{"key":"s5","name":"资产管理员办理调拨","approverRoleId":"R2","approver":"资产管理员","mode":"SEQUENCE","conditionType":"NONE","conditionValue":0,"condition":"无条件"}]';

UPDATE `system_workflow_flows`
SET `steps` = @steps,
    `version` = `version` + 1,
    `update_time` = NOW(3)
WHERE `code` = 'FLOW_TRANSFER'
  AND (`steps` IS NULL OR `steps` <> @steps);

SELECT `code`, `name`, `initiator_role_id`, `steps`
FROM `system_workflow_flows`
WHERE `code` = 'FLOW_TRANSFER';
