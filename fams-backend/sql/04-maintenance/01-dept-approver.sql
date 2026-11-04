-- ============================================================
-- 部门审批人（纵向审批）迁移脚本
--   1) 部门表新增 leader_id / vp_id，指向 org-users
--   2) 按同公司内姓名精确匹配回填 leader_id（重名、跨公司不猜）
--   3) 分管领导没有历史数据来源，需在「组织架构」中人工指定
-- 幂等性：重复执行会因列已存在而报错，请先确认当前库版本
-- ============================================================

ALTER TABLE `org_departments`
  ADD COLUMN `leader_id` VARCHAR(64) NULL COMMENT '部门负责人 →org-users（审批按人解析）' AFTER `leader`,
  ADD COLUMN `vp_id` VARCHAR(64) NULL COMMENT '分管领导 →org-users（审批按人解析）' AFTER `leader_id`;

UPDATE `org_departments` d
  JOIN `org_users` u
    ON u.`name` = d.`leader`
   AND u.`company_id` = d.`company_id`
   AND u.`status` = 'ENABLED'
SET d.`leader_id` = u.`id`
WHERE d.`leader_id` IS NULL
  AND d.`leader` IS NOT NULL
  AND d.`leader` <> '';

-- 回填结果自检：仍未匹配到负责人的部门，需要在组织架构页面手工指定
SELECT d.`id`, d.`code`, d.`name`, d.`company_id`, d.`leader`
FROM `org_departments` d
WHERE d.`leader_id` IS NULL
  AND d.`status` = 'ENABLED'
ORDER BY d.`company_id`, d.`sort`;
