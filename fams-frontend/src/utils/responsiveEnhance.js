import { useBreakpoint } from '../composables/useBreakpoint'
import { pickCoreLabels } from '../constants/mobileColumns'

/**
 * 手机端显示质量的全局增强（沿用 responsiveTable.js 的 MutationObserver 模式）：
 * 1. 给 el-form.search-form 加折叠头，避免 6~8 个筛选项占满首屏；
 * 2. 按每张表自身的表头识别 4~6 个核心列，其余列在卡片视图隐藏。
 *    同一页多个页签（入库/领用/退库）、报表各表头都不同，不能按路由写死一套配置。
 *
 * 桌面端完全不注入 DOM/属性，只靠 CSS 在 <=767px 生效，因此零回归。
 */
const FILTER_MARK = 'data-mobile-filter'
const FILTER_COLLAPSED = 'is-filter-collapsed'
const CARD_MARK = 'data-mobile-cards'
const HIDDEN = 'data-mobile-hidden'

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

function decorateTable(table) {
  // 表格常在首轮扫描后才异步填入 tbody，这里做幂等重扫
  const headerRows = table.querySelectorAll('.el-table__header-wrapper thead tr')
  const header = headerRows[headerRows.length - 1]
  if (!header) return

  const labels = Array.from(header.querySelectorAll('th')).map(th => {
    const cell = th.querySelector('.cell')
    return (cell?.textContent || th.textContent || '').trim()
  })
  if (!labels.some(Boolean)) return
  // 每张表按自己的表头挑核心列，页签/报表互不干扰
  const keep = pickCoreLabels(labels)

  table.querySelectorAll('tbody tr').forEach(tr => {
    tr.querySelectorAll('td').forEach(td => {
      const label = labels[td.cellIndex]
      if (!label) return
      // 操作列始终保留；其余按配置决定
      if (/操作/.test(label) || keep.includes(label)) {
        td.removeAttribute(HIDDEN)
      } else {
        td.setAttribute(HIDDEN, '')
      }
    })
  })
  table.setAttribute(CARD_MARK, '')
}

function enhanceCards() {
  document.querySelectorAll('.el-table').forEach(decorateTable)
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
