-- 2026-11-02 审批协作（P3-D3）：轨迹表增加「加签/转办/抄送」的目标人员
--
-- 可重复执行：列已存在时不做任何变更。
-- 执行：root@localhost（fams 应用账号无 DDL 权限）

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_asset_doc_approvals'
    AND COLUMN_NAME = 'target_user_id'
);

SET @ddl := IF(@col = 0,
  'ALTER TABLE `fixed_asset_doc_approvals` ADD COLUMN `target_user_id` VARCHAR(255) NULL COMMENT ''→org-users'' AFTER `approver_role_name`',
  'SELECT ''target_user_id already exists'' AS message'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
