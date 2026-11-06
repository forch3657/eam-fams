/**
 * 全局可访问性增强（P0）
 *
 * 背景：Element Plus 的 el-form-item 会把 label[for] 指向 prop 名，
 * 但内部 el-input / el-select 生成的输入框并没有对应 id，屏幕阅读器
 * 点击 label 时无法聚焦控件、也无法读出字段名。逐页补 id 会散落在 27 个
 * 页面，这里用一次全局扫描 + MutationObserver 统一补齐（含动态弹窗）。
 *
 * 焦点可见样式与 prefers-reduced-motion 由 styles/global.css 末尾负责。
 */

let seq = 0
let observer = null
let timer = null
const pending = new Set()

function linkItem(item) {
  const label = item.querySelector('.el-form-item__label')
  if (!label) return
  const control = item.querySelector('input:not([type="hidden"]), textarea, select')
  if (!control) return
  if (!control.id) control.id = `a11y-field-${++seq}`
  // 总是覆盖：Element Plus 默认 for=prop，与实际控件 id 并不匹配
  if (label.getAttribute('for') !== control.id) label.setAttribute('for', control.id)
  if (!label.id) label.id = `${control.id}-label`
  if (!control.hasAttribute('aria-label') && !control.hasAttribute('aria-labelledby')) {
    control.setAttribute('aria-labelledby', label.id)
  }
}

function linkFormLabels(root) {
  if (!root || root.nodeType !== 1) return
  if (root.classList?.contains('el-form-item')) linkItem(root)
  root.querySelectorAll?.('.el-form-item').forEach(linkItem)
}

function flush() {
  pending.forEach(linkFormLabels)
  pending.clear()
}

/**
 * @param {import('vue-router').Router} [router] 传入时路由切换后补扫一次
 */
export function installA11y(router) {
  if (typeof document === 'undefined') return

  linkFormLabels(document.body)

  observer = new MutationObserver(list => {
    let changed = false
    for (const mutation of list) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          pending.add(node)
          changed = true
        }
      }
    }
    if (!changed) return
    // 弹窗 / 表格 / 页签切换会连续插入大量节点，节流后一次扫完
    clearTimeout(timer)
    timer = setTimeout(flush, 120)
  })
  observer.observe(document.body, { childList: true, subtree: true })

  if (router) router.afterEach(() => setTimeout(() => linkFormLabels(document.body), 0))
}

export function uninstallA11y() {
  observer?.disconnect()
  observer = null
  clearTimeout(timer)
  pending.clear()
}
