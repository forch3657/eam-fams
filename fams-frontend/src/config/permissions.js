// 系统权限树：按本系统实际模块组织，角色权限勾选的叶子节点即权限编码
export const PERMISSION_TREE = [
  {
    id: 'workbench',
    label: '工作台',
    children: [
      { id: 'wm:view', label: '工作台访问' },
      { id: 'wm:todo', label: '我的待办' },
      { id: 'wm:alert', label: '预警中心' },
      { id: 'wm:overview', label: '概览看板' },
      { id: 'wm:message', label: '我的消息' }
    ]
  },
  {
    id: 'fixedAsset',
    label: '固定资产',
    children: [
      { id: 'fa:view', label: '资产台账查看' },
      { id: 'fa:add', label: '资产新增' },
      { id: 'fa:edit', label: '资产编辑' },
      { id: 'fa:delete', label: '资产删除' },
      { id: 'fa:export', label: '台账导出' },
      { id: 'fa:inbound', label: '入库/验收' },
      { id: 'fa:dispatch', label: '派发/退库' },
      { id: 'fa:borrow', label: '借出使用' },
      { id: 'fa:change', label: '资产变更' },
      { id: 'fa:dispose', label: '资产处置' },
      { id: 'fa:inventory', label: '资产盘点' },
      { id: 'fa:depreciation', label: '折旧管理' },
      { id: 'fa:report', label: '资产报表' }
    ]
  },
  {
    id: 'lowValue',
    label: '低值资产',
    children: [
      { id: 'lv:view', label: '库存台账查看' },
      { id: 'lv:edit', label: '物品维护' },
      { id: 'lv:export', label: '台账导出' },
      { id: 'lv:inbound', label: '入库办理' },
      { id: 'lv:requisition', label: '领用办理' },
      { id: 'lv:return', label: '退库办理' },
      { id: 'lv:report', label: '资产报表' }
    ]
  },
  {
    id: 'org',
    label: '组织架构',
    children: [
      { id: 'org:company', label: '公司管理' },
      { id: 'org:dept', label: '部门管理' },
      { id: 'org:user', label: '用户管理' },
      { id: 'org:role', label: '角色管理' }
    ]
  },
  {
    id: 'system',
    label: '系统管理',
    children: [
      { id: 'sys:dict', label: '数据字典' },
      { id: 'sys:log', label: '操作日志' },
      { id: 'sys:workflow', label: '流程配置' },
      { id: 'sys:params', label: '系统参数' },
      { id: 'sys:message', label: '消息中心' },
      { id: 'sys:template', label: '消息模板' },
      { id: 'sys:terminal', label: '盘点终端' }
    ]
  }
]

/** 全部叶子权限编码 */
export const ALL_PERMISSIONS = PERMISSION_TREE.flatMap(m => m.children.map(c => c.id))

export default PERMISSION_TREE
