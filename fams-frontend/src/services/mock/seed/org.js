// 组织架构主数据种子（仅在 mock 模式下使用）
// 公司 / 部门 / 用户 / 角色 四张表构成统一主数据，资产模块的公司、部门口径均来源于此

const SEED_COMPANIES = [
  { id: 'C1', code: 'GS-0001', name: '华信科技集团有限公司', shortName: '华信科技', parentId: null, type: '有限责任公司', creditCode: '91350100MA2X00001X', legalPerson: '陈立', contact: '张伟', phone: '0591-88000001', address: '福州市鼓楼区五四路100号华信大厦', status: '启用', sort: 1 },
  { id: 'C2', code: 'GS-0002', name: '云鼎资产管理有限公司', shortName: '云鼎资产', parentId: 'C1', type: '有限责任公司', creditCode: '91350100MA2X00002X', legalPerson: '林岚', contact: '郑凯', phone: '0591-88000002', address: '福州市台江区金融街18号', status: '启用', sort: 2 },
  { id: 'C3', code: 'GS-0003', name: '恒信融资租赁有限公司', shortName: '恒信租赁', parentId: 'C1', type: '股份有限公司', creditCode: '91350100MA2X00003X', legalPerson: '许鸣', contact: '吴迪', phone: '0591-88000003', address: '福州市仓山区金山大道66号', status: '启用', sort: 3 },
  { id: 'C4', code: 'GS-0004', name: '中天建设集团有限公司', shortName: '中天建设', parentId: 'C1', type: '有限责任公司', creditCode: '91350100MA2X00004X', legalPerson: '赵启明', contact: '赵敏', phone: '0591-88000004', address: '福州市晋安区福兴大道88号', status: '启用', sort: 4 },
  { id: 'C5', code: 'GS-0005', name: '华信后勤服务有限公司', shortName: '华信后勤', parentId: 'C1', type: '有限责任公司', creditCode: '91350100MA2X00005X', legalPerson: '孙振', contact: '孙磊', phone: '0591-88000005', address: '福州市鼓楼区华信大厦1层', status: '停用', sort: 5 }
]

const SEED_DEPARTMENTS = [
  { id: 'D1', code: 'BM-0001', name: '技术部', parentId: null, companyId: 'C1', leader: '张伟', headcount: 24, phone: '0591-88000101', status: '启用', sort: 1 },
  { id: 'D101', code: 'BM-000101', name: '研发一组', parentId: 'D1', companyId: 'C1', leader: '张伟', headcount: 10, phone: '0591-88000111', status: '启用', sort: 1 },
  { id: 'D102', code: 'BM-000102', name: '运维组', parentId: 'D1', companyId: 'C1', leader: '高翔', headcount: 8, phone: '0591-88000112', status: '启用', sort: 2 },
  { id: 'D2', code: 'BM-0002', name: '财务部', parentId: null, companyId: 'C1', leader: '李娜', headcount: 12, phone: '0591-88000102', status: '启用', sort: 2 },
  { id: 'D3', code: 'BM-0003', name: '行政部', parentId: null, companyId: 'C1', leader: '王强', headcount: 9, phone: '0591-88000103', status: '启用', sort: 3 },
  { id: 'D4', code: 'BM-0004', name: '运营部', parentId: null, companyId: 'C1', leader: '刘洋', headcount: 15, phone: '0591-88000104', status: '启用', sort: 4 },
  { id: 'D5', code: 'BM-0005', name: '市场部', parentId: null, companyId: 'C1', leader: '何欣', headcount: 11, phone: '0591-88000105', status: '启用', sort: 5 },
  { id: 'D6', code: 'BM-0006', name: '生产部', parentId: null, companyId: 'C1', leader: '陈刚', headcount: 60, phone: '0591-88000106', status: '启用', sort: 6 },
  { id: 'D7', code: 'BM-0007', name: '仓储部', parentId: null, companyId: 'C1', leader: '冯涛', headcount: 18, phone: '0591-88000107', status: '启用', sort: 7 },
  { id: 'D8', code: 'BM-0008', name: '资产管理部', parentId: null, companyId: 'C2', leader: '周静', headcount: 14, phone: '0591-88000201', status: '启用', sort: 1 },
  { id: 'D9', code: 'BM-0009', name: '财务部', parentId: null, companyId: 'C2', leader: '郑凯', headcount: 8, phone: '0591-88000202', status: '启用', sort: 2 },
  { id: 'D10', code: 'BM-0010', name: '租赁业务部', parentId: null, companyId: 'C3', leader: '吴迪', headcount: 16, phone: '0591-88000301', status: '启用', sort: 1 },
  { id: 'D11', code: 'BM-0011', name: '风控合规部', parentId: null, companyId: 'C3', leader: '高翔', headcount: 7, phone: '0591-88000302', status: '启用', sort: 2 },
  { id: 'D12', code: 'BM-0012', name: '工程管理部', parentId: null, companyId: 'C4', leader: '赵敏', headcount: 42, phone: '0591-88000401', status: '启用', sort: 1 },
  { id: 'D13', code: 'BM-0013', name: '物资采购部', parentId: null, companyId: 'C4', leader: '周芳', headcount: 10, phone: '0591-88000402', status: '启用', sort: 2 },
  { id: 'D14', code: 'BM-0014', name: '后勤保障部', parentId: null, companyId: 'C5', leader: '孙磊', headcount: 20, phone: '0591-88000501', status: '停用', sort: 1 }
]

const SEED_USERS = [
  { id: 'U1', username: 'admin', name: '系统管理员', companyId: 'C1', deptId: 'D1', position: '信息中心主任', roleIds: ['R1'], phone: '13800000001', email: 'admin@huaxin.com', status: '启用', createdAt: '2024-01-05 09:00:00', lastLoginAt: '2026-10-22 09:12:33' },
  { id: 'U2', username: 'zhangwei', name: '张伟', companyId: 'C1', deptId: 'D1', position: '技术部经理', roleIds: ['R2'], phone: '13800000002', email: 'zhangwei@huaxin.com', status: '启用', createdAt: '2024-03-12 09:30:00', lastLoginAt: '2026-10-21 18:40:05' },
  { id: 'U3', username: 'lina', name: '李娜', companyId: 'C1', deptId: 'D2', position: '财务主管', roleIds: ['R4'], phone: '13800000003', email: 'lina@huaxin.com', status: '启用', createdAt: '2024-04-02 14:20:00', lastLoginAt: '2026-10-20 11:05:12' },
  { id: 'U4', username: 'wangqiang', name: '王强', companyId: 'C1', deptId: 'D3', position: '行政专员', roleIds: ['R3'], phone: '13800000004', email: 'wangqiang@huaxin.com', status: '启用', createdAt: '2024-05-18 10:05:00', lastLoginAt: '2026-10-19 16:22:41' },
  { id: 'U5', username: 'liuyang', name: '刘洋', companyId: 'C1', deptId: 'D4', position: '运营专员', roleIds: ['R3'], phone: '13800000005', email: 'liuyang@huaxin.com', status: '启用', createdAt: '2024-06-21 16:45:00', lastLoginAt: '2026-10-18 09:33:20' },
  { id: 'U6', username: 'hexin', name: '何欣', companyId: 'C1', deptId: 'D5', position: '市场专员', roleIds: ['R3'], phone: '13800000006', email: 'hexin@huaxin.com', status: '启用', createdAt: '2024-07-09 08:55:00', lastLoginAt: '2026-10-17 15:10:08' },
  { id: 'U7', username: 'chengang', name: '陈刚', companyId: 'C1', deptId: 'D6', position: '生产主管', roleIds: ['R5'], phone: '13800000007', email: 'chengang@huaxin.com', status: '启用', createdAt: '2024-08-15 11:30:00', lastLoginAt: '2026-10-16 08:02:55' },
  { id: 'U8', username: 'fengtao', name: '冯涛', companyId: 'C1', deptId: 'D7', position: '仓储主管', roleIds: ['R5'], phone: '13800000008', email: 'fengtao@huaxin.com', status: '启用', createdAt: '2024-09-03 15:10:00', lastLoginAt: '2026-10-15 17:48:31' },
  { id: 'U9', username: 'gaoxiang', name: '高翔', companyId: 'C1', deptId: 'D102', position: '运维组长', roleIds: ['R2'], phone: '13800000009', email: 'gaoxiang@huaxin.com', status: '启用', createdAt: '2024-10-11 09:00:00', lastLoginAt: '2026-10-14 10:26:19' },
  { id: 'U10', username: 'zhoujing', name: '周静', companyId: 'C2', deptId: 'D8', position: '资产主管', roleIds: ['R2'], phone: '13800000010', email: 'zhoujing@yunding.com', status: '启用', createdAt: '2024-11-08 13:40:00', lastLoginAt: '2026-10-13 14:55:02' },
  { id: 'U11', username: 'zhengkai', name: '郑凯', companyId: 'C2', deptId: 'D9', position: '财务专员', roleIds: ['R4'], phone: '13800000011', email: 'zhengkai@yunding.com', status: '启用', createdAt: '2024-12-02 10:15:00', lastLoginAt: '2026-10-12 09:41:37' },
  { id: 'U12', username: 'wudi', name: '吴迪', companyId: 'C3', deptId: 'D10', position: '业务经理', roleIds: ['R5'], phone: '13800000012', email: 'wudi@hengxin.com', status: '启用', createdAt: '2025-01-16 09:20:00', lastLoginAt: '2026-10-11 16:07:44' },
  { id: 'U13', username: 'chenjing', name: '陈静', companyId: 'C3', deptId: 'D11', position: '风控专员', roleIds: ['R6'], phone: '13800000013', email: 'chenjing@hengxin.com', status: '启用', createdAt: '2025-03-05 14:00:00', lastLoginAt: '2026-10-10 11:19:53' },
  { id: 'U14', username: 'zhaomin', name: '赵敏', companyId: 'C4', deptId: 'D12', position: '工程部主管', roleIds: ['R5'], phone: '13800000014', email: 'zhaomin@zhongtian.com', status: '启用', createdAt: '2025-04-22 08:30:00', lastLoginAt: '2026-10-09 15:38:26' },
  { id: 'U15', username: 'zhoufang', name: '周芳', companyId: 'C4', deptId: 'D13', position: '采购专员', roleIds: ['R3'], phone: '13800000015', email: 'zhoufang@zhongtian.com', status: '启用', createdAt: '2025-06-10 15:45:00', lastLoginAt: '2026-10-08 09:12:11' },
  { id: 'U16', username: 'sunlei', name: '孙磊', companyId: 'C5', deptId: 'D14', position: '后勤专员', roleIds: ['R3'], phone: '13800000016', email: 'sunlei@huaxin.com', status: '停用', createdAt: '2025-08-19 11:05:00', lastLoginAt: '2026-09-28 17:30:49' }
]

const SEED_ROLES = [
  {
    id: 'R1', code: 'ROLE_ADMIN', name: '系统管理员', orgScope: '全集团', dataScope: '全部数据', status: '启用', sort: 1,
    remark: '拥有全部模块权限，负责系统配置与组织架构维护',
    permissions: ['fa:view', 'fa:add', 'fa:edit', 'fa:delete', 'fa:export', 'fa:inbound', 'fa:dispatch', 'fa:borrow', 'fa:change', 'fa:dispose', 'fa:inventory', 'fa:depreciation', 'fa:report', 'lv:view', 'lv:edit', 'lv:export', 'lv:inbound', 'lv:requisition', 'lv:return', 'lv:report', 'org:company', 'org:dept', 'org:user', 'org:role', 'sys:dict', 'sys:log', 'sys:workflow', 'sys:params', 'sys:message', 'sys:template', 'sys:terminal']
  },
  {
    id: 'R2', code: 'ROLE_ASSET', name: '资产管理员', orgScope: '本公司', dataScope: '本公司及以下', status: '启用', sort: 2,
    remark: '负责资产台账、入库、派发、处置、盘点与低值资产出入库',
    permissions: ['fa:view', 'fa:add', 'fa:edit', 'fa:export', 'fa:inbound', 'fa:dispatch', 'fa:borrow', 'fa:change', 'fa:dispose', 'fa:inventory', 'fa:report', 'lv:view', 'lv:edit', 'lv:export', 'lv:inbound', 'lv:requisition', 'lv:return', 'lv:report']
  },
  {
    id: 'R3', code: 'ROLE_USER', name: '资产使用人', orgScope: '本部门', dataScope: '本部门', status: '启用', sort: 3,
    remark: '普通员工，可查看本人名下资产并发起低值资产领用/退库',
    permissions: ['fa:view', 'lv:view', 'lv:requisition', 'lv:return']
  },
  {
    id: 'R4', code: 'ROLE_FINANCE', name: '财务管理员', orgScope: '本公司', dataScope: '本公司及以下', status: '启用', sort: 4,
    remark: '负责折旧计提、资产报表与导出',
    permissions: ['fa:view', 'fa:export', 'fa:depreciation', 'fa:report', 'lv:view', 'lv:report', 'sys:log']
  },
  {
    id: 'R5', code: 'ROLE_LEADER', name: '部门主管', orgScope: '本部门', dataScope: '本部门及以下', status: '启用', sort: 5,
    remark: '部门负责人，可审批本部门资产业务单据',
    permissions: ['fa:view', 'fa:edit', 'fa:dispatch', 'fa:borrow', 'fa:inventory', 'fa:report', 'lv:view', 'lv:requisition', 'lv:report']
  },
  {
    id: 'R6', code: 'ROLE_AUDITOR', name: '审计员', orgScope: '全集团', dataScope: '全部数据', status: '启用', sort: 6,
    remark: '只读权限，用于内审与合规检查',
    permissions: ['fa:view', 'fa:report', 'lv:view', 'lv:report', 'sys:log']
  }
]

export const ORG_SEEDS = {
  companies: SEED_COMPANIES,
  departments: SEED_DEPARTMENTS,
  users: SEED_USERS,
  roles: SEED_ROLES
}

export default ORG_SEEDS
