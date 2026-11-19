import { watch } from 'vue'
import { useBreakpoint } from '../composables/useBreakpoint'

/**
 * 手机端表格卡片化的列名注入器。
 *
 * 卡片样式由 global.css 在 <=767px 内用 CSS 完成（桌面 DOM 与 CSS 均不受影响）；
 * 这里只把表头文字写到每个单元格的 data-table-label，供 ::before 显示字段名。
 * 与 utils/a11y.js 同属「挂载前注册 MutationObserver 全局增强 DOM」的既有模式。
 */
const ATTR = 'data-table-label'
const SCAN_DELAY = 80

let observer = null
let timer = 0
let followTimer = 0
let stopWatch = null
let stopRouterHook = null

function headerLabels(tableEl) {
  // 不限制在 header-wrapper 内：带 fixed 列或自定义表头的表格也能取到列名
  const rows = tableEl.querySelectorAll('thead tr')
  const last = rows[rows.length - 1]
  if (!last) return []
  return Array.from(last.querySelectorAll('th')).map(th => {
    const cell = th.querySelector('.cell')
    return (cell?.textContent || th.textContent || '').trim()
  })
}

function decorate(tableEl) {
  const labels = headerLabels(tableEl)
  // 覆盖 .el-table 下所有 tbody（含 EP 为 fixed 列生成的表格副本）
  const bodyRows = tableEl.querySelectorAll('tbody tr')
  bodyRows.forEach(tr => {
    tr.querySelectorAll('td').forEach((td, index) => {
      td.setAttribute(ATTR, labels[td.cellIndex ?? index] || '')
    })
  })
}

function clearDecorations() {
  document.querySelectorAll(`[${ATTR}]`).forEach(el => el.removeAttribute(ATTR))
}

function scan() {
  const phone = useBreakpoint().isPhone.value
  if (!phone) {
    clearDecorations()
    return
  }
  document.querySelectorAll('.el-table').forEach(decorate)
  // 数据异步晚到时首轮可能扫到空 tbody；只要还有未标注单元格就再补扫一次
  if (!followTimer && document.querySelector('.el-table__body-wrapper tbody tr td:not([data-table-label])')) {
    followTimer = setTimeout(() => {
      followTimer = 0
      scan()
    }, 800)
  }
}

/** 只监听 childList：注入的是 attribute，不会触发自身 observer 造成循环 */
function schedule() {
  if (timer) return
  timer = setTimeout(() => {
    timer = 0
    scan()
    // 表格数据常在首轮扫描之后才异步挂载，下一帧再补扫一次
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(scan)
  }, SCAN_DELAY)
}

export function installResponsiveTable(router) {
  if (observer) return
  const bp = useBreakpoint()
  observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('resize', schedule, { passive: true })
  if (router?.afterEach) stopRouterHook = router.afterEach(() => schedule())
  stopWatch = watch(bp.isPhone, schedule)
  schedule()
}

export function uninstallResponsiveTable() {
  if (observer) observer.disconnect()
  observer = null
  window.removeEventListener('resize', schedule)
  if (timer) {
    clearTimeout(timer)
    timer = 0
  }
  if (followTimer) {
    clearTimeout(followTimer)
    followTimer = 0
  }
  if (stopWatch) {
    stopWatch()
    stopWatch = null
  }
  if (stopRouterHook) {
    stopRouterHook()
    stopRouterHook = null
  }
  clearDecorations()
}

if (import.meta.hot) import.meta.hot.dispose(uninstallResponsiveTable)
