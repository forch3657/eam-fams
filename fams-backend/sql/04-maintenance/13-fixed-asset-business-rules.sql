-- =============================================================
-- 固定资产业务规范落地（2026-11-09）：幂等迁移
--
-- 目标口径见 docs/fixed-asset-business-rules.md：
--   1) 处置方式 = 报废/变卖/捐赠/转让；变更类型 = 调拨/维修/信息更正
--   2) 借出归还 = 关联原借出单的退库单（WF3），退库单加 borrow_doc_id
--   3) 变卖/捐赠/转让强制财务 R4 + 审计 R6 参与（不按金额豁免）
--   4) 维修引入 REPAIRING 与修毕验收环节
--   5) 期初切换日由管理员在系统参数中指定
--
-- 用法：mysql -h 127.0.0.1 -u root -p fams < 13-fixed-asset-business-rules.sql
-- 幂等：加列走 information_schema 检查；字典/参数/流程走 UPSERT 与定点 UPDATE。
-- 存量保护：不删除任何字典项、不改写任何历史单据与资产行；旧字典项只停用。
-- =============================================================

USE `fams`;

-- -------------------------------------------------------------
-- 1. 新增列（DDL 幂等）
-- -------------------------------------------------------------
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fixed_asset_doc_lists_back' AND COLUMN_NAME = 'borrow_doc_id');
SET @ddl := IF(@col = 0,
  'ALTER TABLE `fixed_asset_doc_lists_back` ADD COLUMN `borrow_doc_id` VARCHAR(255) NULL COMMENT ''关联原借出单；非空即借出归还型退库单'' AFTER `remark`',
  'SELECT ''back.borrow_doc_id already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 索引幂等：查 information_schema.STATISTICS
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fixed_asset_doc_lists_back' AND INDEX_NAME = 'idx_back_borrow_doc');
SET @ddl := IF(@idx = 0,
  'ALTER TABLE `fixed_asset_doc_lists_back` ADD INDEX `idx_back_borrow_doc` (`borrow_doc_id`)',
  'SELECT ''back.idx_back_borrow_doc already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fixed_asset_doc_lists_borrow' AND COLUMN_NAME = 'expected_return_date');
SET @ddl := IF(@col = 0,
  'ALTER TABLE `fixed_asset_doc_lists_borrow` ADD COLUMN `expected_return_date` DATETIME(3) NULL COMMENT ''预计归还日'' AFTER `remark`',
  'SELECT ''borrow.expected_return_date already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fixed_asset_doc_lists_change' AND COLUMN_NAME = 'change_type');
SET @ddl := IF(@col = 0,
  'ALTER TABLE `fixed_asset_doc_lists_change` ADD COLUMN `change_type` VARCHAR(64) NULL COMMENT ''资产变更类型'' AFTER `remark`',
  'SELECT ''change.change_type already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fixed_asset_doc_lists_change' AND COLUMN_NAME = 'before_snapshot');
SET @ddl := IF(@col = 0,
  'ALTER TABLE `fixed_asset_doc_lists_change` ADD COLUMN `before_snapshot` VARCHAR(1000) NULL COMMENT ''更正前快照'' AFTER `change_type`',
  'SELECT ''change.before_snapshot already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fixed_asset_doc_lists_change' AND COLUMN_NAME = 'after_snapshot');
SET @ddl := IF(@col = 0,
  'ALTER TABLE `fixed_asset_doc_lists_change` ADD COLUMN `after_snapshot` VARCHAR(1000) NULL COMMENT ''更正后快照'' AFTER `before_snapshot`',
  'SELECT ''change.after_snapshot already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fixed_asset_doc_lists_dispose' AND COLUMN_NAME = 'dispose_type');
SET @ddl := IF(@col = 0,
  'ALTER TABLE `fixed_asset_doc_lists_dispose` ADD COLUMN `dispose_type` VARCHAR(64) NULL COMMENT ''处置方式'' AFTER `remark`',
  'SELECT ''dispose.dispose_type already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fixed_asset_doc_lists_dispose' AND COLUMN_NAME = 'buyer');
SET @ddl := IF(@col = 0,
  'ALTER TABLE `fixed_asset_doc_lists_dispose` ADD COLUMN `buyer` VARCHAR(255) NULL COMMENT ''受让方'' AFTER `dispose_type`',
  'SELECT ''dispose.buyer already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fixed_asset_doc_lists_dispose' AND COLUMN_NAME = 'voucher_no');
SET @ddl := IF(@col = 0,
  'ALTER TABLE `fixed_asset_doc_lists_dispose` ADD COLUMN `voucher_no` VARCHAR(255) NULL COMMENT ''凭证号'' AFTER `buyer`',
  'SELECT ''dispose.voucher_no already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fixed_asset_doc_lists_dispose' AND COLUMN_NAME = 'disposal_amount');
SET @ddl := IF(@col = 0,
  'ALTER TABLE `fixed_asset_doc_lists_dispose` ADD COLUMN `disposal_amount` DECIMAL(18,2) NULL COMMENT ''成交或转让金额'' AFTER `voucher_no`',
  'SELECT ''dispose.disposal_amount already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fixed_asset_doc_lists_dispose' AND COLUMN_NAME = 'out_ledger_basis');
SET @ddl := IF(@col = 0,
  'ALTER TABLE `fixed_asset_doc_lists_dispose` ADD COLUMN `out_ledger_basis` VARCHAR(255) NULL COMMENT ''出账依据'' AFTER `disposal_amount`',
  'SELECT ''dispose.out_ledger_basis already exists'' AS message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -------------------------------------------------------------
-- 2. 字典项：启用目标取值、停用旧取值（DML 单事务）
--    注意：dispose_type.TRANSFER 与 change_type.TRANSFER 同码不同义，
--    必须按 dict_code 精确限定，禁止按 value 全表 UPDATE。
-- -------------------------------------------------------------
START TRANSACTION;

INSERT INTO `system_dict_items`
  (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`)
VALUES
  ('DI_dispose_type_SCRAP', '报废', 'SCRAP', 1, 'ENABLED', '', 'migration', NOW(), 'migration', NOW(), 1, 'dispose_type'),
  ('DI_dispose_type_SALE', '变卖', 'SALE', 2, 'ENABLED', '强制财务与审计参与', 'migration', NOW(), 'migration', NOW(), 1, 'dispose_type'),
  ('DI_dispose_type_DONATE', '捐赠', 'DONATE', 3, 'ENABLED', '强制财务与审计参与', 'migration', NOW(), 'migration', NOW(), 1, 'dispose_type'),
  ('DI_dispose_type_TRANSFER_OUT', '转让', 'TRANSFER_OUT', 4, 'ENABLED', '仅集团内独立核算主体，出公司即出账；强制财务与审计参与', 'migration', NOW(), 'migration', NOW(), 1, 'dispose_type'),
  ('DI_change_type_TRANSFER', '调拨', 'TRANSFER', 1, 'ENABLED', '', 'migration', NOW(), 'migration', NOW(), 1, 'change_type'),
  ('DI_change_type_REPAIR', '维修', 'REPAIR', 2, 'ENABLED', '引入维修中与修毕验收', 'migration', NOW(), 'migration', NOW(), 1, 'change_type'),
  ('DI_change_type_CORRECTION', '信息更正', 'CORRECTION', 3, 'ENABLED', '须留更正前后快照', 'migration', NOW(), 'migration', NOW(), 1, 'change_type')
ON DUPLICATE KEY UPDATE
  `label` = VALUES(`label`), `sort` = VALUES(`sort`), `status` = 'ENABLED',
  `remark` = VALUES(`remark`), `update_by` = 'migration', `update_time` = NOW();

-- 旧值只停用、不删除：历史单据仍可按 value 展示
UPDATE `system_dict_items` SET `status` = 'DISABLED', `update_by` = 'migration', `update_time` = NOW()
WHERE `dict_code` = 'dispose_type' AND `value` IN ('TRANSFER', 'OTHER');
UPDATE `system_dict_items` SET `status` = 'DISABLED', `update_by` = 'migration', `update_time` = NOW()
WHERE `dict_code` = 'change_type' AND `value` = 'OTHER';

UPDATE `system_dict_types` SET `count` = 4, `update_by` = 'migration', `update_time` = NOW()
WHERE `code` = 'dispose_type';
UPDATE `system_dict_types` SET `count` = 3, `update_by` = 'migration', `update_time` = NOW()
WHERE `code` = 'change_type';

-- -------------------------------------------------------------
-- 3. 系统参数：期初切换日由管理员手工指定（留空表示尚未指定）
-- -------------------------------------------------------------
INSERT INTO `system_params`
  (`id`, `name`, `key`, `value`, `type`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`)
VALUES
  ('SP11', '期初数据切换日', 'sys.asset.legacy.cutoff', '', 'CUSTOM',
   '管理员在系统设置中指定的上线切换日（YYYY-MM-DD）；留空表示尚未指定，此时拒绝期初状态直写。指定与变更须写操作日志',
   'migration', NOW(), 'migration', NOW(), 1)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`), `remark` = VALUES(`remark`), `update_by` = 'migration', `update_time` = NOW();

-- -------------------------------------------------------------
-- 4. 流程步骤
--    WF6 增加「修毕验收」环节；
--    WF8 财务/审计改为按处置方式强制（服务端 effectiveCtx 从单据读 disposeType，
--    不采信客户端 ctx），报废仍沿用金额门槛。
-- -------------------------------------------------------------
UPDATE `system_workflow_flows` SET `steps` =
  '[{"key":"s1","name":"部门主管审批","approverType":"DEPT_LEADER","approverRoleId":"R5","approver":"部门主管","mode":"ANY","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s2","name":"资产管理员审核","approverRoleId":"R2","approver":"资产管理员","mode":"SEQUENCE","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s3","name":"大额维修分管副总审批","approverType":"DEPT_VP","approverRoleId":"R7","approver":"分管副总","mode":"ANY","conditionType":"AMOUNT_GT","conditionValue":50000,"condition":"单据金额大于 50000 元"},{"key":"s4","name":"修毕验收","approverRoleId":"R2","approver":"资产管理员","mode":"ANY","conditionType":"NONE","conditionValue":0,"condition":"维修完成验收后资产回使用中"}]',
  `update_by` = 'migration', `update_time` = NOW()
WHERE `id` = 'WF6';

UPDATE `system_workflow_flows` SET `steps` =
  '[{"key":"s1","name":"部门主管审批","approverType":"DEPT_LEADER","approverRoleId":"R5","approver":"部门主管","mode":"ANY","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s2","name":"财务管理员复核","approverRoleId":"R4","approver":"财务管理员","mode":"ANY","conditionType":"DISPOSE_FINANCE","conditionValue":50000,"condition":"变卖/捐赠/转让强制参与；报废按金额大于 50000 元"},{"key":"s3","name":"分管副总审批","approverType":"DEPT_VP","approverRoleId":"R7","approver":"分管副总","mode":"ALL","conditionType":"AMOUNT_GT","conditionValue":200000,"condition":"单据金额大于 200000 元"},{"key":"s4","name":"审计员备案","approverRoleId":"R6","approver":"审计员","mode":"ANY","conditionType":"DISPOSE_AUDIT","conditionValue":200000,"condition":"变卖/捐赠/转让强制参与；报废按金额大于 200000 元"}]',
  `update_by` = 'migration', `update_time` = NOW()
WHERE `id` = 'WF8';

COMMIT;

-- -------------------------------------------------------------
-- 5. 复核（期望：4 张表新列齐全；字典启用 4+3 项、旧值停用；WF6 四步、WF8 含 DISPOSE_* 条件）
-- -------------------------------------------------------------
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('fixed_asset_doc_lists_back', 'fixed_asset_doc_lists_borrow',
                     'fixed_asset_doc_lists_change', 'fixed_asset_doc_lists_dispose')
  AND COLUMN_NAME IN ('borrow_doc_id', 'expected_return_date', 'change_type', 'before_snapshot',
                      'after_snapshot', 'dispose_type', 'buyer', 'voucher_no',
                      'disposal_amount', 'out_ledger_basis')
ORDER BY TABLE_NAME, COLUMN_NAME;

SELECT `dict_code`, `value`, `label`, `status`
FROM `system_dict_items`
WHERE `dict_code` IN ('dispose_type', 'change_type')
ORDER BY `dict_code`, `sort`;

SELECT `id`, `key`, `value`, `remark` FROM `system_params` WHERE `key` = 'sys.asset.legacy.cutoff';
SELECT `id`, `name`, `steps` FROM `system_workflow_flows` WHERE `id` IN ('WF6', 'WF8');
