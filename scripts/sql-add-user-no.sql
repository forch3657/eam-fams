-- 新增业务「用户编号」字段 user_no 并回填历史用户（幂等）
-- 内部主键 id 保持不变；编号格式 YH-0001，按创建时间+id 顺序分配
-- 回填后新增用户由后端 GenericService 自动按全表最大序号 +1 生成
SET NAMES utf8mb4;

-- 1) 加列（若不存在）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_users' AND COLUMN_NAME = 'user_no');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE org_users ADD COLUMN user_no VARCHAR(255) NULL COMMENT ''用户编号 唯一'' AFTER id',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) 回填：仅对 user_no 为空的历史用户，按 created_at + id 顺序编号
--    用变量自增，避免窗口函数在部分版本上的兼容问题
SET @rn = 0;
UPDATE org_users u
  JOIN (
    SELECT id, (@rn := @rn + 1) AS rn
    FROM (SELECT id FROM org_users WHERE user_no IS NULL OR user_no = '' ORDER BY created_at, id) t
  ) x ON x.id = u.id
SET u.user_no = CONCAT('YH-', LPAD(x.rn, 4, '0'))
WHERE u.user_no IS NULL OR u.user_no = '';

-- 3) 加唯一索引（若不存在）；此时已回填，全部唯一
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'org_users' AND INDEX_NAME = 'uk_org_users_user_no');
SET @sql2 = IF(@idx_exists = 0,
  'CREATE UNIQUE INDEX uk_org_users_user_no ON org_users (user_no)',
  'SELECT 1');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 4) 校验
SELECT COUNT(*) AS total_users,
       COUNT(user_no) AS with_no,
       COUNT(DISTINCT user_no) AS distinct_no
FROM org_users;
SELECT user_no, username, name FROM org_users ORDER BY user_no LIMIT 5;
SELECT user_no, username, name FROM org_users ORDER BY user_no DESC LIMIT 5;
