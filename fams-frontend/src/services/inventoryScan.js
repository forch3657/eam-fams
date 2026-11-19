/**
 * 扫码盘点业务接口封装。
 *
 * 只负责：取可盘单据、把一条扫码结果提交给后端、解析扫码文本、生成幂等键。
 * 摄像头取流在 utils/scanCamera.js，界面在 views/fixed-asset/InventoryScan.vue。
 */
import { request } from './http'
import { ERROR_CODES } from './errors'
import { decodeAssetQr } from '../utils/qrCodec'

const BASE = '/inventory-scan'

export { decodeAssetQr }

/** 客户端幂等键：网络重试时沿用同一个值，服务端据此保证不双写 */
export function newScanId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** 当前账号可执行（草稿/驳回且已分派）的盘点单摘要 */
export async function fetchScanDocs() {
  const rows = await request(`${BASE}/docs`, { silent: true })
  return Array.isArray(rows) ? rows : []
}

/**
 * 登记一条扫码结果。
 *
 * 409 且提示为并发冲突时，用同一 clientScanId 短暂退避重试：
 * 若上一次其实已写入，服务端会返回 IDEMPOTENT；若确实冲突，重试即可成功。
 * 其余错误（无权 / 单据状态 / 参数校验）原样抛出由界面展示。
 */
export async function recordScan(docId, payload) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await request(`${BASE}/${encodeURIComponent(docId)}/record`, {
        method: 'POST',
        data: payload,
        silent: true
      })
    } catch (err) {
      const conflict = Number(err?.code) === ERROR_CODES.CONFLICT || Number(err?.status) === 409
      const retryable = /并发冲突|数据已被他人修改/.test(String(err?.message || ''))
      if (conflict && retryable && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)))
        continue
      }
      throw err
    }
  }
  return null
}
