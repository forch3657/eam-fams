-- ============================================================
-- 固定资产折旧配置对齐真实资产（2026-10-29）
--
-- 现状（71 条资产 / 4 家公司）：
--   - 资产实际用到 8 个分类：电子设备 28、办公家具 10、办公用品 8、
--     机械设备 7、运输设备 6、其他设备 5、材料 4、房屋建筑物 3；
--   - 折旧规则 8 条，已按分类全覆盖；
--   - 分类设置只有 6 条演示分类，且名称对不上资产分类（如「高价值资产/机械类」），
--     机械设备、房屋建筑物、材料三类缺失；
--   - 71 条资产的 lease_months 全为 36（导入默认值），而计提时优先取租赁月数，
--     导致 8 条折旧规则的年限全部被压成 3 年。
--
-- 处理：
--   1. 非租赁资产清空 lease_months，让折旧规则年限生效；
--   2. 分类设置重建为与资产分类一一对应的 8 条，默认折旧方式/年限与规则一致，
--      资产数量按台账实际值刷新。
-- ============================================================

-- 1. 只有租赁资产才保留租赁期限
UPDATE `fixed_assets`
SET `lease_months` = NULL
WHERE `purchase_mode` <> 'LEASE';

-- 2. 演示分类树（高价值资产 + 机械类/运输设备类/房屋建筑物类）与资产分类无关，移除
DELETE FROM `fixed_asset_settings_categories` WHERE `code` = 'CAT000';

-- 3. 现有 5 条分类：名称保留，默认口径与折旧规则对齐，资产数量按台账刷新
UPDATE `fixed_asset_settings_categories`
SET `parent_code` = '', `parent_name` = '-', `children` = '[]',
    `depreciation_method` = 'STRAIGHT_LINE', `useful_life` = 5,
    `asset_count` = (SELECT COUNT(*) FROM `fixed_assets` WHERE `category` = 'SUPPLIES'),
    `status` = 'ENABLED', `update_by` = 'admin', `update_time` = NOW(3), `version` = `version` + 1
WHERE `code` = 'CAT001';   -- 办公用品

UPDATE `fixed_asset_settings_categories`
SET `parent_code` = '', `parent_name` = '-', `children` = '[]',
    `depreciation_method` = 'STRAIGHT_LINE', `useful_life` = 5,
    `asset_count` = (SELECT COUNT(*) FROM `fixed_assets` WHERE `category` = 'ELECTRONIC'),
    `status` = 'ENABLED', `update_by` = 'admin', `update_time` = NOW(3), `version` = `version` + 1
WHERE `code` = 'CAT002';   -- 电子设备

UPDATE `fixed_asset_settings_categories`
SET `parent_code` = '', `parent_name` = '-', `children` = '[]',
    `depreciation_method` = 'DOUBLE_DECLINE', `useful_life` = 8,
    `asset_count` = (SELECT COUNT(*) FROM `fixed_assets` WHERE `category` = 'VEHICLE'),
    `status` = 'ENABLED', `update_by` = 'admin', `update_time` = NOW(3), `version` = `version` + 1
WHERE `code` = 'CAT003';   -- 运输设备

UPDATE `fixed_asset_settings_categories`
SET `parent_code` = '', `parent_name` = '-', `children` = '[]',
    `depreciation_method` = 'SUM_YEARS', `useful_life` = 10,
    `asset_count` = (SELECT COUNT(*) FROM `fixed_assets` WHERE `category` = 'FURNITURE'),
    `status` = 'ENABLED', `update_by` = 'admin', `update_time` = NOW(3), `version` = `version` + 1
WHERE `code` = 'CAT004';   -- 办公家具

UPDATE `fixed_asset_settings_categories`
SET `parent_code` = '', `parent_name` = '-', `children` = '[]',
    `depreciation_method` = 'STRAIGHT_LINE', `useful_life` = 10,
    `asset_count` = (SELECT COUNT(*) FROM `fixed_assets` WHERE `category` = 'OTHER'),
    `status` = 'ENABLED', `update_by` = 'admin', `update_time` = NOW(3), `version` = `version` + 1
WHERE `code` = 'CAT005';   -- 其他设备

-- 4. 补齐台账在用但分类设置缺失的 3 个分类
INSERT INTO `fixed_asset_settings_categories`
  (`id`, `code`, `name`, `parent_code`, `parent_name`, `depreciation_method`, `useful_life`,
   `asset_count`, `status`, `children`, `create_by`, `create_time`, `update_by`, `update_time`, `version`)
VALUES
  ('CAT006', 'CAT006', '机械设备', '', '-', 'STRAIGHT_LINE', 10,
   (SELECT COUNT(*) FROM `fixed_assets` WHERE `category` = 'MACHINE'),
   'ENABLED', '[]', 'admin', NOW(3), 'admin', NOW(3), 1),
  ('CAT007', 'CAT007', '房屋建筑物', '', '-', 'STRAIGHT_LINE', 30,
   (SELECT COUNT(*) FROM `fixed_assets` WHERE `category` = 'BUILDING'),
   'ENABLED', '[]', 'admin', NOW(3), 'admin', NOW(3), 1),
  ('CAT008', 'CAT008', '材料', '', '-', 'STRAIGHT_LINE', 2,
   (SELECT COUNT(*) FROM `fixed_assets` WHERE `category` = 'MATERIAL'),
   'ENABLED', '[]', 'admin', NOW(3), 'admin', NOW(3), 1);

SELECT `code`, `name`, `depreciation_method`, `useful_life`, `asset_count`, `status`
FROM `fixed_asset_settings_categories` ORDER BY `code`;

SELECT COUNT(*) AS assets_with_lease_months FROM `fixed_assets` WHERE `lease_months` IS NOT NULL;
