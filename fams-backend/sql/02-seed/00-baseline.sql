-- 系统基线数据：系统启动即可用所需的最小数据集
-- 说明：内置管理员口令取自 fams.security.bootstrap-password；
--       演示库里的明文口令由 DataInitializer 启动时统一迁移为 BCrypt

SET NAMES utf8mb4;

-- 公司 (org-companies)
INSERT INTO `org_companies` (`id`, `code`, `name`, `short_name`, `parent_id`, `type`, `credit_code`, `legal_person`, `contact`, `phone`, `address`, `status`, `sort`, `create_by`, `create_time`, `update_by`, `update_time`, `version`) VALUES
('C1', 'GS-0001', '华信科技集团有限公司', '华信科技', NULL, '有限责任公司', '91350100MA2X00001X', '陈立', '张伟', '0591-88000001', '福州市鼓楼区五四路100号华信大厦', 'ENABLED', 1, 'seed', '2024-01-05 09:00:00', 'seed', '2026-09-18 10:22:31', 1),
('C2', 'GS-0002', '云鼎资产管理有限公司', '云鼎资产', 'C1', '有限责任公司', '91350100MA2X00002X', '林岚', '郑凯', '0591-88000002', '福州市台江区金融街18号', 'ENABLED', 2, 'seed', '2024-01-05 09:10:00', 'seed', '2026-09-17 15:40:12', 1),
('C3', 'GS-0003', '恒信融资租赁有限公司', '恒信租赁', 'C1', '股份有限公司', '91350100MA2X00003X', '许鸣', '吴迪', '0591-88000003', '福州市仓山区金山大道66号', 'ENABLED', 3, 'seed', '2024-01-05 09:20:00', 'seed', '2026-09-16 09:05:44', 1),
('C4', 'GS-0004', '中天建设集团有限公司', '中天建设', 'C1', '有限责任公司', '91350100MA2X00004X', '赵启明', '赵敏', '0591-88000004', '福州市晋安区福兴大道88号', 'ENABLED', 4, 'seed', '2024-01-05 09:30:00', 'seed', '2026-09-15 14:22:08', 1),
('C5', 'GS-0005', '华信后勤服务有限公司', '华信后勤', 'C1', '有限责任公司', '91350100MA2X00005X', '孙振', '孙磊', '0591-88000005', '福州市鼓楼区华信大厦1层', 'DISABLED', 5, 'seed', '2024-01-05 09:40:00', 'seed', '2026-08-30 11:31:52', 1);

-- 部门 (org-departments)
INSERT INTO `org_departments` (`id`, `code`, `name`, `parent_id`, `company_id`, `leader`, `headcount`, `phone`, `status`, `sort`, `create_by`, `create_time`, `update_by`, `update_time`, `version`) VALUES
('D1', 'BM-0001', '技术部', NULL, 'C1', '张伟', 24, '0591-88000101', 'ENABLED', 1, 'seed', '2024-01-06 09:00:00', 'seed', '2026-09-18 10:22:31', 1),
('D101', 'BM-000101', '研发一组', 'D1', 'C1', '张伟', 10, '0591-88000111', 'ENABLED', 1, 'seed', '2024-01-06 09:05:00', 'seed', '2026-09-17 16:48:20', 1),
('D102', 'BM-000102', '运维组', 'D1', 'C1', '高翔', 8, '0591-88000112', 'ENABLED', 2, 'seed', '2024-01-06 09:10:00', 'seed', '2026-09-16 08:55:03', 1),
('D2', 'BM-0002', '财务部', NULL, 'C1', '李娜', 12, '0591-88000102', 'ENABLED', 2, 'seed', '2024-01-06 09:15:00', 'seed', '2026-09-15 13:26:47', 1),
('D3', 'BM-0003', '行政部', NULL, 'C1', '王强', 9, '0591-88000103', 'ENABLED', 3, 'seed', '2024-01-06 09:20:00', 'seed', '2026-09-14 11:19:40', 1),
('D4', 'BM-0004', '运营部', NULL, 'C1', '刘洋', 15, '0591-88000104', 'ENABLED', 4, 'seed', '2024-01-06 09:25:00', 'seed', '2026-09-13 17:04:11', 1),
('D5', 'BM-0005', '市场部', NULL, 'C1', '何欣', 11, '0591-88000105', 'ENABLED', 5, 'seed', '2024-01-06 09:30:00', 'seed', '2026-09-12 09:38:56', 1),
('D6', 'BM-0006', '生产部', NULL, 'C1', '陈刚', 60, '0591-88000106', 'ENABLED', 6, 'seed', '2024-01-06 09:35:00', 'seed', '2026-09-11 14:51:29', 1),
('D7', 'BM-0007', '仓储部', NULL, 'C1', '冯涛', 18, '0591-88000107', 'ENABLED', 7, 'seed', '2024-01-06 09:40:00', 'seed', '2026-09-10 10:12:35', 1),
('D8', 'BM-0008', '资产管理部', NULL, 'C2', '周静', 14, '0591-88000201', 'ENABLED', 1, 'seed', '2024-01-06 09:45:00', 'seed', '2026-09-09 15:40:08', 1),
('D9', 'BM-0009', '财务部', NULL, 'C2', '郑凯', 8, '0591-88000202', 'ENABLED', 2, 'seed', '2024-01-06 09:50:00', 'seed', '2026-09-08 11:31:52', 1),
('D10', 'BM-0010', '租赁业务部', NULL, 'C3', '吴迪', 16, '0591-88000301', 'ENABLED', 1, 'seed', '2024-01-06 09:55:00', 'seed', '2026-09-07 16:48:20', 1),
('D11', 'BM-0011', '风控合规部', NULL, 'C3', '高翔', 7, '0591-88000302', 'ENABLED', 2, 'seed', '2024-01-06 10:00:00', 'seed', '2026-09-06 08:55:03', 1),
('D12', 'BM-0012', '工程管理部', NULL, 'C4', '赵敏', 42, '0591-88000401', 'ENABLED', 1, 'seed', '2024-01-06 10:05:00', 'seed', '2026-09-05 13:26:47', 1),
('D13', 'BM-0013', '物资采购部', NULL, 'C4', '周芳', 10, '0591-88000402', 'ENABLED', 2, 'seed', '2024-01-06 10:10:00', 'seed', '2026-09-04 11:19:40', 1),
('D14', 'BM-0014', '后勤保障部', NULL, 'C5', '孙磊', 20, '0591-88000501', 'DISABLED', 1, 'seed', '2024-01-06 10:15:00', 'seed', '2026-08-30 09:14:18', 1);

-- 用户 (org-users)
INSERT INTO `org_users` (`id`, `username`, `password`, `password_reset_at`, `name`, `company_id`, `dept_id`, `position`, `role_ids`, `phone`, `email`, `status`, `created_at`, `last_login_at`, `create_by`, `create_time`, `update_by`, `update_time`, `version`) VALUES
('U1', 'admin', '123456', NULL, '系统管理员', 'C1', 'D1', '信息中心主任', '["R1"]', '13800000001', 'admin@huaxin.com', 'ENABLED', '2024-01-05 09:00:00', '2026-10-22 09:12:33', 'seed', '2024-01-05 09:00:00', 'seed', '2026-10-22 09:12:33', 1);

-- 角色 (org-roles)
INSERT INTO `org_roles` (`id`, `code`, `name`, `org_scope`, `data_scope`, `status`, `sort`, `remark`, `permissions`, `create_by`, `create_time`, `update_by`, `update_time`, `version`) VALUES
('R1', 'ROLE_ADMIN', '系统管理员', 'GROUP', 'ALL', 'ENABLED', 1, '拥有全部模块权限，负责系统配置与组织架构维护', '["fa:view","fa:add","fa:edit","fa:delete","fa:export","fa:inbound","fa:dispatch","fa:borrow","fa:change","fa:dispose","fa:inventory","fa:depreciation","fa:report","lv:view","lv:edit","lv:export","lv:inbound","lv:requisition","lv:return","lv:report","wm:view","wm:todo","wm:alert","wm:overview","wm:message","org:company","org:dept","org:user","org:role","sys:dict","sys:log","sys:workflow","sys:params","sys:message","sys:template","sys:terminal"]', 'seed', '2024-01-05 09:00:00', 'seed', '2026-09-18 10:22:31', 1),
('R2', 'ROLE_ASSET', '资产管理员', 'COMPANY', 'COMPANY', 'ENABLED', 2, '负责资产台账、入库、派发、处置、盘点与低值资产出入库', '["fa:view","fa:add","fa:edit","fa:export","fa:inbound","fa:dispatch","fa:borrow","fa:change","fa:dispose","fa:inventory","fa:depreciation","fa:report","lv:view","lv:edit","lv:export","lv:inbound","lv:requisition","lv:return","lv:report","wm:view","wm:todo","wm:alert","wm:overview","wm:message"]', 'seed', '2024-01-05 09:05:00', 'seed', '2026-09-17 15:40:12', 1),
('R3', 'ROLE_USER', '资产使用人', 'DEPT', 'DEPT_ONLY', 'ENABLED', 3, '普通员工，可查看本人名下资产并发起低值资产领用/退库', '["fa:view","lv:view","lv:requisition","lv:return","wm:view","wm:todo","wm:message"]', 'seed', '2024-01-05 09:10:00', 'seed', '2026-09-16 09:05:44', 1),
('R4', 'ROLE_FINANCE', '财务管理员', 'COMPANY', 'COMPANY', 'ENABLED', 4, '负责折旧计提、资产报表与导出', '["fa:view","fa:export","fa:depreciation","fa:report","lv:view","lv:report","sys:log","wm:view","wm:overview","wm:message"]', 'seed', '2024-01-05 09:15:00', 'seed', '2026-09-15 14:22:08', 1),
('R5', 'ROLE_LEADER', '部门主管', 'DEPT', 'DEPT', 'ENABLED', 5, '部门负责人，可审批本部门资产业务单据', '["fa:view","fa:edit","fa:dispatch","fa:borrow","fa:inventory","fa:report","lv:view","lv:requisition","lv:report","wm:view","wm:todo","wm:alert","wm:message"]', 'seed', '2024-01-05 09:20:00', 'seed', '2026-09-14 11:31:52', 1),
('R6', 'ROLE_AUDITOR', '审计员', 'GROUP', 'ALL', 'ENABLED', 6, '只读权限，用于内审与合规检查', '["fa:view","fa:report","lv:view","lv:report","sys:log","wm:view","wm:overview","wm:message"]', 'seed', '2024-01-05 09:25:00', 'seed', '2026-09-13 16:48:20', 1),
('R7', 'ROLE_VP', '分管副总', 'GROUP', 'ALL', 'ENABLED', 7, '资产处置流程中大额资产（原值 20 万以上）的分管领导审批环节', '["fa:view","fa:edit","fa:dispose","fa:report","lv:view","lv:report","wm:view","wm:todo","wm:overview","wm:message"]', 'seed', '2024-01-05 09:30:00', 'seed', '2026-09-12 15:20:10', 1),
('R8', 'ROLE_WAREHOUSE', '仓管员', 'COMPANY', 'COMPANY', 'ENABLED', 8, '低值资产领用流程中的出库确认环节，同时负责低值物品出入库', '["fa:view","lv:view","lv:inbound","lv:requisition","lv:return","wm:view","wm:todo","wm:alert","wm:message"]', 'seed', '2024-01-05 09:35:00', 'seed', '2026-09-11 10:05:33', 1);

-- 数据字典类型 (system-dict-types)
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

-- 字典项 (system-dict-types-asset_status-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_asset_status_IDLE', '空闲', 'IDLE', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_status'),
('DI_asset_status_IN_USE', '使用中', 'IN_USE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_status'),
('DI_asset_status_DISPATCHING', '派发中', 'DISPATCHING', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_status'),
('DI_asset_status_BORROWED', '借出中', 'BORROWED', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_status'),
('DI_asset_status_REPAIRING', '维修中', 'REPAIRING', 5, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_status'),
('DI_asset_status_DISPOSING', '处置中', 'DISPOSING', 6, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_status');

-- 字典项 (system-dict-types-asset_type-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_asset_type_ELECTRONIC', '电子设备', 'ELECTRONIC', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_type'),
('DI_asset_type_MACHINE', '机械设备', 'MACHINE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_type'),
('DI_asset_type_VEHICLE', '运输设备', 'VEHICLE', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_type'),
('DI_asset_type_FURNITURE', '办公家具', 'FURNITURE', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_type'),
('DI_asset_type_BUILDING', '房屋建筑物', 'BUILDING', 5, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_type'),
('DI_asset_type_SUPPLIES', '办公用品', 'SUPPLIES', 6, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_type'),
('DI_asset_type_MATERIAL', '材料', 'MATERIAL', 7, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_type'),
('DI_asset_type_OTHER', '其他设备', 'OTHER', 8, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'asset_type');

-- 字典项 (system-dict-types-enable_status-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_enable_status_ENABLED', '启用', 'ENABLED', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'enable_status'),
('DI_enable_status_DISABLED', '停用', 'DISABLED', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'enable_status');

-- 字典项 (system-dict-types-doc_status-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_doc_status_DRAFT', '待提交', 'DRAFT', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'doc_status'),
('DI_doc_status_PROCESSING', '进行中', 'PROCESSING', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'doc_status'),
('DI_doc_status_REJECTED', '已驳回', 'REJECTED', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'doc_status'),
('DI_doc_status_REVOKED', '已撤销', 'REVOKED', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'doc_status'),
('DI_doc_status_DONE', '已完结', 'DONE', 5, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'doc_status');

-- 字典项 (system-dict-types-inbound_status-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_inbound_status_PENDING', '待验收', 'PENDING', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inbound_status'),
('DI_inbound_status_ACCEPTED', '已验收', 'ACCEPTED', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inbound_status'),
('DI_inbound_status_STORED', '已入库', 'STORED', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inbound_status');

-- 字典项 (system-dict-types-dispatch_status-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_dispatch_status_DISPATCHED', '已派发', 'DISPATCHED', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'dispatch_status'),
('DI_dispatch_status_RETURNED', '已退库', 'RETURNED', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'dispatch_status');

-- 字典项 (system-dict-types-borrow_status-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_borrow_status_BORROWED', '借出中', 'BORROWED', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'borrow_status'),
('DI_borrow_status_OVERDUE', '逾期', 'OVERDUE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'borrow_status'),
('DI_borrow_status_RETURNED', '已归还', 'RETURNED', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'borrow_status');

-- 字典项 (system-dict-types-dispose_status-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_dispose_status_PROCESSING', '处置中', 'PROCESSING', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'dispose_status'),
('DI_dispose_status_DONE', '已完成', 'DONE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'dispose_status');

-- 字典项 (system-dict-types-dispose_type-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_dispose_type_SCRAP', '报废', 'SCRAP', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'dispose_type'),
('DI_dispose_type_SALE', '变卖', 'SALE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'dispose_type'),
('DI_dispose_type_TRANSFER', '调拨', 'TRANSFER', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'dispose_type'),
('DI_dispose_type_OTHER', '其他', 'OTHER', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'dispose_type');

-- 字典项 (system-dict-types-change_type-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_change_type_TRANSFER', '调拨', 'TRANSFER', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'change_type'),
('DI_change_type_REPAIR', '维修', 'REPAIR', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'change_type'),
('DI_change_type_OTHER', '其他', 'OTHER', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'change_type');

-- 字典项 (system-dict-types-purchase_mode-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_purchase_mode_PURCHASE', '购买', 'PURCHASE', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'purchase_mode'),
('DI_purchase_mode_LEASE', '租赁', 'LEASE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'purchase_mode'),
('DI_purchase_mode_SELF_BUILD', '自建', 'SELF_BUILD', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'purchase_mode'),
('DI_purchase_mode_DONATION', '受赠', 'DONATION', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'purchase_mode');

-- 字典项 (system-dict-types-low_value_status-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_low_value_status_NORMAL', '正常', 'NORMAL', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'low_value_status'),
('DI_low_value_status_LOW_STOCK', '低库存', 'LOW_STOCK', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'low_value_status'),
('DI_low_value_status_DISABLED', '停用', 'DISABLED', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'low_value_status');

-- 字典项 (system-dict-types-low_value_category-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_low_value_category_OFFICE', '办公用品', 'OFFICE', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'low_value_category'),
('DI_low_value_category_WATER', '水', 'WATER', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'low_value_category'),
('DI_low_value_category_PPE', '劳保用品', 'PPE', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'low_value_category'),
('DI_low_value_category_PAPER', '纸品', 'PAPER', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'low_value_category');

-- 字典项 (system-dict-types-inventory_result-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_inventory_result_UNCHECKED', '未盘点', 'UNCHECKED', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_result'),
('DI_inventory_result_MATCHED', '相符', 'MATCHED', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_result'),
('DI_inventory_result_SURPLUS', '盘盈', 'SURPLUS', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_result'),
('DI_inventory_result_LOSS', '盘亏', 'LOSS', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_result');

-- 字典项 (system-dict-types-inventory_item_status-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_inventory_item_status_UNCHECKED', '未盘', 'UNCHECKED', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_item_status'),
('DI_inventory_item_status_CHECKED', '已盘', 'CHECKED', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_item_status'),
('DI_inventory_item_status_LOSS', '盘亏', 'LOSS', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_item_status'),
('DI_inventory_item_status_ABNORMAL', '异常', 'ABNORMAL', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_item_status');

-- 字典项 (system-dict-types-inventory_counter_status-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_inventory_counter_status_COUNTING', '盘点中', 'COUNTING', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_counter_status'),
('DI_inventory_counter_status_DONE', '已完成', 'DONE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'inventory_counter_status');

-- 字典项 (system-dict-types-depreciation_method-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_depreciation_method_STRAIGHT_LINE', '年限平均法', 'STRAIGHT_LINE', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'depreciation_method'),
('DI_depreciation_method_DOUBLE_DECLINE', '双倍余额递减法', 'DOUBLE_DECLINE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'depreciation_method'),
('DI_depreciation_method_SUM_YEARS', '年数总和法', 'SUM_YEARS', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'depreciation_method'),
('DI_depreciation_method_WORKLOAD', '工作量法', 'WORKLOAD', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'depreciation_method');

-- 字典项 (system-dict-types-calc_time-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_calc_time_MONTHLY', '按月计提', 'MONTHLY', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'calc_time'),
('DI_calc_time_QUARTERLY', '按季计提', 'QUARTERLY', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'calc_time'),
('DI_calc_time_YEARLY', '按年计提', 'YEARLY', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'calc_time');

-- 字典项 (system-dict-types-business_type-items)
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

-- 字典项 (system-dict-types-approve_mode-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_approve_mode_ANY', '或签', 'ANY', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_mode'),
('DI_approve_mode_SEQUENCE', '依次', 'SEQUENCE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_mode'),
('DI_approve_mode_ALL', '会签', 'ALL', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_mode');

-- 字典项 (system-dict-types-approve_condition-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_approve_condition_NONE', '无条件', 'NONE', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_condition'),
('DI_approve_condition_AMOUNT_GT', '单据金额大于', 'AMOUNT_GT', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_condition'),
('DI_approve_condition_HAS_DIFF', '存在盘点差异', 'HAS_DIFF', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_condition');

-- 字典项 (system-dict-types-approve_result-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_approve_result_SUBMIT', '提交', 'SUBMIT', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_result'),
('DI_approve_result_AGREE', '通过', 'AGREE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_result'),
('DI_approve_result_REJECT', '驳回', 'REJECT', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_result'),
('DI_approve_result_REVOKE', '撤销', 'REVOKE', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'approve_result');

-- 字典项 (system-dict-types-message_level-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_message_level_NORMAL', '普通', 'NORMAL', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'message_level'),
('DI_message_level_IMPORTANT', '重要', 'IMPORTANT', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'message_level'),
('DI_message_level_URGENT', '紧急', 'URGENT', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'message_level');

-- 字典项 (system-dict-types-device_status-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_device_status_ONLINE', '在线', 'ONLINE', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_status'),
('DI_device_status_OFFLINE', '离线', 'OFFLINE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_status'),
('DI_device_status_MAINTENANCE', '维护中', 'MAINTENANCE', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_status'),
('DI_device_status_DISABLED', '停用', 'DISABLED', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_status');

-- 字典项 (system-dict-types-device_type-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_device_type_PDA', '手持盘点终端', 'PDA', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_type'),
('DI_device_type_SCANNER', '无线扫码枪', 'SCANNER', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_type'),
('DI_device_type_TABLET', '盘点平板', 'TABLET', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_type'),
('DI_device_type_FIXED', '固定读码器', 'FIXED', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_type'),
('DI_device_type_OTHER', '其他', 'OTHER', 5, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_type');

-- 字典项 (system-dict-types-device_abnormal_type-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_device_abnormal_type_UNAUTHORIZED_BIND', '未授权绑定', 'UNAUTHORIZED_BIND', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_abnormal_type'),
('DI_device_abnormal_type_OUT_OF_SCOPE', '越权盘点', 'OUT_OF_SCOPE', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_abnormal_type'),
('DI_device_abnormal_type_OFFLINE_UPLOAD', '离线数据未上报', 'OFFLINE_UPLOAD', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_abnormal_type'),
('DI_device_abnormal_type_TAMPERED', '设备异常拆装', 'TAMPERED', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_abnormal_type'),
('DI_device_abnormal_type_DATA_ABNORMAL', '盘点数据异常', 'DATA_ABNORMAL', 5, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_abnormal_type'),
('DI_device_abnormal_type_OTHER', '其他', 'OTHER', 6, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'device_abnormal_type');

-- 字典项 (system-dict-types-param_type-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_param_type_SYSTEM', '系统内置', 'SYSTEM', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'param_type'),
('DI_param_type_CUSTOM', '自定义', 'CUSTOM', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'param_type');

-- 字典项 (system-dict-types-data_scope-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_data_scope_ALL', '全部数据', 'ALL', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'data_scope'),
('DI_data_scope_COMPANY', '本公司及以下', 'COMPANY', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'data_scope'),
('DI_data_scope_DEPT', '本部门及以下', 'DEPT', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'data_scope'),
('DI_data_scope_DEPT_ONLY', '本部门', 'DEPT_ONLY', 4, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'data_scope'),
('DI_data_scope_SELF', '仅本人', 'SELF', 5, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'data_scope');

-- 字典项 (system-dict-types-org_scope-items)
INSERT INTO `system_dict_items` (`id`, `label`, `value`, `sort`, `status`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`, `dict_code`) VALUES
('DI_org_scope_GROUP', '全集团', 'GROUP', 1, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'org_scope'),
('DI_org_scope_COMPANY', '本公司', 'COMPANY', 2, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'org_scope'),
('DI_org_scope_DEPT', '本部门', 'DEPT', 3, 'ENABLED', '', 'seed', '2026-01-06 09:00:00', 'seed', '2026-09-12 14:30:21', 1, 'org_scope');

-- 系统参数 (system-params)
INSERT INTO `system_params` (`id`, `name`, `key`, `value`, `type`, `remark`, `create_by`, `create_time`, `update_by`, `update_time`, `version`) VALUES
('SP01', '资产编号前缀', 'sys.asset.code.prefix', 'GD', 'SYSTEM', '生成资产卡片编号的前缀', 'seed', '2026-01-06 11:00:00', 'seed', '2026-10-20 09:12:00', 1),
('SP02', '低值物品编号前缀', 'sys.lowvalue.code.prefix', 'DZ', 'SYSTEM', '生成低值物品编码的前缀', 'seed', '2026-01-06 11:05:00', 'seed', '2026-10-19 14:30:00', 1),
('SP03', '折旧计提日', 'sys.depreciation.day', '1', 'SYSTEM', '每月计提折旧的日期', 'seed', '2026-01-06 11:10:00', 'seed', '2026-10-18 10:05:00', 1),
('SP04', '盘点提醒提前天数', 'sys.inventory.remind.days', '7', 'SYSTEM', '盘点截止前多少天开始提醒', 'seed', '2026-01-06 11:15:00', 'seed', '2026-10-17 16:40:00', 1),
('SP05', '附件大小上限(MB)', 'sys.upload.maxSize', '20', 'SYSTEM', '单个附件上传大小上限', 'seed', '2026-01-06 11:20:00', 'seed', '2026-10-16 11:25:00', 1),
('SP06', '消息保留天数', 'sys.message.keepDays', '90', 'CUSTOM', '站内消息保留天数，超时自动清理', 'seed', '2026-03-01 09:00:00', 'seed', '2026-10-15 09:00:00', 1),
('SP07', '低库存预警阈值', 'sys.lowvalue.safetyRatio', '0.2', 'CUSTOM', '库存低于安全库存比例时预警', 'seed', '2026-03-01 09:05:00', 'seed', '2026-10-14 15:20:00', 1),
('SP08', '盘点终端心跳超时(分钟)', 'sys.terminal.heartbeat', '5', 'CUSTOM', '盘点终端超过该时间未心跳视为离线', 'seed', '2026-03-01 09:10:00', 'seed', '2026-10-13 13:45:00', 1),
('SP09', '审批滞留超时天数', 'sys.approval.timeout.days', '5', 'CUSTOM', '单据在审批中停留超过该天数仍未处理，工作台预警中心提示', 'seed', '2026-03-01 09:15:00', 'seed', '2026-10-12 09:15:00', 1),
('SP10', '驳回重提期限(天)', 'sys.approval.reject.retryDays', '3', 'CUSTOM', '单据被驳回后超过该天数未重新提交，工作台预警中心提示', 'seed', '2026-03-01 09:20:00', 'seed', '2026-10-11 09:20:00', 1);

-- 工作流程 (system-workflow-flows)
INSERT INTO `system_workflow_flows` (`id`, `code`, `name`, `biz_type`, `initiator`, `initiator_role_id`, `enabled`, `steps`, `create_by`, `create_time`, `update_by`, `update_time`, `version`) VALUES
('WF1', 'FLOW_INBOUND', '资产入库验收流程', 'INBOUND', '资产管理员', 'R2', 1, '[{"key":"s1","name":"仓管验收","approverRoleId":"R8","approver":"仓管员","mode":"ANY","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s2","name":"资产管理员复核","approverRoleId":"R2","approver":"资产管理员","mode":"SEQUENCE","conditionType":"NONE","conditionValue":0,"condition":"无条件"}]', 'seed', '2026-01-06 12:00:00', 'seed', '2026-10-22 09:10:00', 1),
('WF2', 'FLOW_DISPATCH', '资产派发流程', 'DISPATCH', '资产管理员', 'R2', 1, '[{"key":"s1","name":"使用部门确认","approverRoleId":"R5","approver":"部门主管","mode":"ANY","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s2","name":"资产管理员登记","approverRoleId":"R2","approver":"资产管理员","mode":"SEQUENCE","conditionType":"NONE","conditionValue":0,"condition":"无条件"}]', 'seed', '2026-01-06 12:05:00', 'seed', '2026-10-22 09:10:00', 1),
('WF3', 'FLOW_RETURN', '资产退库流程', 'RETURN', '资产使用人', 'R3', 1, '[{"key":"s1","name":"部门主管确认","approverRoleId":"R5","approver":"部门主管","mode":"ANY","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s2","name":"仓管员验收入库","approverRoleId":"R8","approver":"仓管员","mode":"SEQUENCE","conditionType":"NONE","conditionValue":0,"condition":"无条件"}]', 'seed', '2026-01-06 12:10:00', 'seed', '2026-10-22 09:10:00', 1),
('WF4', 'FLOW_BORROW', '资产借出流程', 'BORROW', '资产使用人', 'R3', 1, '[{"key":"s1","name":"部门主管审批","approverRoleId":"R5","approver":"部门主管","mode":"ANY","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s2","name":"资产管理员审核","approverRoleId":"R2","approver":"资产管理员","mode":"SEQUENCE","conditionType":"NONE","conditionValue":0,"condition":"无条件"}]', 'seed', '2026-01-06 12:15:00', 'seed', '2026-10-22 09:10:00', 1),
('WF5', 'FLOW_TRANSFER', '资产调拨流程', 'TRANSFER', '资产管理员', 'R2', 1, '[{"key":"s1","name":"调出部门主管审批","approverRoleId":"R5","approver":"部门主管","mode":"ANY","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s2","name":"资产管理员办理调拨","approverRoleId":"R2","approver":"资产管理员","mode":"SEQUENCE","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s3","name":"大额调拨分管副总审批","approverRoleId":"R7","approver":"分管副总","mode":"ANY","conditionType":"AMOUNT_GT","conditionValue":200000,"condition":"单据金额大于 200000 元"}]', 'seed', '2026-01-06 12:20:00', 'seed', '2026-10-22 09:10:00', 1),
('WF6', 'FLOW_REPAIR', '资产维修流程', 'REPAIR', '资产使用人', 'R3', 1, '[{"key":"s1","name":"部门主管审批","approverRoleId":"R5","approver":"部门主管","mode":"ANY","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s2","name":"资产管理员审核","approverRoleId":"R2","approver":"资产管理员","mode":"SEQUENCE","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s3","name":"大额维修分管副总审批","approverRoleId":"R7","approver":"分管副总","mode":"ANY","conditionType":"AMOUNT_GT","conditionValue":50000,"condition":"单据金额大于 50000 元"}]', 'seed', '2026-01-06 12:25:00', 'seed', '2026-10-22 09:10:00', 1),
('WF7', 'FLOW_CHANGE', '资产变更流程', 'CHANGE', '资产使用人', 'R3', 1, '[{"key":"s1","name":"调出部门主管审批","approverRoleId":"R5","approver":"部门主管","mode":"ANY","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s2","name":"资产管理员确认","approverRoleId":"R2","approver":"资产管理员","mode":"SEQUENCE","conditionType":"NONE","conditionValue":0,"condition":"无条件"}]', 'seed', '2026-01-06 12:30:00', 'seed', '2026-10-22 09:10:00', 1),
('WF8', 'FLOW_DISPOSE', '资产处置流程', 'DISPOSE', '资产管理员', 'R2', 1, '[{"key":"s1","name":"部门主管审批","approverRoleId":"R5","approver":"部门主管","mode":"ANY","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s2","name":"财务管理员复核","approverRoleId":"R4","approver":"财务管理员","mode":"ANY","conditionType":"AMOUNT_GT","conditionValue":50000,"condition":"单据金额大于 50000 元"},{"key":"s3","name":"分管副总审批","approverRoleId":"R7","approver":"分管副总","mode":"ALL","conditionType":"AMOUNT_GT","conditionValue":200000,"condition":"单据金额大于 200000 元"},{"key":"s4","name":"审计员备案","approverRoleId":"R6","approver":"审计员","mode":"ANY","conditionType":"AMOUNT_GT","conditionValue":200000,"condition":"单据金额大于 200000 元"}]', 'seed', '2026-01-06 12:35:00', 'seed', '2026-10-22 09:10:00', 1),
('WF9', 'FLOW_INVENTORY', '资产盘点流程', 'INVENTORY', '资产管理员', 'R2', 1, '[{"key":"s1","name":"盘点结果确认","approverRoleId":"R2","approver":"资产管理员","mode":"ANY","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s2","name":"盘点差异复核","approverRoleId":"R2","approver":"资产管理员","mode":"ANY","conditionType":"HAS_DIFF","conditionValue":0,"condition":"存在盘点差异"},{"key":"s3","name":"审计抽查确认","approverRoleId":"R6","approver":"审计员","mode":"ANY","conditionType":"HAS_DIFF","conditionValue":0,"condition":"存在盘点差异"}]', 'seed', '2026-01-06 12:40:00', 'seed', '2026-10-22 09:10:00', 1),
('WF10', 'FLOW_LV_REQUISITION', '低值资产领用流程', 'REQUISITION', '资产使用人', 'R3', 1, '[{"key":"s1","name":"部门主管审批","approverRoleId":"R5","approver":"部门主管","mode":"ANY","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s2","name":"仓管员出库确认","approverRoleId":"R8","approver":"仓管员","mode":"SEQUENCE","conditionType":"NONE","conditionValue":0,"condition":"无条件"}]', 'seed', '2026-01-06 12:45:00', 'seed', '2026-10-22 09:10:00', 1),
('WF11', 'FLOW_LV_RETURN', '低值资产退库流程', 'LV_RETURN', '资产使用人', 'R3', 1, '[{"key":"s1","name":"部门主管确认","approverRoleId":"R5","approver":"部门主管","mode":"ANY","conditionType":"NONE","conditionValue":0,"condition":"无条件"},{"key":"s2","name":"仓管员验收入库","approverRoleId":"R8","approver":"仓管员","mode":"SEQUENCE","conditionType":"NONE","conditionValue":0,"condition":"无条件"}]', 'seed', '2026-01-06 12:50:00', 'seed', '2026-10-22 09:10:00', 1);

