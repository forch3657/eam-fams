// 统一数据服务出口：默认 mock，改 .env 即可切到后端 HTTP 接口
// VITE_USE_MOCK=false 且 VITE_API_BASE_URL 非空 -> HTTP；其余情况一律回落 mock（避免误配白屏）
import { mockService, registerSeed } from './mock'
import { httpService } from './http'

const rawMock = String(import.meta.env.VITE_USE_MOCK ?? 'true')
const baseUrl = String(import.meta.env.VITE_API_BASE_URL ?? '').trim()

export const useMock = rawMock !== 'false' || !baseUrl
export const dataMode = useMock ? 'mock' : 'api'

export const dataService = useMock ? mockService : httpService

export { registerSeed }
export { COLLECTION } from './collections'

export default dataService
