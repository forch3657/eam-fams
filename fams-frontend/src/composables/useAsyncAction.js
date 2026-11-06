/**
 * 统一异步动作状态（P0 交互反馈基线）
 *
 * 解决各页面手写提交逻辑时常见的三个问题：请求期间按钮不禁用导致重复提交、
 * 失败提示文案不一致、成功/失败没有统一反馈。返回 { loading, run }，
 * 组件把按钮 :loading="loading" 并把提交处理交给 run 即可。
 *
 * 约定：handler 既可抛出异常，也可返回 { ok, message }（与审批动作一致）。
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

export function useAsyncAction(handler, options = {}) {
  const { successMessage = '', errorMessage = '操作失败', notify = null } = options
  const loading = ref(false)

  const show = (type, text) => {
    if (!text) return
    if (notify) return notify(type, text)
    if (type === 'error') ElMessage.error(text)
    else if (type === 'success') ElMessage.success(text)
    else ElMessage.info(text)
  }

  async function run(...args) {
    if (loading.value) return { ok: false, message: '正在处理中，请稍候' }
    loading.value = true
    try {
      const res = await handler(...args)
      if (res && res.ok === false) {
        show('error', res.message || errorMessage)
        return res
      }
      show('success', typeof successMessage === 'function' ? successMessage(res) : successMessage)
      return res ?? { ok: true }
    } catch (err) {
      const message = err?.message || errorMessage
      show('error', message)
      return { ok: false, message }
    } finally {
      loading.value = false
    }
  }

  return { loading, run }
}
