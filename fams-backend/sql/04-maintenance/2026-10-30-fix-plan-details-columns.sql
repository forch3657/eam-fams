-- P5-D1 修复：折旧计划明细表缺契约字段
--
-- 症状：
--   GET /api/fixed-asset-report-depreciation-plan-details → 500
--   GET /api/data-import/reset/preview?scope=fixed-asset → 500（清空预览逐表统计时命中）
--   折旧方案报表写入/读取同样失败
--
-- 原因：resources.json 的契约字段多于建表语句，查询 SELECT 了不存在的列
--       （asset_no / department / location / inbound_date / method / monthly / accumulated / net_value）。
--
-- 执行要求：需要 DDL 权限（生产库 fams 账号只有 DML，请用管理员账号执行），只执行一次。
--
-- 执行状态：**2026-11-02 已在本机生产库 fams 执行**（root@localhost），执行后 25 列，
--          GET /api/fixed-asset-report-depreciation-plan-details 与
--          GET /api/data-import/reset/preview?scope=fixed-asset 均恢复 code=0。
--          建表基线 sql/01-schema/00-schema.sql 与 deploy/sql/mysql/schema.sql 已同步。
-- 复跑：`npm run e2e:p5`（P5-17 已恢复固定资产范围，P5-17B 已并回 P5-17）。

ALTER TABLE `fixed_asset_report_depreciation_plan_details`
  ADD COLUMN `asset_no` VARCHAR(255) NULL COMMENT '资产编号' AFTER `asset_type`,
  ADD COLUMN `department` VARCHAR(255) NULL COMMENT '使用部门' AFTER `asset_no`,
  ADD COLUMN `location` VARCHAR(255) NULL COMMENT '存放地点' AFTER `department`,
  ADD COLUMN `inbound_date` DATETIME(3) NULL COMMENT '入库日期' AFTER `location`,
  ADD COLUMN `method` VARCHAR(64) NULL COMMENT 'DEPRECIATION_METHOD' AFTER `inbound_date`,
  ADD COLUMN `monthly` DECIMAL(20,6) NULL COMMENT '月折旧额' AFTER `method`,
  ADD COLUMN `accumulated` DECIMAL(20,6) NULL COMMENT '累计折旧' AFTER `monthly`,
  ADD COLUMN `net_value` DECIMAL(20,6) NULL COMMENT '净值' AFTER `accumulated`;
