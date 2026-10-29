-- ============================================================
-- 折旧设置配置修复（2026-10-29）
--
-- 问题：
--   1. 折旧规则只覆盖 5 个分类，办公用品 / 材料 / 其他设备 走默认口径
--   2. 折旧计划是演示数据：「华信科技 / 云鼎资产 / 恒信租赁 / 中天建设」
--      与实际公司主数据（福州数据技术研究院等）完全无关
--   3. 同类型计划存在多条互相冲突（机械设备同时有直线法和工作量法），
--      公司匹配为空时后端只能取第一条，口径不可控
--
-- 处理：规则补齐 8 个分类；计划清空，折旧统一按规则执行。
-- ============================================================

INSERT INTO fixed_asset_settings_depreciation_rules
  (name, method, useful_life, residual_rate, description, create_by, create_time, update_by, update_time, version)
VALUES
  ('办公用品折旧规则', 'STRAIGHT_LINE', 5, 5, '办公用品类，按 5 年直线法', 'admin', NOW(3), 'admin', NOW(3), 1),
  ('材料折旧规则', 'STRAIGHT_LINE', 2, 5, '材料类，按 2 年直线法', 'admin', NOW(3), 'admin', NOW(3), 1),
  ('其他设备折旧规则', 'STRAIGHT_LINE', 10, 5, '未归类设备默认口径', 'admin', NOW(3), 'admin', NOW(3), 1)
ON DUPLICATE KEY UPDATE
  method = VALUES(method),
  useful_life = VALUES(useful_life),
  residual_rate = VALUES(residual_rate),
  description = VALUES(description),
  update_time = VALUES(update_time);

-- 清空演示计划：折旧计划是「按公司覆盖规则」的可选配置，
-- 没有真实业务依据时不应保留冲突数据，否则会盖掉规则口径。
DELETE FROM fixed_asset_settings_depreciation_plans;

SELECT COUNT(*) AS rules FROM fixed_asset_settings_depreciation_rules;
SELECT COUNT(*) AS plans FROM fixed_asset_settings_depreciation_plans;
