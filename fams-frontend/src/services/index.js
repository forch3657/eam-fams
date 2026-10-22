// 统一数据服务出口：默认 mock，改 .env 即可切到后端 HTTP 接口
// VITE_USE_MOCK=false 且 VITE_API_BASE_URL 非空 -> HTTP；其余情况一律回落 mock（避免误配白屏）
import { mockService, registerSeed } from './mock'
import { httpService } from './http'

const rawMock = String(import.meta.env.VITE_USE_MOCK ?? 'true')
const baseUrl = String(import.meta.env.VITE_API_BASE_URL ?? '').trim()

export const useMock = rawMock !== 'false' || !baseUrl
export const dataMode = useMock ? 'mock' : 'api'

/**
 * 统一门面：业务代码只依赖它，不感知当前是 mock 还是后端。
 * 两个实现的方法签名与返回结构完全一致：
 *   list(key, params) -> Row[]
 *   page(key, params) -> { rows, total, page, pageSize }
 *   get(key, id)      -> Row
 *   create(key, row)  -> Row
 *   update(key, id, patch) -> Row
 *   remove(key, id)   -> true
 *   batch(key, rows)  -> Row[]
 *   clear(key)        -> true
 * 失败一律抛 ApiError（见 errors.js）。
 */
export const dataService = useMock ? mockService : httpService

export { registerSeed }
export { COLLECTION } from './collections'
export { ApiError, ERROR_CODES, isApiError, toApiError } from './errors'
export * from './contract'

export default dataService
