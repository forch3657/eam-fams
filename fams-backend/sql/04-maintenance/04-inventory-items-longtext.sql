-- ============================================================
-- 04-inventory-items-longtext.sql
--
-- 背景：盘点单 / 盘点计划的明细列原本是 TEXT（最大 65535 字节）。
--       盘点明细按「所属公司 + 资产类型」从台账生成，一个公司两百多项资产时
--       JSON 文本会超过 64KB，插入直接失败（前端只看到「服务异常」）。
--
-- 处理：把承载盘点明细的列改成 LONGTEXT（4GB），并把盘点员分配列一并放宽。
--       MySQL / H2 都支持该类型，不影响读写与查询（列内容仍是 JSON 文本）。
--
-- 执行权限：ALTER 需要 DDL 权限（fams 账号没有，用 root 执行）。
-- 可重复执行。
-- ============================================================

ALTER TABLE `fixed_asset_inventory_docs`
  MODIFY COLUMN `items` LONGTEXT COMMENT '盘点明细 JSON：全公司资产可达数百项，TEXT(64KB) 会溢出';

ALTER TABLE `fixed_asset_inventory_docs`
  MODIFY COLUMN `counters` LONGTEXT COMMENT '盘点员分配 JSON';

ALTER TABLE `fixed_asset_inventory_plans`
  MODIFY COLUMN `items` LONGTEXT COMMENT '盘点明细 JSON：全公司资产可达数百项，TEXT(64KB) 会溢出';

-- 自检：确认列类型已经是 LONGTEXT
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (TABLE_NAME, COLUMN_NAME) IN (
    ('fixed_asset_inventory_docs', 'items'),
    ('fixed_asset_inventory_docs', 'counters'),
    ('fixed_asset_inventory_plans', 'items')
  );
