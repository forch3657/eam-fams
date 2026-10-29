-- ============================================================
-- 折旧口径重置（2026-10-29）
--
-- 背景：前端「折旧方案」已废弃，计提与台账统一由后端
--       DepreciationService（规则 + 计划 + 分类）产出。
-- 本脚本负责：
--   1. 折旧计划明细补齐台账展示字段
--   2. 计提周期统一为按月
--   3. 修正历史计划里的演示公司编码
--   4. 清空历史计提产物，供重新计提
-- ============================================================

-- 1. 折旧台账已改为 /depreciation/plan 实时计算（基于资产 + 规则 + 计划），
--    不再写入 fixed_asset_report_depreciation_plan_details，
--    因此本脚本不需要为该表加列；新环境由 schema.sql 直接建好完整结构。

-- 2. 计提周期统一按月（历史数据里存在 QUARTERLY / YEARLY）
UPDATE fixed_asset_settings_depreciation_plans SET calc_time = 'MONTHLY';

-- 3. 历史计划的公司编码是演示值 C1..C4，与实际公司主键不一致，导致计划永远匹配不上。
--    置空后退化为「按资产类型匹配的全局计划」，再由具体计划覆盖。
UPDATE fixed_asset_settings_depreciation_plans
SET company_id = NULL
WHERE company_id IN ('C1', 'C2', 'C3', 'C4');

-- 4. 清空历史计提产物（含前端旧版「假计提」写入的报表），随后在页面重新计提
DELETE FROM fixed_asset_report_depreciation_details;
DELETE FROM fixed_asset_report_depreciation_plan_details;
DELETE FROM fixed_asset_depreciation_reports;

-- 校验
SELECT COUNT(*) AS plans FROM fixed_asset_settings_depreciation_plans;
SELECT COUNT(*) AS reports FROM fixed_asset_depreciation_reports;
