import { useBreakpoint } from '../composables/useBreakpoint'

/**
 * 手机端显示质量的全局增强（沿用 responsiveTable.js 的 MutationObserver 模式）：
 * 1. 给 el-form.search-form 加折叠头，避免 6~8 个筛选项占满首屏；
 * 2. 按路由配置只保留 4~6 个核心列，其余列在卡片视图隐藏，详情走页面已有的入口。
 *
 * 桌面端完全不注入 DOM/属性，只靠 CSS 在 <=767px 生效，因此零回归。
 */
const FILTER_MARK = 'data-mobile-filter'
const FILTER_COLLAPSED = 'is-filter-collapsed'
const CARD_MARK = 'data-mobile-cards'
const HIDDEN = 'data-mobile-hidden'

/** 键为路由 path，值为手机卡片保留的表头文字（与桌面 el-table-column label 一致） */
const KEEP_LABELS = {
  '/fixed-asset-reports': ['资产分类', '公司', '数量', '总金额', '占比'],
  '/fixed-asset-settings': ['位置名称', '分类名称', '计划名称', '规则名称', '状态'],
  '/low-value-assets': ['物品编码', '物品名称', '物品类别', '物品数量', '状态'],
  '/low-value-asset-reports': ['物品类别', '公司', '库存金额', '占比'],
  '/low-value-asset-settings': ['位置名称', '位置编码', '负责人', '状态'],
  '/system/company': ['公司名称', '公司编码', '上级公司', '状态'],
  '/system/dept': ['部门名称', '部门编码', '所属公司', '状态'],
  '/system/user': ['姓名', '用户名', '所属部门', '状态'],
  '/system/role': ['角色名称', '角色编码', '数据范围', '状态'],
  '/system/dict': ['字典名称', '标签', '值（枚举编码）', '状态'],
  '/system/message-center': ['标题', '时间', '类型', '状态'],
  '/system/message-template': ['标题模板', '触发场景', '通道', '启用'],
  '/system/terminal': ['终端编号', '终端名称', '存放位置', '状态']
}

let started = false
let timer = 0

function enhanceFilters() {
  document.querySelectorAll('.search-form').forEach(form => {
    if (form.hasAttribute(FILTER_MARK)) return
    const hasControl = form.querySelector('input, .el-select, .el-date-editor')
    if (!hasControl) return

    form.setAttribute(FILTER_MARK, '')
    form.classList.add(FILTER_COLLAPSED)

    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'mobile-filter-toggle'
    toggle.setAttribute('aria-expanded', 'false')
    toggle.textContent = '筛选条件'
    toggle.addEventListener('click', () => {
      const collapsed = form.classList.toggle(FILTER_COLLAPSED)
      toggle.setAttribute('aria-expanded', String(!collapsed))
    })
    form.parentNode.insertBefore(toggle, form)
  })
}

function decorateTable(table, keep) {
  // 表格常在首轮扫描后才异步填入 tbody，不能因为已标记就跳过；这里做幂等重扫
  if (!keep || !keep.length) return

  const headerRows = table.querySelectorAll('.el-table__header-wrapper thead tr')
  const header = headerRows[headerRows.length - 1]
  if (!header) return

  const labels = Array.from(header.querySelectorAll('th')).map(th => {
    const cell = th.querySelector('.cell')
    return (cell?.textContent || th.textContent || '').trim()
  })
  if (!labels.some(Boolean)) return

  table.querySelectorAll('tbody tr').forEach(tr => {
    tr.querySelectorAll('td').forEach(td => {
      const label = labels[td.cellIndex]
      if (!label) return
      // 操作列始终保留；其余按配置决定
      if (label === '操作' || keep.includes(label)) {
        td.removeAttribute(HIDDEN)
      } else {
        td.setAttribute(HIDDEN, '')
      }
    })
  })
}

function enhanceCards() {
  const keep = KEEP_LABELS[location.pathname]
  if (!keep) return
  document.querySelectorAll('.el-table').forEach(table => decorateTable(table, keep))
}

function schedule() {
  if (timer) return
  timer = setTimeout(() => {
    timer = 0
    if (!useBreakpoint().isPhone.value) return
    enhanceFilters()
    enhanceCards()
  }, 90)
}

export function installResponsiveEnhance(router) {
  if (started) return
  started = true
  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('resize', schedule, { passive: true })
  if (router?.afterEach) router.afterEach(() => setTimeout(schedule, 120))
  schedule()
}
