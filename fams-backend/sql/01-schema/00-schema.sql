-- 由 fams-frontend/tools/export-db.mjs 自动生成，请勿手工修改
-- 来源：fams-frontend/src/services/contract/schema.js（契约单一真源）

SET NAMES utf8mb4;

DROP TABLE IF EXISTS `fixed_assets`;
CREATE TABLE `fixed_assets` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `code` VARCHAR(255) COMMENT '必填 唯一',
  `name` VARCHAR(255) COMMENT '必填',
  `category` VARCHAR(64) COMMENT 'ASSET_CATEGORY 必填',
  `brand` VARCHAR(255),
  `model` VARCHAR(255),
  `company_id` VARCHAR(255) COMMENT '→org-companies',
  `dept_id` VARCHAR(255) COMMENT '→org-departments',
  `user_id` VARCHAR(255) COMMENT '→org-users',
  `location` VARCHAR(255),
  `purchase_date` DATETIME(3),
  `inbound_date` DATETIME(3),
  `amount` DECIMAL(20,6),
  `original` DECIMAL(20,6),
  `net` DECIMAL(20,6),
  `status` VARCHAR(64) COMMENT 'ASSET_STATUS 必填',
  `depreciate` TINYINT(1),
  `purchase_mode` VARCHAR(64) COMMENT 'PURCHASE_MODE',
  `lease_months` BIGINT,
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='固定资产台账';

DROP TABLE IF EXISTS `fixed_asset_inventory_plans`;
CREATE TABLE `fixed_asset_inventory_plans` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `plan_no` VARCHAR(255) COMMENT '必填 唯一',
  `plan_name` VARCHAR(255) COMMENT '必填',
  `scope` VARCHAR(255),
  `counter` VARCHAR(255),
  `plan_date` DATETIME(3),
  `status` VARCHAR(64) COMMENT 'DOC_STATUS 必填',
  `items` TEXT,
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='盘点计划';

DROP TABLE IF EXISTS `fixed_asset_inventory_docs`;
CREATE TABLE `fixed_asset_inventory_docs` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `doc_no` VARCHAR(255) COMMENT '必填 唯一',
  `name` VARCHAR(255) COMMENT '必填',
  `company_id` VARCHAR(255) COMMENT '→org-companies',
  `applicant` VARCHAR(255),
  `creator_id` VARCHAR(255) COMMENT '→org-users',
  `scope` VARCHAR(255),
  `asset_types` TEXT,
  `finish_time` DATETIME(3),
  `remark` VARCHAR(255),
  `status` VARCHAR(64) COMMENT 'DOC_STATUS 必填',
  `items` TEXT,
  `counters` TEXT,
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='盘点单据';

DROP TABLE IF EXISTS `fixed_asset_depreciation_schemes`;
CREATE TABLE `fixed_asset_depreciation_schemes` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `scheme_no` VARCHAR(255) COMMENT '必填 唯一',
  `scheme_name` VARCHAR(255) COMMENT '必填',
  `method` VARCHAR(64) COMMENT 'DEPRECIATION_METHOD 必填',
  `years` DECIMAL(20,6),
  `residual_rate` DECIMAL(20,6),
  `monthly_rate` DECIMAL(20,6),
  `applicable_category` VARCHAR(255),
  `enabled` BOOLEAN, -- 契约 boolean；勿用 TINYINT(1)，否则回读成 0/1 让前端开关判断失效
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='折旧方案';

DROP TABLE IF EXISTS `fixed_asset_depreciation_reports`;
CREATE TABLE `fixed_asset_depreciation_reports` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `period` VARCHAR(255) COMMENT '必填 唯一',
  `opening_value` DECIMAL(20,6),
  `period_depreciation` DECIMAL(20,6),
  `accumulated` DECIMAL(20,6),
  `closing_net` DECIMAL(20,6),
  `asset_count` DECIMAL(20,6),
  `operator` VARCHAR(255),
  `run_date` DATETIME(3),
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='折旧报表';

DROP TABLE IF EXISTS `fixed_asset_report_depreciation_details`;
CREATE TABLE `fixed_asset_report_depreciation_details` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `asset_id` VARCHAR(255) COMMENT '→fixed-assets',
  `name` VARCHAR(255),
  `original_value` DECIMAL(20,6),
  `depreciation_method` VARCHAR(64) COMMENT 'DEPRECIATION_METHOD',
  `useful_life` DECIMAL(20,6),
  `accumulated_depreciation` DECIMAL(20,6),
  `net_value` DECIMAL(20,6),
  `depreciation_rate` DECIMAL(20,6),
  `purchase_date` DATETIME(3),
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='折旧明细';

DROP TABLE IF EXISTS `fixed_asset_report_depreciation_plan_details`;
CREATE TABLE `fixed_asset_report_depreciation_plan_details` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `plan_name` VARCHAR(255),
  `asset_id` VARCHAR(255) COMMENT '→fixed-assets',
  `asset_name` VARCHAR(255),
  `asset_type` VARCHAR(64) COMMENT 'ASSET_CATEGORY',
  `company_id` VARCHAR(255) COMMENT '→org-companies',
  `original` DECIMAL(20,6),
  `residual_rate` DECIMAL(20,6),
  `total_life` DECIMAL(20,6),
  `used_life` DECIMAL(20,6),
  `dep_date` DATETIME(3),
  `finished` TINYINT(1),
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='折旧计划明细';

DROP TABLE IF EXISTS `fixed_asset_settings_locations`;
CREATE TABLE `fixed_asset_settings_locations` (
  `code` VARCHAR(64) NOT NULL COMMENT '主键',
  `name` VARCHAR(255) COMMENT '必填',
  `parent_name` VARCHAR(255),
  `manager` VARCHAR(255),
  `asset_count` DECIMAL(20,6),
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='存放位置';

DROP TABLE IF EXISTS `fixed_asset_settings_location_options`;
CREATE TABLE `fixed_asset_settings_location_options` (
  `code` VARCHAR(64) NOT NULL COMMENT '主键',
  `name` VARCHAR(255) COMMENT '必填',
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='位置候选项';

DROP TABLE IF EXISTS `fixed_asset_settings_categories`;
CREATE TABLE `fixed_asset_settings_categories` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `code` VARCHAR(255) COMMENT '必填 唯一',
  `name` VARCHAR(255) COMMENT '必填',
  `parent_code` VARCHAR(255),
  `parent_name` VARCHAR(255),
  `depreciation_method` VARCHAR(64) COMMENT 'DEPRECIATION_METHOD',
  `useful_life` DECIMAL(20,6),
  `asset_count` DECIMAL(20,6),
  `status` VARCHAR(64) COMMENT 'ENABLE_STATUS 必填',
  `children` TEXT,
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产分类';

DROP TABLE IF EXISTS `fixed_asset_settings_depreciation_rules`;
CREATE TABLE `fixed_asset_settings_depreciation_rules` (
  `name` VARCHAR(64) NOT NULL COMMENT '主键',
  `method` VARCHAR(64) COMMENT 'DEPRECIATION_METHOD 必填',
  `useful_life` DECIMAL(20,6),
  `residual_rate` DECIMAL(20,6),
  `description` VARCHAR(255),
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='折旧规则';

DROP TABLE IF EXISTS `fixed_asset_settings_depreciation_plans`;
CREATE TABLE `fixed_asset_settings_depreciation_plans` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `company_id` VARCHAR(255) COMMENT '→org-companies',
  `name` VARCHAR(255) COMMENT '必填 唯一',
  `method` VARCHAR(64) COMMENT 'DEPRECIATION_METHOD',
  `asset_types` TEXT,
  `residual_rate` DECIMAL(20,6),
  `calc_time` VARCHAR(64) COMMENT 'CALC_TIME',
  `monthly_day` DECIMAL(20,6),
  `purchase_mode` VARCHAR(64) COMMENT 'PURCHASE_MODE',
  `remark` VARCHAR(255),
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='折旧方案（设置）';

DROP TABLE IF EXISTS `low_value_items`;
CREATE TABLE `low_value_items` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `code` VARCHAR(255) COMMENT '必填 唯一',
  `category` VARCHAR(64) COMMENT 'LOW_VALUE_CATEGORY 必填',
  `name` VARCHAR(255) COMMENT '必填',
  `spec` VARCHAR(255),
  `unit` VARCHAR(255),
  `price` DECIMAL(20,6),
  `stock` BIGINT,
  `reserved` BIGINT,
  `safety_stock` BIGINT,
  `location` VARCHAR(255),
  `status` VARCHAR(64) COMMENT 'LOW_VALUE_ITEM_STATUS 必填',
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='低值资产台账';

DROP TABLE IF EXISTS `low_value_inbound`;
CREATE TABLE `low_value_inbound` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `doc_no` VARCHAR(255) COMMENT '必填 唯一',
  `item_id` VARCHAR(255) COMMENT '→low-value-items 必填',
  `category` VARCHAR(64) COMMENT 'LOW_VALUE_CATEGORY',
  `item_name` VARCHAR(255),
  `category_name` VARCHAR(255),
  `spec` VARCHAR(255),
  `unit` VARCHAR(255),
  `quantity` BIGINT COMMENT '必填',
  `price` DECIMAL(20,6),
  `amount` DECIMAL(20,6),
  `dept_id` VARCHAR(255) COMMENT '→org-departments',
  `operator` VARCHAR(255),
  `remark` VARCHAR(255),
  `status` VARCHAR(64) COMMENT 'DOC_STATUS 必填',
  `creator_id` VARCHAR(255) COMMENT '→org-users',
  `submit_time` DATETIME(3),
  `settle_time` DATETIME(3),
  `supplier` VARCHAR(255),
  `inbound_date` DATETIME(3),
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='低值资产入库单';

DROP TABLE IF EXISTS `low_value_requisition`;
CREATE TABLE `low_value_requisition` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `doc_no` VARCHAR(255) COMMENT '必填 唯一',
  `item_id` VARCHAR(255) COMMENT '→low-value-items 必填',
  `category` VARCHAR(64) COMMENT 'LOW_VALUE_CATEGORY',
  `item_name` VARCHAR(255),
  `category_name` VARCHAR(255),
  `spec` VARCHAR(255),
  `unit` VARCHAR(255),
  `quantity` BIGINT COMMENT '必填',
  `price` DECIMAL(20,6),
  `amount` DECIMAL(20,6),
  `dept_id` VARCHAR(255) COMMENT '→org-departments',
  `operator` VARCHAR(255),
  `remark` VARCHAR(255),
  `status` VARCHAR(64) COMMENT 'DOC_STATUS 必填',
  `creator_id` VARCHAR(255) COMMENT '→org-users',
  `submit_time` DATETIME(3),
  `settle_time` DATETIME(3),
  `receiver` VARCHAR(255),
  `requisition_date` DATETIME(3),
  `purpose` VARCHAR(255),
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='低值资产领用单';

DROP TABLE IF EXISTS `low_value_return`;
CREATE TABLE `low_value_return` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `doc_no` VARCHAR(255) COMMENT '必填 唯一',
  `item_id` VARCHAR(255) COMMENT '→low-value-items 必填',
  `category` VARCHAR(64) COMMENT 'LOW_VALUE_CATEGORY',
  `item_name` VARCHAR(255),
  `category_name` VARCHAR(255),
  `spec` VARCHAR(255),
  `unit` VARCHAR(255),
  `quantity` BIGINT COMMENT '必填',
  `price` DECIMAL(20,6),
  `amount` DECIMAL(20,6),
  `dept_id` VARCHAR(255) COMMENT '→org-departments',
  `operator` VARCHAR(255),
  `remark` VARCHAR(255),
  `status` VARCHAR(64) COMMENT 'DOC_STATUS 必填',
  `creator_id` VARCHAR(255) COMMENT '→org-users',
  `submit_time` DATETIME(3),
  `settle_time` DATETIME(3),
  `returner` VARCHAR(255),
  `return_date` DATETIME(3),
  `reason` VARCHAR(255),
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='低值资产退库单';

DROP TABLE IF EXISTS `low_value_settings_locations`;
CREATE TABLE `low_value_settings_locations` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `code` VARCHAR(255) COMMENT '必填 唯一',
  `name` VARCHAR(255) COMMENT '必填',
  `parent_code` VARCHAR(255),
  `parent_name` VARCHAR(255),
  `manager` VARCHAR(255),
  `item_count` DECIMAL(20,6),
  `status` VARCHAR(64) COMMENT 'ENABLE_STATUS 必填',
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='低值资产存放位置';

DROP TABLE IF EXISTS `org_companies`;
CREATE TABLE `org_companies` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `code` VARCHAR(255) COMMENT '必填 唯一',
  `name` VARCHAR(255) COMMENT '必填 唯一',
  `short_name` VARCHAR(255),
  `parent_id` VARCHAR(255) COMMENT '→org-companies',
  `type` VARCHAR(255),
  `credit_code` VARCHAR(255),
  `legal_person` VARCHAR(255),
  `contact` VARCHAR(255),
  `phone` VARCHAR(255),
  `address` VARCHAR(255),
  `status` VARCHAR(64) COMMENT 'ENABLE_STATUS 必填',
  `sort` BIGINT,
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公司';

DROP TABLE IF EXISTS `org_departments`;
CREATE TABLE `org_departments` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `code` VARCHAR(255) COMMENT '必填 唯一',
  `name` VARCHAR(255) COMMENT '必填',
  `parent_id` VARCHAR(255) COMMENT '→org-departments',
  `company_id` VARCHAR(255) COMMENT '→org-companies 必填',
  `leader` VARCHAR(255),
  `headcount` BIGINT,
  `phone` VARCHAR(255),
  `status` VARCHAR(64) COMMENT 'ENABLE_STATUS 必填',
  `sort` BIGINT,
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部门';

DROP TABLE IF EXISTS `org_users`;
CREATE TABLE `org_users` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `username` VARCHAR(255) COMMENT '必填 唯一',
  `password` VARCHAR(255),
  `password_reset_at` DATETIME(3),
  `name` VARCHAR(255) COMMENT '必填',
  `company_id` VARCHAR(255) COMMENT '→org-companies 必填',
  `dept_id` VARCHAR(255) COMMENT '→org-departments',
  `position` VARCHAR(255),
  `role_ids` TEXT,
  `phone` VARCHAR(255),
  `email` VARCHAR(255),
  `status` VARCHAR(64) COMMENT 'ENABLE_STATUS 必填',
  `created_at` DATETIME(3),
  `last_login_at` DATETIME(3),
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户';

DROP TABLE IF EXISTS `org_roles`;
CREATE TABLE `org_roles` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `code` VARCHAR(255) COMMENT '必填 唯一',
  `name` VARCHAR(255) COMMENT '必填 唯一',
  `org_scope` VARCHAR(64) COMMENT 'ORG_SCOPE',
  `data_scope` VARCHAR(64) COMMENT 'DATA_SCOPE',
  `status` VARCHAR(64) COMMENT 'ENABLE_STATUS 必填',
  `sort` BIGINT,
  `remark` VARCHAR(255),
  `permissions` TEXT,
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色';

DROP TABLE IF EXISTS `system_dict_types`;
CREATE TABLE `system_dict_types` (
  `code` VARCHAR(64) NOT NULL COMMENT '主键',
  `name` VARCHAR(255) COMMENT '必填',
  `count` BIGINT,
  `status` VARCHAR(64) COMMENT 'ENABLE_STATUS 必填',
  `remark` VARCHAR(255),
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数据字典类型';

DROP TABLE IF EXISTS `system_params`;
CREATE TABLE `system_params` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `name` VARCHAR(255) COMMENT '必填',
  `key` VARCHAR(255) COMMENT '必填 唯一',
  `value` VARCHAR(255),
  `type` VARCHAR(64) COMMENT 'PARAM_TYPE',
  `remark` VARCHAR(255),
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统参数';

DROP TABLE IF EXISTS `system_workflow_flows`;
CREATE TABLE `system_workflow_flows` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `code` VARCHAR(255) COMMENT '必填 唯一',
  `name` VARCHAR(255) COMMENT '必填',
  `biz_type` VARCHAR(64) COMMENT 'BUSINESS_TYPE 必填',
  `initiator` VARCHAR(255),
  `initiator_role_id` VARCHAR(255) COMMENT '→org-roles',
  `enabled` BOOLEAN, -- 契约 boolean
  `steps` TEXT,
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作流程';

DROP TABLE IF EXISTS `fixed_asset_doc_approvals`;
CREATE TABLE `fixed_asset_doc_approvals` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `doc_key` VARCHAR(255) COMMENT '必填',
  `doc_id` VARCHAR(255) COMMENT '必填',
  `doc_code` VARCHAR(255),
  `biz_type` VARCHAR(64) COMMENT 'BUSINESS_TYPE 必填',
  `flow_id` VARCHAR(255) COMMENT '→system-workflow-flows',
  `flow_code` VARCHAR(255),
  `step_key` VARCHAR(255),
  `step_name` VARCHAR(255),
  `result` VARCHAR(64) COMMENT 'APPROVE_RESULT 必填',
  `comment` VARCHAR(255),
  `approver_id` VARCHAR(255) COMMENT '→org-users',
  `approver_name` VARCHAR(255),
  `approver_role_name` VARCHAR(255),
  `time` DATETIME(3),
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='审批记录';

DROP TABLE IF EXISTS `system_terminal_devices`;
CREATE TABLE `system_terminal_devices` (
  `code` VARCHAR(64) NOT NULL COMMENT '主键',
  `name` VARCHAR(255) COMMENT '必填',
  `type` VARCHAR(64) COMMENT 'DEVICE_TYPE 必填',
  `location` VARCHAR(255),
  `bind_user_id` VARCHAR(255) COMMENT '→org-users',
  `status` VARCHAR(64) COMMENT 'DEVICE_STATUS 必填',
  `last_active` DATETIME(3),
  `vendor` VARCHAR(255),
  `model` VARCHAR(255),
  `sn` VARCHAR(255),
  `ip` VARCHAR(255),
  `install_date` DATETIME(3),
  `maintainer` VARCHAR(255),
  `maintainer_phone` VARCHAR(255),
  `remark` VARCHAR(255),
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='盘点终端';

DROP TABLE IF EXISTS `system_terminal_abnormal`;
CREATE TABLE `system_terminal_abnormal` (
  `record_no` VARCHAR(64) NOT NULL COMMENT '主键',
  `device_code` VARCHAR(255) COMMENT '→system-terminal-devices 必填',
  `operator_id` VARCHAR(255) COMMENT '→org-users',
  `type` VARCHAR(64) COMMENT 'DEVICE_ABNORMAL_TYPE 必填',
  `detail` VARCHAR(255),
  `affected_count` DECIMAL(20,6),
  `handled` TINYINT(1),
  `handle_result` VARCHAR(255),
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`record_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='终端异常记录';

DROP TABLE IF EXISTS `notify_messages`;
CREATE TABLE `notify_messages` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `time` DATETIME(3),
  `type` VARCHAR(255),
  `level` VARCHAR(255),
  `title` VARCHAR(255) COMMENT '必填',
  `content` VARCHAR(255),
  `target` VARCHAR(255),
  `channel` VARCHAR(255),
  `biz_type` VARCHAR(255),
  `biz_id` VARCHAR(255),
  `route` VARCHAR(255),
  `read` TINYINT(1),
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内消息';

DROP TABLE IF EXISTS `notify_templates`;
CREATE TABLE `notify_templates` (
  `key` VARCHAR(64) NOT NULL COMMENT '主键',
  `scene` VARCHAR(255),
  `channel` VARCHAR(255),
  `title` VARCHAR(255),
  `content` VARCHAR(255),
  `enabled` BOOLEAN, -- 契约 boolean
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消息模板';

DROP TABLE IF EXISTS `operation_logs`;
CREATE TABLE `operation_logs` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `time` DATETIME(3),
  `module` VARCHAR(255),
  `action` VARCHAR(255),
  `target` VARCHAR(255),
  `result` VARCHAR(255),
  `detail` VARCHAR(255),
  `ip` VARCHAR(255),
  `operator` VARCHAR(255),
  `operator_org` VARCHAR(255),
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作日志';

DROP TABLE IF EXISTS `fixed_asset_doc_lists_inbound`;
CREATE TABLE `fixed_asset_doc_lists_inbound` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `code` VARCHAR(255) COMMENT '必填 唯一',
  `name` VARCHAR(255) COMMENT '必填',
  `company_id` VARCHAR(255) COMMENT '→org-companies',
  `asset_id` VARCHAR(255) COMMENT '→fixed-assets',
  `creator_id` VARCHAR(255) COMMENT '→org-users',
  `finish_time` DATETIME(3),
  `remark` VARCHAR(255),
  `status` VARCHAR(64) COMMENT 'DOC_STATUS 必填',
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='入库单列表';

DROP TABLE IF EXISTS `fixed_asset_doc_lists_alloc`;
CREATE TABLE `fixed_asset_doc_lists_alloc` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `code` VARCHAR(255) COMMENT '必填 唯一',
  `name` VARCHAR(255) COMMENT '必填',
  `company_id` VARCHAR(255) COMMENT '→org-companies',
  `asset_id` VARCHAR(255) COMMENT '→fixed-assets',
  `creator_id` VARCHAR(255) COMMENT '→org-users',
  `finish_time` DATETIME(3),
  `remark` VARCHAR(255),
  `status` VARCHAR(64) COMMENT 'DOC_STATUS 必填',
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='派发单列表';

DROP TABLE IF EXISTS `fixed_asset_doc_lists_back`;
CREATE TABLE `fixed_asset_doc_lists_back` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `code` VARCHAR(255) COMMENT '必填 唯一',
  `name` VARCHAR(255) COMMENT '必填',
  `company_id` VARCHAR(255) COMMENT '→org-companies',
  `asset_id` VARCHAR(255) COMMENT '→fixed-assets',
  `creator_id` VARCHAR(255) COMMENT '→org-users',
  `finish_time` DATETIME(3),
  `remark` VARCHAR(255),
  `status` VARCHAR(64) COMMENT 'DOC_STATUS 必填',
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='退库单列表';

DROP TABLE IF EXISTS `fixed_asset_doc_lists_borrow`;
CREATE TABLE `fixed_asset_doc_lists_borrow` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `code` VARCHAR(255) COMMENT '必填 唯一',
  `name` VARCHAR(255) COMMENT '必填',
  `company_id` VARCHAR(255) COMMENT '→org-companies',
  `asset_id` VARCHAR(255) COMMENT '→fixed-assets',
  `creator_id` VARCHAR(255) COMMENT '→org-users',
  `finish_time` DATETIME(3),
  `remark` VARCHAR(255),
  `status` VARCHAR(64) COMMENT 'DOC_STATUS 必填',
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='借出单列表';

DROP TABLE IF EXISTS `fixed_asset_doc_lists_transfer`;
CREATE TABLE `fixed_asset_doc_lists_transfer` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `code` VARCHAR(255) COMMENT '必填 唯一',
  `name` VARCHAR(255) COMMENT '必填',
  `company_id` VARCHAR(255) COMMENT '→org-companies',
  `asset_id` VARCHAR(255) COMMENT '→fixed-assets',
  `creator_id` VARCHAR(255) COMMENT '→org-users',
  `finish_time` DATETIME(3),
  `remark` VARCHAR(255),
  `status` VARCHAR(64) COMMENT 'DOC_STATUS 必填',
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='调拨单列表';

DROP TABLE IF EXISTS `fixed_asset_doc_lists_repair`;
CREATE TABLE `fixed_asset_doc_lists_repair` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `code` VARCHAR(255) COMMENT '必填 唯一',
  `name` VARCHAR(255) COMMENT '必填',
  `company_id` VARCHAR(255) COMMENT '→org-companies',
  `asset_id` VARCHAR(255) COMMENT '→fixed-assets',
  `creator_id` VARCHAR(255) COMMENT '→org-users',
  `finish_time` DATETIME(3),
  `remark` VARCHAR(255),
  `status` VARCHAR(64) COMMENT 'DOC_STATUS 必填',
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='维修单列表';

DROP TABLE IF EXISTS `fixed_asset_doc_lists_change`;
CREATE TABLE `fixed_asset_doc_lists_change` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `code` VARCHAR(255) COMMENT '必填 唯一',
  `name` VARCHAR(255) COMMENT '必填',
  `company_id` VARCHAR(255) COMMENT '→org-companies',
  `asset_id` VARCHAR(255) COMMENT '→fixed-assets',
  `creator_id` VARCHAR(255) COMMENT '→org-users',
  `finish_time` DATETIME(3),
  `remark` VARCHAR(255),
  `status` VARCHAR(64) COMMENT 'DOC_STATUS 必填',
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产变更单列表';

DROP TABLE IF EXISTS `fixed_asset_doc_lists_dispose`;
CREATE TABLE `fixed_asset_doc_lists_dispose` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `code` VARCHAR(255) COMMENT '必填 唯一',
  `name` VARCHAR(255) COMMENT '必填',
  `company_id` VARCHAR(255) COMMENT '→org-companies',
  `asset_id` VARCHAR(255) COMMENT '→fixed-assets',
  `creator_id` VARCHAR(255) COMMENT '→org-users',
  `finish_time` DATETIME(3),
  `remark` VARCHAR(255),
  `status` VARCHAR(64) COMMENT 'DOC_STATUS 必填',
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='处置单列表';

DROP TABLE IF EXISTS `system_dict_items`;
CREATE TABLE `system_dict_items` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `label` VARCHAR(255) COMMENT '必填',
  `value` VARCHAR(255) COMMENT '必填',
  `sort` BIGINT,
  `status` VARCHAR(64) COMMENT 'ENABLE_STATUS 必填',
  `remark` VARCHAR(255),
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  `dict_code` VARCHAR(64) NOT NULL COMMENT '所属字典类型',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字典项';

