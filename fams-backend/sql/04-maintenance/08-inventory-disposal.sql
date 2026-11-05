-- =============================================================
-- 盘点异常处理去向字典（1B）
--
-- 盘点明细登记为「异常」时必须选处理去向（转维修单 / 转变更单 / 已说明），
-- 审批完结时后端按去向生成待审维修单 / 变更单；「已说明」只留痕。
-- 枚举白名单来自 contract/enums.json（由前端 constants/enums.js 导出），
-- 这里补运行期字典项，前端 optionsOf('INVENTORY_DISPOSAL') 才能拿到中文标签。
--
-- 用法：mysql -h 127.0.0.1 -u root -p fams < 08-inventory-disposal.sql
-- 关联：07-inventory-closure.sql（盘盈建账 / 盘亏待核销）
-- 幂等：全部 ON DUPLICATE KEY UPDATE，可重复执行
-- =============================================================

USE `fams`;

INSERT INTO `system_dict_types`
  (`code`, `name`, `count`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`)
VALUES
  ('inventory_disposal', '盘点异常处理去向', 3, 'ENABLED', NULL, 'seed', NOW(3), 'seed', NOW(3), 1)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`), `count` = VALUES(`count`), `status` = VALUES(`status`), `update_time` = NOW(3);

INSERT INTO `system_dict_items`
  (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`)
VALUES
  ('DI_inventory_disposal_REPAIR', '转维修单', 'REPAIR', 1, 'ENABLED', '盘点异常生成待审维修单', 'seed', NOW(3), 'seed', NOW(3), 1, 'inventory_disposal'),
  ('DI_inventory_disposal_CHANGE', '转变更单', 'CHANGE', 2, 'ENABLED', '盘点异常生成待审资产变更单', 'seed', NOW(3), 'seed', NOW(3), 1, 'inventory_disposal'),
  ('DI_inventory_disposal_EXPLAINED', '已说明', 'EXPLAINED', 3, 'ENABLED', '异常已在备注说明，不生成派生单据', 'seed', NOW(3), 'seed', NOW(3), 1, 'inventory_disposal')
ON DUPLICATE KEY UPDATE
  `label` = VALUES(`label`), `sort` = VALUES(`sort`), `status` = VALUES(`status`),
  `remark` = VALUES(`remark`), `update_time` = NOW(3);

SELECT `code`, `name`, `count` FROM `system_dict_types` WHERE `code` = 'inventory_disposal';
SELECT `value`, `label`, `sort` FROM `system_dict_items`
WHERE `dict_code` = 'inventory_disposal' ORDER BY `sort`;
