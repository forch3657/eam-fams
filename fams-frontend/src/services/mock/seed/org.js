// 组织架构主数据种子（仅在 mock 模式下使用）
// 语义约定：外键一律存 id；状态存枚举编码（见 constants/enums.js）；时间存 ISO 8601

const SEED_COMPANIES = [
  { id: 'C1', code: 'GS-0001', name: '华信科技集团有限公司', shortName: '华信科技', parentId: null, type: '有限责任公司', creditCode: '91350100MA2X00001X', legalPerson: '陈立', contact: '张伟', phone: '0591-88000001', address: '福州市鼓楼区五四路100号华信大厦', status: 'ENABLED', sort: 1, createTime: '2024-01-05T09:00:00', updateTime: '2026-09-18T10:22:31', version: 1 },
  { id: 'C2', code: 'GS-0002', name: '云鼎资产管理有限公司', shortName: '云鼎资产', parentId: 'C1', type: '有限责任公司', creditCode: '91350100MA2X00002X', legalPerson: '林岚', contact: '郑凯', phone: '0591-88000002', address: '福州市台江区金融街18号', status: 'ENABLED', sort: 2, createTime: '2024-01-05T09:10:00', updateTime: '2026-09-17T15:40:12', version: 1 },
  { id: 'C3', code: 'GS-0003', name: '恒信融资租赁有限公司', shortName: '恒信租赁', parentId: 'C1', type: '股份有限公司', creditCode: '91350100MA2X00003X', legalPerson: '许鸣', contact: '吴迪', phone: '0591-88000003', address: '福州市仓山区金山大道66号', status: 'ENABLED', sort: 3, createTime: '2024-01-05T09:20:00', updateTime: '2026-09-16T09:05:44', version: 1 },
  { id: 'C4', code: 'GS-0004', name: '中天建设集团有限公司', shortName: '中天建设', parentId: 'C1', type: '有限责任公司', creditCode: '91350100MA2X00004X', legalPerson: '赵启明', contact: '赵敏', phone: '0591-88000004', address: '福州市晋安区福兴大道88号', status: 'ENABLED', sort: 4, createTime: '2024-01-05T09:30:00', updateTime: '2026-09-15T14:22:08', version: 1 },
  { id: 'C5', code: 'GS-0005', name: '华信后勤服务有限公司', shortName: '华信后勤', parentId: 'C1', type: '有限责任公司', creditCode: '91350100MA2X00005X', legalPerson: '孙振', contact: '孙磊', phone: '0591-88000005', address: '福州市鼓楼区华信大厦1层', status: 'DISABLED', sort: 5, createTime: '2024-01-05T09:40:00', updateTime: '2026-08-30T11:31:52', version: 1 }
]

const SEED_DEPARTMENTS = [
  { id: 'D1', code: 'BM-0001', name: '技术部', parentId: null, companyId: 'C1', leader: '张伟', headcount: 24, phone: '0591-88000101', status: 'ENABLED', sort: 1, createTime: '2024-01-06T09:00:00', updateTime: '2026-09-18T10:22:31', version: 1 },
  { id: 'D101', code: 'BM-000101', name: '研发一组', parentId: 'D1', companyId: 'C1', leader: '张伟', headcount: 10, phone: '0591-88000111', status: 'ENABLED', sort: 1, createTime: '2024-01-06T09:05:00', updateTime: '2026-09-17T16:48:20', version: 1 },
  { id: 'D102', code: 'BM-000102', name: '运维组', parentId: 'D1', companyId: 'C1', leader: '高翔', headcount: 8, phone: '0591-88000112', status: 'ENABLED', sort: 2, createTime: '2024-01-06T09:10:00', updateTime: '2026-09-16T08:55:03', version: 1 },
  { id: 'D2', code: 'BM-0002', name: '财务部', parentId: null, companyId: 'C1', leader: '李娜', headcount: 12, phone: '0591-88000102', status: 'ENABLED', sort: 2, createTime: '2024-01-06T09:15:00', updateTime: '2026-09-15T13:26:47', version: 1 },
  { id: 'D3', code: 'BM-0003', name: '行政部', parentId: null, companyId: 'C1', leader: '王强', headcount: 9, phone: '0591-88000103', status: 'ENABLED', sort: 3, createTime: '2024-01-06T09:20:00', updateTime: '2026-09-14T11:19:40', version: 1 },
  { id: 'D4', code: 'BM-0004', name: '运营部', parentId: null, companyId: 'C1', leader: '刘洋', headcount: 15, phone: '0591-88000104', status: 'ENABLED', sort: 4, createTime: '2024-01-06T09:25:00', updateTime: '2026-09-13T17:04:11', version: 1 },
  { id: 'D5', code: 'BM-0005', name: '市场部', parentId: null, companyId: 'C1', leader: '何欣', headcount: 11, phone: '0591-88000105', status: 'ENABLED', sort: 5, createTime: '2024-01-06T09:30:00', updateTime: '2026-09-12T09:38:56', version: 1 },
  { id: 'D6', code: 'BM-0006', name: '生产部', parentId: null, companyId: 'C1', leader: '陈刚', headcount: 60, phone: '0591-88000106', status: 'ENABLED', sort: 6, createTime: '2024-01-06T09:35:00', updateTime: '2026-09-11T14:51:29', version: 1 },
  { id: 'D7', code: 'BM-0007', name: '仓储部', parentId: null, companyId: 'C1', leader: '冯涛', headcount: 18, phone: '0591-88000107', status: 'ENABLED', sort: 7, createTime: '2024-01-06T09:40:00', updateTime: '2026-09-10T10:12:35', version: 1 },
  { id: 'D8', code: 'BM-0008', name: '资产管理部', parentId: null, companyId: 'C2', leader: '周静', headcount: 14, phone: '0591-88000201', status: 'ENABLED', sort: 1, createTime: '2024-01-06T09:45:00', updateTime: '2026-09-09T15:40:08', version: 1 },
  { id: 'D9', code: 'BM-0009', name: '财务部', parentId: null, companyId: 'C2', leader: '郑凯', headcount: 8, phone: '0591-88000202', status: 'ENABLED', sort: 2, createTime: '2024-01-06T09:50:00', updateTime: '2026-09-08T11:31:52', version: 1 },
  { id: 'D10', code: 'BM-0010', name: '租赁业务部', parentId: null, companyId: 'C3', leader: '吴迪', headcount: 16, phone: '0591-88000301', status: 'ENABLED', sort: 1, createTime: '2024-01-06T09:55:00', updateTime: '2026-09-07T16:48:20', version: 1 },
  { id: 'D11', code: 'BM-0011', name: '风控合规部', parentId: null, companyId: 'C3', leader: '高翔', headcount: 7, phone: '0591-88000302', status: 'ENABLED', sort: 2, createTime: '2024-01-06T10:00:00', updateTime: '2026-09-06T08:55:03', version: 1 },
  { id: 'D12', code: 'BM-0012', name: '工程管理部', parentId: null, companyId: 'C4', leader: '赵敏', headcount: 42, phone: '0591-88000401', status: 'ENABLED', sort: 1, createTime: '2024-01-06T10:05:00', updateTime: '2026-09-05T13:26:47', version: 1 },
  { id: 'D13', code: 'BM-0013', name: '物资采购部', parentId: null, companyId: 'C4', leader: '周芳', headcount: 10, phone: '0591-88000402', status: 'ENABLED', sort: 2, createTime: '2024-01-06T10:10:00', updateTime: '2026-09-04T11:19:40', version: 1 },
  { id: 'D14', code: 'BM-0014', name: '后勤保障部', parentId: null, companyId: 'C5', leader: '孙磊', headcount: 20, phone: '0591-88000501', status: 'DISABLED', sort: 1, createTime: '2024-01-06T10:15:00', updateTime: '2026-08-30T09:14:18', version: 1 }
]

const SEED_USERS = [
  { id: 'U1', username: 'admin', name: '系统管理员', companyId: 'C1', deptId: 'D1', position: '信息中心主任', roleIds: ['R1'], phone: '13800000001', email: 'admin@huaxin.com', status: 'ENABLED', createdAt: '2024-01-05T09:00:00', lastLoginAt: '2026-10-22T09:12:33', createTime: '2024-01-05T09:00:00', updateTime: '2026-10-22T09:12:33', version: 1 },
  { id: 'U2', username: 'zhangwei', name: '张伟', companyId: 'C1', deptId: 'D1', position: '技术部经理', roleIds: ['R2'], phone: '13800000002', email: 'zhangwei@huaxin.com', status: 'ENABLED', createdAt: '2024-03-12T09:30:00', lastLoginAt: '2026-10-21T18:40:05', createTime: '2024-03-12T09:30:00', updateTime: '2026-10-21T18:40:05', version: 1 },
  { id: 'U3', username: 'lina', name: '李娜', companyId: 'C1', deptId: 'D2', position: '财务主管', roleIds: ['R4'], phone: '13800000003', email: 'lina@huaxin.com', status: 'ENABLED', createdAt: '2024-04-02T14:20:00', lastLoginAt: '2026-10-20T11:05:12', createTime: '2024-04-02T14:20:00', updateTime: '2026-10-20T11:05:12', version: 1 },
  { id: 'U4', username: 'wangqiang', name: '王强', companyId: 'C1', deptId: 'D3', position: '行政专员', roleIds: ['R3'], phone: '13800000004', email: 'wangqiang@huaxin.com', status: 'ENABLED', createdAt: '2024-05-18T10:05:00', lastLoginAt: '2026-10-19T16:22:41', createTime: '2024-05-18T10:05:00', updateTime: '2026-10-19T16:22:41', version: 1 },
  { id: 'U5', username: 'liuyang', name: '刘洋', companyId: 'C1', deptId: 'D4', position: '运营专员', roleIds: ['R3'], phone: '13800000005', email: 'liuyang@huaxin.com', status: 'ENABLED', createdAt: '2024-06-21T16:45:00', lastLoginAt: '2026-10-18T09:33:20', createTime: '2024-06-21T16:45:00', updateTime: '2026-10-18T09:33:20', version: 1 },
  { id: 'U6', username: 'hexin', name: '何欣', companyId: 'C1', deptId: 'D5', position: '市场专员', roleIds: ['R3'], phone: '13800000006', email: 'hexin@huaxin.com', status: 'ENABLED', createdAt: '2024-07-09T08:55:00', lastLoginAt: '2026-10-17T15:10:08', createTime: '2024-07-09T08:55:00', updateTime: '2026-10-17T15:10:08', version: 1 },
  { id: 'U7', username: 'chengang', name: '陈刚', companyId: 'C1', deptId: 'D6', position: '生产主管', roleIds: ['R5'], phone: '13800000007', email: 'chengang@huaxin.com', status: 'ENABLED', createdAt: '2024-08-15T11:30:00', lastLoginAt: '2026-10-16T08:02:55', createTime: '2024-08-15T11:30:00', updateTime: '2026-10-16T08:02:55', version: 1 },
  { id: 'U8', username: 'fengtao', name: '冯涛', companyId: 'C1', deptId: 'D7', position: '仓储主管', roleIds: ['R5'], phone: '13800000008', email: 'fengtao@huaxin.com', status: 'ENABLED', createdAt: '2024-09-03T15:10:00', lastLoginAt: '2026-10-15T17:48:31', createTime: '2024-09-03T15:10:00', updateTime: '2026-10-15T17:48:31', version: 1 },
  { id: 'U9', username: 'gaoxiang', name: '高翔', companyId: 'C1', deptId: 'D102', position: '运维组长', roleIds: ['R2'], phone: '13800000009', email: 'gaoxiang@huaxin.com', status: 'ENABLED', createdAt: '2024-10-11T09:00:00', lastLoginAt: '2026-10-14T10:26:19', createTime: '2024-10-11T09:00:00', updateTime: '2026-10-14T10:26:19', version: 1 },
  { id: 'U10', username: 'zhoujing', name: '周静', companyId: 'C2', deptId: 'D8', position: '资产主管', roleIds: ['R2'], phone: '13800000010', email: 'zhoujing@yunding.com', status: 'ENABLED', createdAt: '2024-11-08T13:40:00', lastLoginAt: '2026-10-13T14:55:02', createTime: '2024-11-08T13:40:00', updateTime: '2026-10-13T14:55:02', version: 1 },
  { id: 'U11', username: 'zhengkai', name: '郑凯', companyId: 'C2', deptId: 'D9', position: '财务专员', roleIds: ['R4'], phone: '13800000011', email: 'zhengkai@yunding.com', status: 'ENABLED', createdAt: '2024-12-02T10:15:00', lastLoginAt: '2026-10-12T09:41:37', createTime: '2024-12-02T10:15:00', updateTime: '2026-10-12T09:41:37', version: 1 },
  { id: 'U12', username: 'wudi', name: '吴迪', companyId: 'C3', deptId: 'D10', position: '业务经理', roleIds: ['R5'], phone: '13800000012', email: 'wudi@hengxin.com', status: 'ENABLED', createdAt: '2025-01-16T09:20:00', lastLoginAt: '2026-10-11T16:07:44', createTime: '2025-01-16T09:20:00', updateTime: '2026-10-11T16:07:44', version: 1 },
  { id: 'U13', username: 'chenjing', name: '陈静', companyId: 'C3', deptId: 'D11', position: '风控专员', roleIds: ['R6'], phone: '13800000013', email: 'chenjing@hengxin.com', status: 'ENABLED', createdAt: '2025-03-05T14:00:00', lastLoginAt: '2026-10-10T11:19:53', createTime: '2025-03-05T14:00:00', updateTime: '2026-10-10T11:19:53', version: 1 },
  { id: 'U14', username: 'zhaomin', name: '赵敏', companyId: 'C4', deptId: 'D12', position: '工程部主管', roleIds: ['R5'], phone: '13800000014', email: 'zhaomin@zhongtian.com', status: 'ENABLED', createdAt: '2025-04-22T08:30:00', lastLoginAt: '2026-10-09T15:38:26', createTime: '2025-04-22T08:30:00', updateTime: '2026-10-09T15:38:26', version: 1 },
  { id: 'U15', username: 'zhoufang', name: '周芳', companyId: 'C4', deptId: 'D13', position: '采购专员', roleIds: ['R3'], phone: '13800000015', email: 'zhoufang@zhongtian.com', status: 'ENABLED', createdAt: '2025-06-10T15:45:00', lastLoginAt: '2026-10-08T09:12:11', createTime: '2025-06-10T15:45:00', updateTime: '2026-10-08T09:12:11', version: 1 },
  { id: 'U16', username: 'sunlei', name: '孙磊', companyId: 'C5', deptId: 'D14', position: '后勤专员', roleIds: ['R3'], phone: '13800000016', email: 'sunlei@huaxin.com', status: 'DISABLED', createdAt: '2025-08-19T11:05:00', lastLoginAt: '2026-09-28T17:30:49', createTime: '2025-08-19T11:05:00', updateTime: '2026-09-28T17:30:49', version: 1 }
]

const SEED_ROLES = [
  {
    id: 'R1', code: 'ROLE_ADMIN', name: '系统管理员', orgScope: 'GROUP', dataScope: 'ALL', status: 'ENABLED', sort: 1,
    remark: '拥有全部模块权限，负责系统配置与组织架构维护',
    permissions: ['fa:view', 'fa:add', 'fa:edit', 'fa:delete', 'fa:export', 'fa:inbound', 'fa:dispatch', 'fa:borrow', 'fa:change', 'fa:dispose', 'fa:inventory', 'fa:depreciation', 'fa:report', 'lv:view', 'lv:edit', 'lv:export', 'lv:inbound', 'lv:requisition', 'lv:return', 'lv:report', 'org:company', 'org:dept', 'org:user', 'org:role', 'sys:dict', 'sys:log', 'sys:workflow', 'sys:params', 'sys:message', 'sys:template', 'sys:terminal'],
    createTime: '2024-01-05T09:00:00', updateTime: '2026-09-18T10:22:31', version: 1
  },
  {
    id: 'R2', code: 'ROLE_ASSET', name: '资产管理员', orgScope: 'COMPANY', dataScope: 'COMPANY', status: 'ENABLED', sort: 2,
    remark: '负责资产台账、入库、派发、处置、盘点与低值资产出入库',
    permissions: ['fa:view', 'fa:add', 'fa:edit', 'fa:export', 'fa:inbound', 'fa:dispatch', 'fa:borrow', 'fa:change', 'fa:dispose', 'fa:inventory', 'fa:report', 'lv:view', 'lv:edit', 'lv:export', 'lv:inbound', 'lv:requisition', 'lv:return', 'lv:report'],
    createTime: '2024-01-05T09:05:00', updateTime: '2026-09-17T15:40:12', version: 1
  },
  {
    id: 'R3', code: 'ROLE_USER', name: '资产使用人', orgScope: 'DEPT', dataScope: 'DEPT_ONLY', status: 'ENABLED', sort: 3,
    remark: '普通员工，可查看本人名下资产并发起低值资产领用/退库',
    permissions: ['fa:view', 'lv:view', 'lv:requisition', 'lv:return'],
    createTime: '2024-01-05T09:10:00', updateTime: '2026-09-16T09:05:44', version: 1
  },
  {
    id: 'R4', code: 'ROLE_FINANCE', name: '财务管理员', orgScope: 'COMPANY', dataScope: 'COMPANY', status: 'ENABLED', sort: 4,
    remark: '负责折旧计提、资产报表与导出',
    permissions: ['fa:view', 'fa:export', 'fa:depreciation', 'fa:report', 'lv:view', 'lv:report', 'sys:log'],
    createTime: '2024-01-05T09:15:00', updateTime: '2026-09-15T14:22:08', version: 1
  },
  {
    id: 'R5', code: 'ROLE_LEADER', name: '部门主管', orgScope: 'DEPT', dataScope: 'DEPT', status: 'ENABLED', sort: 5,
    remark: '部门负责人，可审批本部门资产业务单据',
    permissions: ['fa:view', 'fa:edit', 'fa:dispatch', 'fa:borrow', 'fa:inventory', 'fa:report', 'lv:view', 'lv:requisition', 'lv:report'],
    createTime: '2024-01-05T09:20:00', updateTime: '2026-09-14T11:31:52', version: 1
  },
  {
    id: 'R6', code: 'ROLE_AUDITOR', name: '审计员', orgScope: 'GROUP', dataScope: 'ALL', status: 'ENABLED', sort: 6,
    remark: '只读权限，用于内审与合规检查',
    permissions: ['fa:view', 'fa:report', 'lv:view', 'lv:report', 'sys:log'],
    createTime: '2024-01-05T09:25:00', updateTime: '2026-09-13T16:48:20', version: 1
  }
]

export const ORG_SEEDS = {
  companies: SEED_COMPANIES,
  departments: SEED_DEPARTMENTS,
  users: SEED_USERS,
  roles: SEED_ROLES
}

export default ORG_SEEDS
