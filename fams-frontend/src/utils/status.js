/**
 * 状态标签与审批结果的「颜色 / 文案」单一真源（P1 一致性收敛）
 *
 * 背景：DOC_STATUS 的 el-tag 类型映射曾在 TodoPanel、LowValueAssetManagement、
 * FixedAssetDocList、DocApprovalDialog 各写一份；新增状态或改配色时容易漏改，
 * 出现「同一状态不同颜色」。新增页面一律从这里取，不要再造局部映射。
 */
import { labelOf } from '../constants/enums'

/** 单据状态 → el-tag type */
export const DOC_STATUS_TYPE = {
  DRAFT: 'warning',
  PROCESSING: 'primary',
  REJECTED: 'danger',
  REVOKED: 'info',
  DONE: 'success'
}

/** 审批轨迹结果 → el-tag / el-timeline type（含 2026-11-06 六动作新增结果码） */
export const APPROVE_RESULT_TYPE = {
  SUBMIT: 'primary',
  WITHDRAW: 'warning',
  AGREE: 'success',
  REJECT: 'danger',
  REVOKE: 'info',
  VOID: 'info',
  TERMINATE: 'danger',
  ADD_SIGN: 'info',
  TRANSFER: 'info',
  CC: 'info'
}

/** 终端设备状态 → el-tag type */
export const DEVICE_STATUS_TYPE = {
  ONLINE: 'success',
  OFFLINE: 'info',
  ABNORMAL: 'danger',
  DISABLED: 'info'
}

export const statusType = status => DOC_STATUS_TYPE[status] || 'info'
export const statusLabel = status => labelOf('DOC_STATUS', status) || status || '-'
export const approveResultType = result => APPROVE_RESULT_TYPE[result] || 'info'
export const approveResultLabel = result => labelOf('APPROVE_RESULT', result) || result || '-'
export const deviceStatusType = status => DEVICE_STATUS_TYPE[status] || 'info'

/** 通用兜底：给尚未建映射的业务枚举用 */
export function tagTypeOf(mapping, value, fallback = 'info') {
  return (mapping && mapping[value]) || fallback
}
