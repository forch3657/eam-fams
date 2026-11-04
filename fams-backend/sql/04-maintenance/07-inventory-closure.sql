-- 盘点闭环补齐：资产状态新增 3 项（待入库 / 待核销 / 已核销）
--
-- 背景（2026-11-04 盘点功能审查，产品口径）：
--   1) 盘盈走「入库单审批流建账」→ 账外资产建档后处于「待入库」，
--      入库验收（WF1：仓管验收 → 资产管理员复核）通过后转「空闲」正式可用；
--   2) 盘亏要在台账上可见 → 盘点完结时置「待核销」，
--      处置审批通过后转「已核销」（账面上注销，保留在台账里留痕）。
--
-- 为什么必须改字典：资产状态的枚举校验走 system_dict_items，
-- 字典项没加就写不进新状态（台账 create/update 会报 422）。
--
-- 用法：root@localhost 执行；脚本可重复执行（幂等）。
-- 关联：审计员补 wm:todo 见 06-auditor-wm-todo.sql。

INSERT INTO `system_dict_items`
  (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`)
VALUES
  ('DI_asset_status_PENDING_INBOUND', '待入库', 'PENDING_INBOUND', 7, 'ENABLED', '盘点盘盈建账后待入库验收', 'seed', NOW(3), 'seed', NOW(3), 1, 'asset_status'),
  ('DI_asset_status_PENDING_WRITE_OFF', '待核销', 'PENDING_WRITE_OFF', 8, 'ENABLED', '盘点盘亏待处置核销', 'seed', NOW(3), 'seed', NOW(3), 1, 'asset_status'),
  ('DI_asset_status_DISPOSED', '已核销', 'DISPOSED', 9, 'ENABLED', '处置审批完结，账面上注销', 'seed', NOW(3), 'seed', NOW(3), 1, 'asset_status')
ON DUPLICATE KEY UPDATE
  `label` = VALUES(`label`),
  `sort` = VALUES(`sort`),
  `remark` = VALUES(`remark`),
  `update_time` = NOW(3);

-- 复核：三个新状态都应就位
SELECT `value`, `label` FROM `system_dict_items`
 WHERE `dict_code` = 'asset_status'
   AND `value` IN ('PENDING_INBOUND', 'PENDING_WRITE_OFF', 'DISPOSED');
