-- 清理 E2E 测试残留数据（只删 E2E_ 前缀的测试数据，不碰真实业务数据）
--
-- 背景：E2E 直接跑生产库（见 project_e2e_prod_target），每次跑完都会留下临时账号、
-- 单据、资产、审批轨迹、站内信与操作日志。账号因为「已有审批记录不能删除」删不掉，
-- 越积越多还挡路（数据范围过滤、列表分页都被污染）。
--
-- 用法：root@localhost 执行本脚本；脚本可重复执行，删干净后再次执行为 0 影响。
-- 依赖顺序：先删轨迹（账号删除守卫依赖），再删单据、资产、基础设置，最后删账号。
-- 2026-11-04 首次清理：删 19 账号 / 189 单据 / 189 资产 / 340 轨迹 / 38 站内信 / 4975 日志，
-- 保留真实数据：138 账号 / 71 资产 / 4 轨迹 / 18081 操作日志。

SET autocommit = 0;
START TRANSACTION;

-- 1) 审批轨迹：E2E 单据的轨迹 + E2E 账号提交的低值单（低值单号由服务端生成，没有 E2E_ 标记）
DELETE FROM fixed_asset_doc_approvals WHERE doc_code LIKE 'E2E%' OR doc_code LIKE 'e2e%';
DELETE FROM fixed_asset_doc_approvals WHERE doc_key = 'requisition'
  AND doc_id IN (SELECT id FROM low_value_requisition WHERE creator_id IN (SELECT id FROM org_users WHERE username LIKE 'e2e%'));
DELETE FROM fixed_asset_doc_approvals WHERE doc_key = 'inbound'
  AND doc_id IN (SELECT id FROM low_value_inbound WHERE creator_id IN (SELECT id FROM org_users WHERE username LIKE 'e2e%'));
DELETE FROM fixed_asset_doc_approvals WHERE doc_key = 'return'
  AND doc_id IN (SELECT id FROM low_value_return WHERE creator_id IN (SELECT id FROM org_users WHERE username LIKE 'e2e%'));

-- 2) 低值单据与物品
DELETE FROM low_value_inbound    WHERE creator_id IN (SELECT id FROM org_users WHERE username LIKE 'e2e%');
DELETE FROM low_value_requisition WHERE creator_id IN (SELECT id FROM org_users WHERE username LIKE 'e2e%');
DELETE FROM low_value_return     WHERE creator_id IN (SELECT id FROM org_users WHERE username LIKE 'e2e%');
DELETE FROM low_value_items          WHERE code LIKE 'E2E%' OR name LIKE 'E2E%';
DELETE FROM low_value_settings_locations WHERE code LIKE 'E2E%' OR name LIKE 'E2E%';

-- 3) 固定资产单据（9 类）
DELETE FROM fixed_asset_doc_lists_alloc    WHERE code LIKE 'E2E%' OR name LIKE 'E2E%';
DELETE FROM fixed_asset_doc_lists_inbound  WHERE code LIKE 'E2E%' OR name LIKE 'E2E%';
DELETE FROM fixed_asset_doc_lists_borrow   WHERE code LIKE 'E2E%' OR name LIKE 'E2E%';
DELETE FROM fixed_asset_doc_lists_transfer WHERE code LIKE 'E2E%' OR name LIKE 'E2E%';
DELETE FROM fixed_asset_doc_lists_change   WHERE code LIKE 'E2E%' OR name LIKE 'E2E%';
DELETE FROM fixed_asset_doc_lists_dispose  WHERE code LIKE 'E2E%' OR name LIKE 'E2E%';
DELETE FROM fixed_asset_doc_lists_back     WHERE code LIKE 'E2E%' OR name LIKE 'E2E%';
DELETE FROM fixed_asset_doc_lists_repair   WHERE code LIKE 'E2E%' OR name LIKE 'E2E%';

-- 4) 盘点单 / 盘点计划（单号或名称带 E2E_ 才删；手工盘点的 PD 开头单号保留）
DELETE FROM fixed_asset_inventory_docs  WHERE doc_no LIKE 'E2E%' OR name LIKE 'E2E%';
DELETE FROM fixed_asset_inventory_plans WHERE plan_no LIKE 'E2E%' OR plan_name LIKE 'E2E%';

-- 5) 固定资产台账与基础设置
DELETE FROM fixed_assets                 WHERE code LIKE 'E2E%' OR name LIKE 'E2E%';
DELETE FROM fixed_asset_settings_locations  WHERE code LIKE 'E2E%' OR name LIKE 'E2E%';
DELETE FROM fixed_asset_settings_categories WHERE code LIKE 'E2E%' OR name LIKE 'E2E%';

-- 6) 站内信与操作日志
DELETE FROM notify_messages WHERE title LIKE '%E2E%' OR content LIKE '%E2E%';
DELETE FROM operation_logs  WHERE target LIKE '%E2E%' OR detail LIKE '%E2E%' OR operator LIKE 'e2e%';

-- 7) 临时账号（放最后：前面几张表都引用它，删早了会失去筛选依据）
DELETE FROM org_users WHERE username LIKE 'e2e%' OR username LIKE 'E2E%';

COMMIT;

-- 复核：以下计数应全部为 0
SELECT 'users_e2e' k, COUNT(*) c FROM org_users WHERE username LIKE 'e2e%' OR username LIKE 'E2E%'
UNION ALL SELECT 'assets_e2e', COUNT(*) FROM fixed_assets WHERE code LIKE 'E2E%' OR name LIKE 'E2E%'
UNION ALL SELECT 'fa_docs_e2e', (SELECT COUNT(*) FROM fixed_asset_doc_lists_alloc WHERE code LIKE 'E2E%') + (SELECT COUNT(*) FROM fixed_asset_doc_lists_inbound WHERE code LIKE 'E2E%') + (SELECT COUNT(*) FROM fixed_asset_doc_lists_borrow WHERE code LIKE 'E2E%') + (SELECT COUNT(*) FROM fixed_asset_doc_lists_transfer WHERE code LIKE 'E2E%') + (SELECT COUNT(*) FROM fixed_asset_doc_lists_change WHERE code LIKE 'E2E%') + (SELECT COUNT(*) FROM fixed_asset_doc_lists_dispose WHERE code LIKE 'E2E%') + (SELECT COUNT(*) FROM fixed_asset_doc_lists_back WHERE code LIKE 'E2E%') + (SELECT COUNT(*) FROM fixed_asset_doc_lists_repair WHERE code LIKE 'E2E%')
UNION ALL SELECT 'trails_e2e', COUNT(*) FROM fixed_asset_doc_approvals WHERE doc_code LIKE 'E2E%' OR doc_code LIKE 'e2e%'
UNION ALL SELECT 'messages_e2e', COUNT(*) FROM notify_messages WHERE title LIKE '%E2E%' OR content LIKE '%E2E%'
UNION ALL SELECT 'oplogs_e2e', COUNT(*) FROM operation_logs WHERE target LIKE '%E2E%' OR detail LIKE '%E2E%' OR operator LIKE 'e2e%';
