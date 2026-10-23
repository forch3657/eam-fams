/**
 * 盘点演示数据构造器
 *
 * 原先写在 mock 种子文件里，但"生成盘点计划"向导也要用；
 * 放到 utils 后，种子与视图共用同一份实现（视图不直接依赖 mock 种子文件）。
 */

// 盘点人员池
const EMP_POOL = [
  { userId: 'U2', name: '张伟', deptId: 'D1', phone: '13800000002' },
  { userId: 'U3', name: '李娜', deptId: 'D2', phone: '13800000003' },
  { userId: 'U4', name: '王强', deptId: 'D3', phone: '13800000004' },
  { userId: 'U5', name: '刘洋', deptId: 'D4', phone: '13800000005' },
  { userId: 'U8', name: '冯涛', deptId: 'D7', phone: '13800000008' },
  { userId: 'U9', name: '高翔', deptId: 'D102', phone: '13800000009' },
  { userId: 'U10', name: '周静', deptId: 'D8', phone: '13800000010' },
  { userId: 'U13', name: '陈静', deptId: 'D11', phone: '13800000013' }
]
const ASSET_STATUS_POOL = ['IDLE', 'IN_USE', 'REPAIRING', 'BORROWED', 'DISPATCHING']
const LOCATION_POOL = ['总部办公楼1层', '总部办公楼2层', '总部办公楼3层', '仓库A区', '仓库B区', '数据中心机房']
const ASSET_REF_POOL = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'A12', 'A13']

export function pad2(n) { return String(n).padStart(2, '0') }

/**
 * 构造盘点明细
 * @param {number} total 明细条数
 * @param {number} counted 已盘条数
 * @param {number} seed 随机种子（保证演示数据稳定）
 * @param {Array} assets 资产台账（用于带出资产编号/名称快照）
 */
export function buildCheckItems(total, counted, seed, assets = []) {
  const items = []
  for (let i = 0; i < total; i++) {
    const assetId = ASSET_REF_POOL[(i + seed) % ASSET_REF_POOL.length]
    const emp = EMP_POOL[(i + seed) % EMP_POOL.length]
    let itemStatus = 'UNCHECKED'
    let remark = ''
    let checker = null
    let checkTime = ''

    if (i < counted) {
      itemStatus = 'CHECKED'
      remark = '账实相符'
      checker = emp.userId
      checkTime = `2026-09-${pad2(10 + (i % 8))}T${pad2(9 + (i % 8))}:${pad2((i * 7) % 60)}:00`
    } else if (i === counted && seed % 3 === 1) {
      itemStatus = 'LOSS'
      remark = '现场未找到实物，待核销'
      checker = emp.userId
      checkTime = `2026-09-${pad2(12 + (i % 6))}T15:30:00`
    } else if (i === counted && seed % 3 === 2) {
      itemStatus = 'ABNORMAL'
      remark = '编号标签破损，待补贴标签'
      checker = emp.userId
      checkTime = `2026-09-${pad2(12 + (i % 6))}T16:10:00`
    }

    const asset = assets.find(a => a.id === assetId)
    items.push({
      assetId,
      // 盘点明细保留资产快照，便于单据脱离主数据后仍可追溯
      assetNo: asset ? asset.code : '',
      assetName: asset ? asset.name : '',
      assetStatus: asset ? asset.status : ASSET_STATUS_POOL[(i + seed) % ASSET_STATUS_POOL.length],
      location: LOCATION_POOL[(i + seed) % LOCATION_POOL.length],
      itemStatus,
      remark,
      checker,
      createTime: `2026-09-0${(seed % 8) + 1}T10:00:00`,
      checkTime
    })
  }
  return items
}

/** 构造盘点员分配列表 */
export function buildCounters(n, doneCount, seed) {
  const list = []
  for (let i = 0; i < n; i++) {
    const e = EMP_POOL[(i + seed) % EMP_POOL.length]
    const assigned = 4 + (seed % 3)
    list.push({
      userId: e.userId,
      name: e.name,
      deptId: e.deptId,
      phone: e.phone,
      assigned,
      done: i < doneCount ? assigned : 0,
      status: i < doneCount ? 'DONE' : 'COUNTING'
    })
  }
  return list
}

export default { buildCheckItems, buildCounters }
