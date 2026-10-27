-- ============================================================
-- EAM-FAMS 生产环境「最小基础数据」
-- 用法：在已执行 schema.sql 的 MySQL 库上执行本文件
-- 说明：
--   1) org/角色/管理员为系统运行所需最小集（根公司 C1、根部门 D1、系统管理员 U1、R1~R8 角色预设）；
--   2) 字典（system_dict_types / system_dict_items）为枚举校验与下拉选项所必需，务必导入；
--   3) 演示口令 Fzidt@123 为明文，应用首次启动时由 DataInitializer 自动 BCrypt 化；
--      上线前请通过「系统管理 → 用户」修改或设置 fams.security.bootstrap-password 强制重置。
--   4) 客户真实的组织架构（公司/部门/人员）请使用「数据导入」功能批量导入，无需在此手工维护。
-- ============================================================
SET NAMES utf8mb4;

-- 根公司
INSERT INTO `org_companies` (`id`, `code`, `name`, `short_name`, `parent_id`, `type`, `credit_code`, `legal_person`, `contact`, `phone`, `address`, `status`, `sort`, `create_by`, `create_time`, `update_by`, `update_time`, `version`) VALUES
('C1', 'GS-0001', '根公司（请改名为客户实际公司）', '根公司', NULL, '有限责任公司', 'X', '负责人', '联系人', '00000000000', '地址', 'ENABLED', 1, 'seed', '2024-01-05 09:00:00', 'seed', '2024-01-05 09:00:00', 1);

-- 根部门
INSERT INTO `org_departments` (`id`, `code`, `name`, `parent_id`, `company_id`, `leader`, `headcount`, `phone`, `status`, `sort`, `create_by`, `create_time`, `update_by`, `update_time`, `version`) VALUES
('D1', 'BM-0001', '默认部门', NULL, 'C1', '负责人', 1, '00000000000', 'ENABLED', 1, 'seed', '2024-01-06 09:00:00', 'seed', '2024-01-06 09:00:00', 1);

-- 系统管理员账号（口令明文，首启自动加密；role_ids 指向 R1 全权限）
INSERT INTO `org_users` (`id`, `username`, `password`, `password_reset_at`, `name`, `company_id`, `dept_id`, `position`, `role_ids`, `phone`, `email`, `status`, `created_at`, `last_login_at`, `create_by`, `create_time`, `update_by`, `update_time`, `version`) VALUES
('U1', 'admin', 'Fzidt@123', NULL, '系统管理员', 'C1', 'D1', '系统管理员', '["R1"]', '13800000001', 'admin@localhost', 'ENABLED', '2024-01-05 09:00:00', NULL, 'seed', '2024-01-05 09:00:00', 'seed', '2024-01-05 09:00:00', 1);

-- 角色预设（R1 全权限，R2~R8 为业务角色模板）
INSERT INTO `org_roles` (`id`, `code`, `name`, `org_scope`, `data_scope`, `status`, `sort`, `remark`, `permissions`, `create_by`, `create_time`, `update_by`, `update_time`, `version`) VALUES
('R1', 'ROLE_ADMIN', '系统管理员', 'GROUP', 'ALL', 'ENABLED', 1, '拥有全部模块权限', '["fa:view","fa:add","fa:edit","fa:delete","fa:export","fa:inbound","fa:dispatch","fa:borrow","fa:change","fa:dispose","fa:inventory","fa:depreciation","fa:report","lv:view","lv:edit","lv:export","lv:inbound","lv:requisition","lv:return","lv:report","wm:view","wm:todo","wm:alert","wm:overview","wm:message","org:company","org:dept","org:user","org:role","sys:dict","sys:log","sys:workflow","sys:params","sys:message","sys:template","sys:terminal","sys:import"]', 'seed', '2024-01-05 09:00:00', 'seed', '2024-01-05 09:00:00', 1),
('R2', 'ROLE_ASSET', '资产管理员', 'COMPANY', 'COMPANY', 'ENABLED', 2, '资产台账/入库/派发/处置/盘点/低值出入库', '["fa:view","fa:add","fa:edit","fa:export","fa:inbound","fa:dispatch","fa:borrow","fa:change","fa:dispose","fa:inventory","fa:depreciation","fa:report","lv:view","lv:edit","lv:export","lv:inbound","lv:requisition","lv:return","lv:report","wm:view","wm:todo","wm:alert","wm:overview","wm:message"]', 'seed', '2024-01-05 09:05:00', 'seed', '2024-01-05 09:05:00', 1),
('R3', 'ROLE_USER', '资产使用人', 'DEPT', 'DEPT_ONLY', 'ENABLED', 3, '普通员工，查看本人资产并发起低值领用/退库', '["fa:view","lv:view","lv:requisition","lv:return","wm:view","wm:todo","wm:message"]', 'seed', '2024-01-05 09:10:00', 'seed', '2024-01-05 09:10:00', 1),
('R4', 'ROLE_FINANCE', '财务管理员', 'COMPANY', 'COMPANY', 'ENABLED', 4, '折旧计提/报表/导出', '["fa:view","fa:export","fa:depreciation","fa:report","lv:view","lv:report","sys:log","wm:view","wm:overview","wm:message"]', 'seed', '2024-01-05 09:15:00', 'seed', '2024-01-05 09:15:00', 1),
('R5', 'ROLE_LEADER', '部门主管', 'DEPT', 'DEPT', 'ENABLED', 5, '部门负责人审批', '["fa:view","fa:edit","fa:dispatch","fa:borrow","fa:inventory","fa:report","lv:view","lv:requisition","lv:report","wm:view","wm:todo","wm:alert","wm:message"]', 'seed', '2024-01-05 09:20:00', 'seed', '2024-01-05 09:20:00', 1),
('R6', 'ROLE_AUDITOR', '审计员', 'GROUP', 'ALL', 'ENABLED', 6, '只读内审', '["fa:view","fa:report","lv:view","lv:report","sys:log","wm:view","wm:overview","wm:message"]', 'seed', '2024-01-05 09:25:00', 'seed', '2024-01-05 09:25:00', 1),
('R7', 'ROLE_VP', '分管副总', 'GROUP', 'ALL', 'ENABLED', 7, '大额资产处置审批', '["fa:view","fa:edit","fa:dispose","fa:report","lv:view","lv:report","wm:view","wm:todo","wm:overview","wm:message"]', 'seed', '2024-01-05 09:30:00', 'seed', '2024-01-05 09:30:00', 1),
('R8', 'ROLE_WAREHOUSE', '仓管员', 'COMPANY', 'COMPANY', 'ENABLED', 8, '低值出库确认', '["fa:view","lv:view","lv:inbound","lv:requisition","lv:return","wm:view","wm:todo","wm:alert","wm:message"]', 'seed', '2024-01-05 09:35:00', 'seed', '2024-01-05 09:35:00', 1);

-- ===== 以下为数据字典（枚举校验 + 下拉选项所必需）=====
INSERT INTO `system_dict_types` (`code`, `name`, `count`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`) VALUES
('asset_status', '资产状态', 6, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('asset_type', '资产分类', 8, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('enable_status', '启停状态', 2, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('doc_status', '单据状态', 5, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('inbound_status', '入库单状态', 3, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('dispatch_status', '派发退库单状态', 2, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('borrow_status', '借出单状态', 3, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('dispose_status', '处置单状态', 2, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('dispose_type', '处置方式', 4, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('change_type', '资产变更类型', 3, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('purchase_mode', '购置方式', 4, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('low_value_status', '低值物品状态', 3, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('low_value_category', '低值资产类别', 4, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('inventory_result', '盘点结果', 4, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('inventory_item_status', '盘点明细状态', 4, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('inventory_counter_status', '盘点单状态', 2, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('depreciation_method', '折旧方法', 4, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('calc_time', '计提频率', 3, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('business_type', '审批业务', 11, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('approve_mode', '审批模式', 3, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('approve_condition', '审批触发条件', 3, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('approve_result', '审批动作结果', 4, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('message_level', '消息级别', 3, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('device_status', '盘点终端状态', 4, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('device_type', '盘点终端类型', 5, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('device_abnormal_type', '终端异常类型', 6, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('param_type', '参数类型', 2, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('data_scope', '角色数据范围', 5, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1),
('org_scope', '角色组织范围', 3, 'ENABLED', NULL, 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1);

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_asset_status_IDLE', '空闲', 'IDLE', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_status'),
('DI_asset_status_IN_USE', '使用中', 'IN_USE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_status'),
('DI_asset_status_DISPATCHING', '派发中', 'DISPATCHING', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_status'),
('DI_asset_status_BORROWED', '借出中', 'BORROWED', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_status'),
('DI_asset_status_REPAIRING', '维修中', 'REPAIRING', 5, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_status'),
('DI_asset_status_DISPOSING', '处置中', 'DISPOSING', 6, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_status');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_asset_type_ELECTRONIC', '电子设备', 'ELECTRONIC', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_type'),
('DI_asset_type_MACHINE', '机械设备', 'MACHINE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_type'),
('DI_asset_type_VEHICLE', '运输设备', 'VEHICLE', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_type'),
('DI_asset_type_FURNITURE', '办公家具', 'FURNITURE', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_type'),
('DI_asset_type_BUILDING', '房屋建筑物', 'BUILDING', 5, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_type'),
('DI_asset_type_SUPPLIES', '办公用品', 'SUPPLIES', 6, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_type'),
('DI_asset_type_MATERIAL', '材料', 'MATERIAL', 7, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_type'),
('DI_asset_type_OTHER', '其他设备', 'OTHER', 8, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_type');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_enable_status_ENABLED', '启用', 'ENABLED', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'enable_status'),
('DI_enable_status_DISABLED', '停用', 'DISABLED', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'enable_status');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_doc_status_DRAFT', '待提交', 'DRAFT', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'doc_status'),
('DI_doc_status_PROCESSING', '进行中', 'PROCESSING', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'doc_status'),
('DI_doc_status_REJECTED', '已驳回', 'REJECTED', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'doc_status'),
('DI_doc_status_REVOKED', '已撤销', 'REVOKED', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'doc_status'),
('DI_doc_status_DONE', '已完结', 'DONE', 5, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'doc_status');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_inbound_status_PENDING', '待验收', 'PENDING', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inbound_status'),
('DI_inbound_status_ACCEPTED', '已验收', 'ACCEPTED', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inbound_status'),
('DI_inbound_status_STORED', '已入库', 'STORED', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inbound_status');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_dispatch_status_DISPATCHED', '已派发', 'DISPATCHED', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'dispatch_status'),
('DI_dispatch_status_RETURNED', '已退库', 'RETURNED', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'dispatch_status');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_borrow_status_BORROWED', '借出中', 'BORROWED', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'borrow_status'),
('DI_borrow_status_OVERDUE', '逾期', 'OVERDUE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'borrow_status'),
('DI_borrow_status_RETURNED', '已归还', 'RETURNED', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'borrow_status');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_dispose_status_PROCESSING', '处置中', 'PROCESSING', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'dispose_status'),
('DI_dispose_status_DONE', '已完成', 'DONE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'dispose_status');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_dispose_type_SCRAP', '报废', 'SCRAP', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'dispose_type'),
('DI_dispose_type_SALE', '变卖', 'SALE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'dispose_type'),
('DI_dispose_type_TRANSFER', '调拨', 'TRANSFER', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'dispose_type'),
('DI_dispose_type_OTHER', '其他', 'OTHER', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'dispose_type');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_change_type_TRANSFER', '调拨', 'TRANSFER', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'change_type'),
('DI_change_type_REPAIR', '维修', 'REPAIR', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'change_type'),
('DI_change_type_OTHER', '其他', 'OTHER', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'change_type');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_purchase_mode_PURCHASE', '购买', 'PURCHASE', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'purchase_mode'),
('DI_purchase_mode_LEASE', '租赁', 'LEASE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'purchase_mode'),
('DI_purchase_mode_SELF_BUILD', '自建', 'SELF_BUILD', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'purchase_mode'),
('DI_purchase_mode_DONATION', '受赠', 'DONATION', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'purchase_mode');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_low_value_status_NORMAL', '正常', 'NORMAL', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'low_value_status'),
('DI_low_value_status_LOW_STOCK', '低库存', 'LOW_STOCK', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'low_value_status'),
('DI_low_value_status_DISABLED', '停用', 'DISABLED', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'low_value_status');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_low_value_category_OFFICE', '办公用品', 'OFFICE', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'low_value_category'),
('DI_low_value_category_WATER', '水', 'WATER', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'low_value_category'),
('DI_low_value_category_PPE', '劳保用品', 'PPE', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'low_value_category'),
('DI_low_value_category_PAPER', '纸品', 'PAPER', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'low_value_category');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_inventory_result_UNCHECKED', '未盘点', 'UNCHECKED', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_result'),
('DI_inventory_result_MATCHED', '相符', 'MATCHED', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_result'),
('DI_inventory_result_SURPLUS', '盘盈', 'SURPLUS', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_result'),
('DI_inventory_result_LOSS', '盘亏', 'LOSS', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_result');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_inventory_item_status_UNCHECKED', '未盘', 'UNCHECKED', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_item_status'),
('DI_inventory_item_status_CHECKED', '已盘', 'CHECKED', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_item_status'),
('DI_inventory_item_status_LOSS', '盘亏', 'LOSS', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_item_status'),
('DI_inventory_item_status_ABNORMAL', '异常', 'ABNORMAL', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_item_status');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_inventory_counter_status_COUNTING', '盘点中', 'COUNTING', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_counter_status'),
('DI_inventory_counter_status_DONE', '已完成', 'DONE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_counter_status');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_depreciation_method_STRAIGHT_LINE', '年限平均法', 'STRAIGHT_LINE', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'depreciation_method'),
('DI_depreciation_method_DOUBLE_DECLINE', '双倍余额递减法', 'DOUBLE_DECLINE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'depreciation_method'),
('DI_depreciation_method_SUM_YEARS', '年数总和法', 'SUM_YEARS', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'depreciation_method'),
('DI_depreciation_method_WORKLOAD', '工作量法', 'WORKLOAD', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'depreciation_method');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_calc_time_MONTHLY', '按月计提', 'MONTHLY', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'calc_time'),
('DI_calc_time_QUARTERLY', '按季计提', 'QUARTERLY', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'calc_time'),
('DI_calc_time_YEARLY', '按年计提', 'YEARLY', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'calc_time');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_business_type_INBOUND', '入库', 'INBOUND', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'business_type'),
('DI_business_type_REQUISITION', '低值领用', 'REQUISITION', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'business_type'),
('DI_business_type_LV_RETURN', '低值退库', 'LV_RETURN', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'business_type'),
('DI_business_type_RETURN', '退库', 'RETURN', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'business_type'),
('DI_business_type_DISPATCH', '派发', 'DISPATCH', 5, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'business_type'),
('DI_business_type_BORROW', '借出', 'BORROW', 6, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'business_type'),
('DI_business_type_TRANSFER', '调拨', 'TRANSFER', 7, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'business_type'),
('DI_business_type_REPAIR', '维修', 'REPAIR', 8, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'business_type'),
('DI_business_type_DISPOSE', '处置', 'DISPOSE', 9, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'business_type'),
('DI_business_type_INVENTORY', '盘点', 'INVENTORY', 10, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'business_type'),
('DI_business_type_CHANGE', '变更', 'CHANGE', 11, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'business_type');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_approve_mode_ANY', '或签', 'ANY', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_mode'),
('DI_approve_mode_SEQUENCE', '依次', 'SEQUENCE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_mode'),
('DI_approve_mode_ALL', '会签', 'ALL', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_mode');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_approve_condition_NONE', '无条件', 'NONE', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_condition'),
('DI_approve_condition_AMOUNT_GT', '单据金额大于', 'AMOUNT_GT', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_condition'),
('DI_approve_condition_HAS_DIFF', '存在盘点差异', 'HAS_DIFF', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_condition');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_approve_result_SUBMIT', '提交', 'SUBMIT', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_result'),
('DI_approve_result_AGREE', '通过', 'AGREE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_result'),
('DI_approve_result_REJECT', '驳回', 'REJECT', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_result'),
('DI_approve_result_REVOKE', '撤销', 'REVOKE', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_result');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_message_level_NORMAL', '普通', 'NORMAL', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'message_level'),
('DI_message_level_IMPORTANT', '重要', 'IMPORTANT', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'message_level'),
('DI_message_level_URGENT', '紧急', 'URGENT', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'message_level');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_device_status_ONLINE', '在线', 'ONLINE', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_status'),
('DI_device_status_OFFLINE', '离线', 'OFFLINE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_status'),
('DI_device_status_MAINTENANCE', '维护中', 'MAINTENANCE', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_status'),
('DI_device_status_DISABLED', '停用', 'DISABLED', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_status');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_device_type_PDA', '手持盘点终端', 'PDA', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_type'),
('DI_device_type_SCANNER', '无线扫码枪', 'SCANNER', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_type'),
('DI_device_type_TABLET', '盘点平板', 'TABLET', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_type'),
('DI_device_type_FIXED', '固定读码器', 'FIXED', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_type'),
('DI_device_type_OTHER', '其他', 'OTHER', 5, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_type');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_device_abnormal_type_UNAUTHORIZED_BIND', '未授权绑定', 'UNAUTHORIZED_BIND', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_abnormal_type'),
('DI_device_abnormal_type_OUT_OF_SCOPE', '越权盘点', 'OUT_OF_SCOPE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_abnormal_type'),
('DI_device_abnormal_type_OFFLINE_UPLOAD', '离线数据未上报', 'OFFLINE_UPLOAD', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_abnormal_type'),
('DI_device_abnormal_type_TAMPERED', '设备异常拆装', 'TAMPERED', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_abnormal_type'),
('DI_device_abnormal_type_DATA_ABNORMAL', '盘点数据异常', 'DATA_ABNORMAL', 5, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_abnormal_type'),
('DI_device_abnormal_type_OTHER', '其他', 'OTHER', 6, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_abnormal_type');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_param_type_SYSTEM', '系统内置', 'SYSTEM', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'param_type'),
('DI_param_type_CUSTOM', '自定义', 'CUSTOM', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'param_type');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_data_scope_ALL', '全部数据', 'ALL', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'data_scope'),
('DI_data_scope_COMPANY', '本公司及以下', 'COMPANY', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'data_scope'),
('DI_data_scope_DEPT', '本部门及以下', 'DEPT', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'data_scope'),
('DI_data_scope_DEPT_ONLY', '本部门', 'DEPT_ONLY', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'data_scope'),
('DI_data_scope_SELF', '仅本人', 'SELF', 5, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'data_scope');

INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_org_scope_GROUP', '全集团', 'GROUP', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'org_scope'),
('DI_org_scope_COMPANY', '本公司', 'COMPANY', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'org_scope'),
('DI_org_scope_DEPT', '本部门', 'DEPT', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'org_scope');

