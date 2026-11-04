-- ============================================================
-- 部门审批人回填（在 01-dept-approver.sql 加列之后执行）
--
-- 规则：
--   leader_id = 该部门下第一个「部门主管(ROLE_LEADER)」启用账号；
--               没有主管时取该部门第一个启用账号
--   vp_id     = 该部门下第一个「分管副总(ROLE_VP)」启用账号；
--               没有时取同公司下第一个分管副总
-- 说明：真实组织里「部门负责人」应以「组织架构 → 部门」页面人工指定为准，
--       本脚本只是给存量数据一个可用初值，执行后可逐部门修正。
-- 注意：加列时 leader_id / vp_id 的默认值是空串（不是 NULL），
--       所以下面的条件必须同时覆盖 NULL 与 ''，否则补不上。
-- ============================================================

UPDATE `org_departments` d
  JOIN (
    SELECT u.`dept_id` AS dept_id, MIN(u.`id`) AS user_id
    FROM `org_users` u
    WHERE u.`status` = 'ENABLED'
      AND u.`dept_id` IS NOT NULL
      AND u.`dept_id` <> ''
      AND u.`role_ids` LIKE '%"R5"%'
    GROUP BY u.`dept_id`
  ) x ON x.dept_id = d.`id`
SET d.`leader_id` = x.user_id
WHERE d.`leader_id` IS NULL OR d.`leader_id` = '';

UPDATE `org_departments` d
  JOIN (
    SELECT u.`dept_id` AS dept_id, MIN(u.`id`) AS user_id
    FROM `org_users` u
    WHERE u.`status` = 'ENABLED'
      AND u.`dept_id` IS NOT NULL
      AND u.`dept_id` <> ''
      AND u.`role_ids` LIKE '%"R7"%'
    GROUP BY u.`dept_id`
  ) x ON x.dept_id = d.`id`
SET d.`vp_id` = x.user_id
WHERE d.`vp_id` IS NULL OR d.`vp_id` = '';

UPDATE `org_departments` d
  JOIN (
    SELECT u.`company_id` AS company_id, MIN(u.`id`) AS user_id
    FROM `org_users` u
    WHERE u.`status` = 'ENABLED'
      AND u.`role_ids` LIKE '%"R7"%'
      AND u.`company_id` IS NOT NULL
      AND u.`company_id` <> ''
    GROUP BY u.`company_id`
  ) x ON x.company_id = d.`company_id`
SET d.`vp_id` = x.user_id
WHERE d.`vp_id` IS NULL OR d.`vp_id` = '';

-- 兜底：部门里没有「部门主管」账号时，取该部门第一个启用账号作为负责人
UPDATE `org_departments` d
  JOIN (
    SELECT u.`dept_id` AS dept_id, MIN(u.`id`) AS user_id
    FROM `org_users` u
    WHERE u.`status` = 'ENABLED'
      AND u.`dept_id` IS NOT NULL
      AND u.`dept_id` <> ''
    GROUP BY u.`dept_id`
  ) x ON x.dept_id = d.`id`
SET d.`leader_id` = x.user_id
WHERE d.`leader_id` IS NULL OR d.`leader_id` = '';

-- 兜底：空壳部门（部门下没有任何启用账号，如只挂架构节点的「公司领导」部门）
--       取同公司第一个启用账号兼任负责人，避免该部门一旦有单据就卡在提交。
UPDATE `org_departments` d
  JOIN (
    SELECT u.`company_id` AS company_id, MIN(u.`id`) AS user_id
    FROM `org_users` u
    WHERE u.`status` = 'ENABLED'
      AND u.`company_id` IS NOT NULL
      AND u.`company_id` <> ''
    GROUP BY u.`company_id`
  ) x ON x.company_id = d.`company_id`
SET d.`leader_id` = x.user_id
WHERE d.`leader_id` IS NULL OR d.`leader_id` = '';

-- 兜底：集团内第一个启用「分管副总」作为该部门的分管领导
--       （公司内没有分管副总时，由集团分管副总兜底）
UPDATE `org_departments` d
  JOIN (
    SELECT MIN(u.`id`) AS user_id
    FROM `org_users` u
    WHERE u.`status` = 'ENABLED'
      AND u.`role_ids` LIKE '%"R7"%'
  ) x
SET d.`vp_id` = x.user_id
WHERE d.`vp_id` IS NULL OR d.`vp_id` = '';

-- 自检：仍然没有审批人的部门，需要在「组织架构 → 部门」中人工指定
SELECT d.`id`, d.`code`, d.`name`, d.`company_id`, d.`leader`, d.`leader_id`, d.`vp_id`
FROM `org_departments` d
WHERE d.`status` = 'ENABLED'
  AND (d.`leader_id` IS NULL OR d.`leader_id` = '' OR d.`vp_id` IS NULL OR d.`vp_id` = '')
ORDER BY d.`company_id`, d.`sort`;
