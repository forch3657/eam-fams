-- ============================================================================
-- 12-approve-result-dict.sql
-- 六动作改造：把「撤回 / 作废 / 终止」三个新增审批结果码补进运行期数据字典。
--
-- 背景：发起人三动作（提交 / 撤回 / 作废）与审批人三动作（通过 / 驳回 / 终止）
-- 引入 WITHDRAW / VOID / TERMINATE 三个结果码，已由
-- `npm run export:contract` 写入内置 contract/enums.json。
--
-- 说明：EnumCatalog.allowed() = 内置枚举 ∪ 运行期字典，label() 只查内置，
-- 因此功能上不依赖字典项；这里补齐是为了「系统管理 → 数据字典」能展示并维护文案。
--
-- 幂等：INSERT IGNORE 按主键去重，可重复执行；不改已有 4 项。
-- 执行：mysql -h 127.0.0.1 -u root -p fams < 12-approve-result-dict.sql
-- ============================================================================

INSERT IGNORE INTO `system_dict_items`
(`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`)
VALUES
('DI_approve_result_WITHDRAW', '撤回', 'WITHDRAW', 5, 'ENABLED', '', 'migration-12', NOW(), 'migration-12', NOW(), 1, 'approve_result'),
('DI_approve_result_VOID',     '作废', 'VOID',     6, 'ENABLED', '', 'migration-12', NOW(), 'migration-12', NOW(), 1, 'approve_result'),
('DI_approve_result_TERMINATE','终止', 'TERMINATE',7, 'ENABLED', '', 'migration-12', NOW(), 'migration-12', NOW(), 1, 'approve_result');

-- 字典类型的条目数同步（页面展示用；不影响枚举校验）
UPDATE `system_dict_types`
SET `count` = (SELECT COUNT(*) FROM (SELECT id FROM `system_dict_items` WHERE `dict_code` = 'approve_result') t)
WHERE `code` = 'approve_result';
