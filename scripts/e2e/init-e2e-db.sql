-- ============================================================
-- E2E 测试库初始化（需 MySQL 管理员执行一次）
--
-- 应用账号 fams 只有业务库的 DML 权限，建库/授权必须由管理员完成。
--
-- 推荐方式（交互式输入管理员口令，不落盘）：
--   powershell -ExecutionPolicy Bypass -File scripts/e2e/setup-e2e-db.ps1
--
-- 手工方式（mysql 客户端）：
--   mysql -u root -p --default-character-set=utf8mb4 -e "SOURCE scripts/e2e/init-e2e-db.sql"
--   注意：powershell 不支持 `<` 重定向，不要写成 mysql -u root -p < xxx.sql
-- ============================================================

-- 1) 字符集/排序规则与生产库 fams 完全一致（utf8mb4_general_ci）。
--    不要改成 0900_ai_ci：排序与比较结果会和生产不同，测试结论不可信。
CREATE DATABASE IF NOT EXISTS `fams_e2e`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- 2) 只授权测试库，不扩大 fams 在其他库的权限。
--    host 必须是实际账号的 host：本机为 127.0.0.1（不是 localhost），
--    写错会静默新建一个空口令的 fams@localhost，测试栈仍连不上。
--    若不确定：SELECT user, host FROM mysql.user WHERE user = 'fams';
GRANT ALL PRIVILEGES ON `fams_e2e`.* TO 'fams'@'127.0.0.1';
FLUSH PRIVILEGES;

-- 3) 验证
SHOW DATABASES LIKE 'fams_e2e';
SHOW GRANTS FOR 'fams'@'127.0.0.1';
