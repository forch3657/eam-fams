-- =============================================================================
-- 真实组织回归 · 只读数据复核清单
-- 目标组织：福州数据技术研究院有限公司（company_id = 'mvsv021s37'，编码 GS-0001）
-- 复跑方式：
--   $env:MYSQL_PWD = '<MySQL 管理员口令>'
--   & 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' -h 127.0.0.1 -u root `
--       -D fams --default-character-set=utf8mb4 --table < docs/e2e/sql/real-org-check.sql
--   Remove-Item Env:MYSQL_PWD
--
-- 约定：本文件只有 SELECT，可任意反复执行；不自动清库、不删真实账号、不改部门配置。
-- 期望值以 2026-11-04 生产库基线为准（46 台资产 / 8 个有资产部门 / 81 个启用账号含 admin）。
-- 若期间发生正常业务，第 2、8 节的数字可能变化，需人工甄别而非直接判失败。
-- =============================================================================

SET @company = 'mvsv021s37';

-- 0. 结论速览：单据 / 盘点单 / 轨迹 / 真实资产状态 4 项必须为 0，手工草稿单必须为 1；
--    「E2E_ 测试资产」只汇报不判失败——全量回归（既有 P7 状态机矩阵用例）会留下
--    E2E_ 前缀测试资产，按项目口径「清空重导由人工做」，本清单不自动清理。
SELECT '固资单据残留(应为0)' AS item, COUNT(1) AS cnt FROM (
  SELECT code, name, remark FROM fixed_asset_doc_lists_inbound
  UNION ALL SELECT code, name, remark FROM fixed_asset_doc_lists_alloc
  UNION ALL SELECT code, name, remark FROM fixed_asset_doc_lists_back
  UNION ALL SELECT code, name, remark FROM fixed_asset_doc_lists_borrow
  UNION ALL SELECT code, name, remark FROM fixed_asset_doc_lists_transfer
  UNION ALL SELECT code, name, remark FROM fixed_asset_doc_lists_repair
  UNION ALL SELECT code, name, remark FROM fixed_asset_doc_lists_change
  UNION ALL SELECT code, name, remark FROM fixed_asset_doc_lists_dispose
) t WHERE t.code LIKE 'E2E\_ORG\_%' OR t.name LIKE 'E2E\_ORG\_%' OR t.remark LIKE 'E2E\_ORG\_%'
UNION ALL
SELECT '盘点单与派生单残留(应为0)', (
    (SELECT COUNT(1) FROM fixed_asset_inventory_docs
      WHERE doc_no LIKE 'E2E\_ORG\_%' OR name LIKE 'E2E\_ORG\_%' OR remark LIKE 'E2E\_ORG\_%')
  + (SELECT COUNT(1) FROM fixed_asset_doc_lists_dispose WHERE remark LIKE '%E2E\_ORG\_%')
  + (SELECT COUNT(1) FROM fixed_asset_doc_lists_repair  WHERE remark LIKE '%E2E\_ORG\_%')
  + (SELECT COUNT(1) FROM fixed_asset_doc_lists_change  WHERE remark LIKE '%E2E\_ORG\_%')
)
UNION ALL
SELECT '审批轨迹残留(应为0)', COUNT(1) FROM fixed_asset_doc_approvals
  WHERE doc_code LIKE 'E2E\_ORG\_%' OR doc_code LIKE 'E2E\_PD\_%'
UNION ALL
SELECT '真实资产非 IN_USE(应为0)', COUNT(1) FROM fixed_assets
  WHERE company_id = @company AND status <> 'IN_USE'
    AND code NOT LIKE 'E2E\_%' AND name NOT LIKE 'E2E\_%'
UNION ALL
SELECT 'E2E_ 测试资产(仅汇报)', COUNT(1) FROM fixed_assets
  WHERE company_id = @company AND (code LIKE 'E2E\_%' OR name LIKE 'E2E\_%')
UNION ALL
SELECT '手工草稿单完好(应为1)', COUNT(1) FROM fixed_asset_inventory_docs
  WHERE doc_no = 'PD20261104001' AND status = 'DRAFT';

-- 1. 部门配置：8 个有资产部门的 leader_id / vp_id 与真人账号（回归前后必须完全一致）
SELECT d.code, d.name, d.status,
       lu.username AS leader_username, lu.name  AS leader_name,
       vu.username AS vp_username,     vu.name  AS vp_name
FROM org_departments d
LEFT JOIN org_users lu ON lu.id = d.leader_id
LEFT JOIN org_users vu ON vu.id = d.vp_id
WHERE d.company_id = @company AND d.status = 'ENABLED'
ORDER BY d.sort;

-- 2. 分部门 × 状态 的资产分布（基线：8 个部门共 46 台，全部 IN_USE）
SELECT d.code, d.name AS dept_name, a.status, COUNT(1) AS cnt
FROM fixed_assets a
JOIN org_departments d ON d.id = a.dept_id
WHERE a.company_id = @company
GROUP BY d.code, d.name, a.status
ORDER BY d.code, a.status;

-- 3. 本轮测试单据残留（8 类固资单据）：期望 0 行
SELECT 'inbound'  AS biz, code, name, status, remark FROM fixed_asset_doc_lists_inbound  WHERE code LIKE 'E2E\_ORG\_%' OR name LIKE 'E2E\_ORG\_%' OR remark LIKE 'E2E\_ORG\_%'
UNION ALL
SELECT 'alloc',    code, name, status, remark FROM fixed_asset_doc_lists_alloc    WHERE code LIKE 'E2E\_ORG\_%' OR name LIKE 'E2E\_ORG\_%' OR remark LIKE 'E2E\_ORG\_%'
UNION ALL
SELECT 'back',     code, name, status, remark FROM fixed_asset_doc_lists_back     WHERE code LIKE 'E2E\_ORG\_%' OR name LIKE 'E2E\_ORG\_%' OR remark LIKE 'E2E\_ORG\_%'
UNION ALL
SELECT 'borrow',   code, name, status, remark FROM fixed_asset_doc_lists_borrow   WHERE code LIKE 'E2E\_ORG\_%' OR name LIKE 'E2E\_ORG\_%' OR remark LIKE 'E2E\_ORG\_%'
UNION ALL
SELECT 'transfer', code, name, status, remark FROM fixed_asset_doc_lists_transfer WHERE code LIKE 'E2E\_ORG\_%' OR name LIKE 'E2E\_ORG\_%' OR remark LIKE 'E2E\_ORG\_%'
UNION ALL
SELECT 'repair',   code, name, status, remark FROM fixed_asset_doc_lists_repair   WHERE code LIKE 'E2E\_ORG\_%' OR name LIKE 'E2E\_ORG\_%' OR remark LIKE 'E2E\_ORG\_%'
UNION ALL
SELECT 'change',   code, name, status, remark FROM fixed_asset_doc_lists_change   WHERE code LIKE 'E2E\_ORG\_%' OR name LIKE 'E2E\_ORG\_%' OR remark LIKE 'E2E\_ORG\_%'
UNION ALL
SELECT 'dispose',  code, name, status, remark FROM fixed_asset_doc_lists_dispose  WHERE code LIKE 'E2E\_ORG\_%' OR name LIKE 'E2E\_ORG\_%' OR remark LIKE 'E2E\_ORG\_%';

-- 4. 盘点单 / 盘点计划 / 派生单据残留：期望 0 行
--    盘点盘亏派生的处置单 remark 形如「盘点盘亏核销：E2E_ORG_盘点盘亏_市场营销部」，
--    用 LIKE '%E2E_ORG_%' 一并覆盖，不依赖单据主键。
SELECT doc_no, name, status, remark FROM fixed_asset_inventory_docs
WHERE doc_no LIKE 'E2E\_ORG\_%' OR name LIKE 'E2E\_ORG\_%' OR remark LIKE 'E2E\_ORG\_%';
SELECT code, name, status, remark FROM fixed_asset_doc_lists_dispose
WHERE remark LIKE '%E2E\_ORG\_%';
SELECT code, name, status, remark FROM fixed_asset_doc_lists_repair
WHERE remark LIKE '%盘点异常%' AND remark LIKE '%E2E\_ORG\_%';
SELECT code, name, status, remark FROM fixed_asset_doc_lists_change
WHERE remark LIKE '%盘点异常%' AND remark LIKE '%E2E\_ORG\_%';

-- 5. 审批轨迹残留：期望 0 行（删单据由后端 ApprovalTrailHook 级联清理）
--    轨迹集合是只读集合，本清单不做任何 DELETE。
SELECT doc_key, doc_code, step_name, result, approver_name, time
FROM fixed_asset_doc_approvals
WHERE doc_code LIKE 'E2E\_ORG\_%' OR doc_code LIKE 'E2E\_PD\_%';

-- 6. 用户手工草稿盘点单：必须仍为 1 行且 status = DRAFT（严禁误删）
SELECT doc_no, name, status, create_time FROM fixed_asset_inventory_docs
WHERE doc_no = 'PD20261104001';

-- 7. 真实账号未被增删停用：基线 80 个在册真人 + admin
SELECT COUNT(1) AS enabled_real_users FROM org_users
WHERE company_id = @company AND status = 'ENABLED';
SELECT username, name, status, role_ids FROM org_users WHERE username = 'admin';

-- 8. 台账状态明细：真实资产回归清理后应全部回到 IN_USE；
--    E2E_ 前缀是既有全量回归留下的测试资产，按项目口径由人工清空重导，本清单不自动删。
SELECT a.id, a.code, a.name, d.name AS dept_name, a.status, a.user_id, a.source_tag
FROM fixed_assets a
LEFT JOIN org_departments d ON d.id = a.dept_id
WHERE a.company_id = @company AND a.status <> 'IN_USE'
ORDER BY d.code, a.code;

-- 9. 分层账号矩阵（核对报告用）：使用人 / 部门主管 / 分管领导 / 财务 / 仓管 / 审计 / 资产管理员
SELECT u.username, u.name, d.name AS dept_name, u.role_ids, u.status
FROM org_users u
LEFT JOIN org_departments d ON d.id = u.dept_id
WHERE u.username IN (
  'admin',
  '18559869119', '18605917225',
  '15960118864', '18350296364',
  '13599964281', '13599071971',
  '18659186605', '13015764128',
  '18900220150', '15960191291',
  '15205002251', '15059250197',
  '13799423891', '15960068070',
  '13704011580', '18906910676',
  '18120648615', '15750891336'
)
ORDER BY d.code, u.username;

-- 10. 部门层级例外：公司领导部门（BM-0001）负责人是 R7 领导班子账号，分管领导另有人
SELECT d.code, d.name,
       lu.username AS leader_username, lu.role_ids AS leader_roles,
       vu.username AS vp_username,     vu.role_ids AS vp_roles
FROM org_departments d
LEFT JOIN org_users lu ON lu.id = d.leader_id
LEFT JOIN org_users vu ON vu.id = d.vp_id
WHERE d.code = 'BM-0001' AND d.company_id = @company;
