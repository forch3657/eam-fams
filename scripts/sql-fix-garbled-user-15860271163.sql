-- 修复用户 15860271163 主表姓名/岗位的问号乱码（造数时中文被转成 ? 写坏）
-- 正确值来自 数研院人员(1).xlsx：林佳怡 / 数据标注人工训练师（福州数源科技 / 数据运营中心）
-- 岗位子表 pos-imp-15860271163-1 已是正确值，本脚本仅修复 org_users 主表冗余字段
-- 幂等：按 id 精确定位，可重复执行
SET NAMES utf8mb4;

UPDATE org_users
   SET name = '林佳怡',
       position = '数据标注人工训练师',
       update_time = NOW()
 WHERE id = 'mvsv095m202'
   AND username = '15860271163';

SELECT username, name, position, HEX(name) AS name_hex FROM org_users WHERE id = 'mvsv095m202';
