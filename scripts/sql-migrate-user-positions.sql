-- 一人多岗迁移：新增岗位子表 + 迁移陈福沨（18900220150）三重岗位
-- 幂等：建表用 IF NOT EXISTS；岗位按固定 id 先删后插；主表回写主职。
-- 执行：mysql -uroot -p -h127.0.0.1 fams < scripts/sql-migrate-user-positions.sql

CREATE TABLE IF NOT EXISTS `org_user_positions` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `user_id` VARCHAR(255) COMMENT '→org-users 必填',
  `company_id` VARCHAR(255) COMMENT '→org-companies 必填',
  `dept_id` VARCHAR(255) COMMENT '→org-departments',
  `position` VARCHAR(255),
  `role_ids` TEXT,
  `is_primary` TINYINT(1),
  `status` VARCHAR(64) COMMENT 'ENABLE_STATUS 必填',
  `sort` BIGINT,
  `create_by` VARCHAR(64) COMMENT '创建人',
  `create_time` DATETIME(3) COMMENT '创建时间',
  `update_by` VARCHAR(64) COMMENT '更新人',
  `update_time` DATETIME(3) COMMENT '更新时间',
  `version` INT DEFAULT 1 COMMENT '乐观锁版本',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户岗位';

-- 幂等清理这三个岗位（仅针对本账号的本批固定 id，不碰其它数据）
DELETE FROM `org_user_positions`
 WHERE `user_id` = 'mvsv04io114'
   AND `id` IN ('pos-chenfz-primary','pos-chenfz-research','pos-chenfz-newview');

-- 主职：至臻公司领导 / 至臻医疗副总经理（主持工作）—— 领导班子角色（ALL，含审批）
INSERT INTO `org_user_positions`
  (`id`,`user_id`,`company_id`,`dept_id`,`position`,`role_ids`,`is_primary`,`status`,`sort`,`create_by`,`create_time`,`update_by`,`update_time`,`version`)
VALUES
  ('pos-chenfz-primary','mvsv04io114','mvsv021z38','mvsv023p63','至臻医疗副总经理（主持工作）','["mvu9z81n35"]',1,'ENABLED',1,'system',NOW(),'system',NOW(),1),
  ('pos-chenfz-research','mvsv04io114','mvsv021s37','mvsv022w47','产品研发二部副经理','["R5"]',0,'ENABLED',2,'system',NOW(),'system',NOW(),1),
  ('pos-chenfz-newview','mvsv04io114','mvsv022039','mvsv023t65','副总经理(主持工作)','["mvu9z81n35"]',0,'ENABLED',3,'system',NOW(),'system',NOW(),1);

-- 主表回写主职字段（公司/部门/岗位/角色 单值冗余，兼容既有代码）
UPDATE `org_users`
   SET `company_id` = 'mvsv021z38',
       `dept_id` = 'mvsv023p63',
       `position` = '至臻医疗副总经理（主持工作）',
       `role_ids` = '["mvu9z81n35"]',
       `update_time` = NOW()
 WHERE `id` = 'mvsv04io114';

SELECT 'positions for 陈福沨:' AS info;
SELECT `id`,`company_id`,`dept_id`,`position`,`role_ids`,`is_primary`,`status` FROM `org_user_positions` WHERE `user_id`='mvsv04io114' ORDER BY `sort`;
SELECT 'org_users primary:' AS info;
SELECT `id`,`company_id`,`dept_id`,`position`,`role_ids` FROM `org_users` WHERE `id`='mvsv04io114';
