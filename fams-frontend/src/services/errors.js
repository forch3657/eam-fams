/**
 * 统一错误模型：mock 与 HTTP 两种实现抛出完全相同的错误，
 * 业务代码只需 catch ApiError 并读 code/message，切换数据源时无需改动。
 */

/** 业务/协议错误码（与后端约定：0 表示成功） */
export const ERROR_CODES = {
  OK: 0,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 422,
  SERVER: 500,

  // 业务错误码（1000+）：与后端约定后由服务端返回同样编码
  STOCK_INSUFFICIENT: 1001,
  HAS_CHILDREN: 1002,
  HAS_REFERENCE: 1003,
  DUPLICATE: 1004,
  REF_NOT_FOUND: 1005,
  EXCEED_RETURNED: 1006
}

const DEFAULT_MESSAGES = {
  400: '请求参数有误',
  401: '未登录或登录已失效',
  403: '没有操作权限',
  404: '数据不存在',
  409: '数据冲突',
  422: '数据校验未通过',
  500: '服务异常，请稍后重试',
  1001: '库存不足',
  1002: '存在下级数据，不能删除',
  1003: '已被其他数据引用，不能删除',
  1004: '数据重复',
  1005: '关联数据不存在',
  1006: '数量超出可退范围'
}

export class ApiError extends Error {
  /**
   * @param {number} code 错误码，见 ERROR_CODES
   * @param {string} [message] 面向用户的提示文案
   * @param {number} [status] HTTP 状态码（HTTP 模式下有意义，mock 模式为 0）
   * @param {*} [details] 结构化详情（如字段级校验错误）
   */
  constructor(code, message, status = 0, details = undefined) {
    super(message || DEFAULT_MESSAGES[code] || '操作失败')
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export function isApiError(err) {
  return err instanceof ApiError
}

/** 把任意异常规整为 ApiError，便于视图统一提示 */
export function toApiError(err) {
  if (err instanceof ApiError) return err
  return new ApiError(ERROR_CODES.SERVER, err?.message || '操作失败')
}

/** 快捷构造 */
export const apiError = {
  notFound: (msg) => new ApiError(ERROR_CODES.NOT_FOUND, msg),
  conflict: (msg) => new ApiError(ERROR_CODES.CONFLICT, msg),
  validation: (msg, details) => new ApiError(ERROR_CODES.VALIDATION, msg, 0, details),
  stockInsufficient: (msg) => new ApiError(ERROR_CODES.STOCK_INSUFFICIENT, msg),
  hasChildren: (msg) => new ApiError(ERROR_CODES.HAS_CHILDREN, msg),
  hasReference: (msg) => new ApiError(ERROR_CODES.HAS_REFERENCE, msg),
  refNotFound: (msg) => new ApiError(ERROR_CODES.REF_NOT_FOUND, msg)
}

export default ApiError
