/**
 * 资产二维码编解码（扫码盘点 P1）。
 *
 * 新码统一为短文本 `FAMS|1|<资产编号>`：字符少、密度低、摄像头识别快，
 * 且不绑定内网 IP / 域名，标签打印后换网络环境仍可用。
 *
 * 解码器必须兼容历史标签：旧二维码是 5 行纯文本
 * `资产编号:xxx\n资产名称:xxx\n...`；同时兼容扫码枪打出的整串 URL（?c= 参数）
 * 与手工输入的纯编号。任何格式都只返回资产编号，业务字段一律由服务端按编号查。
 */

export const QR_PREFIX = 'FAMS|1|'

/** 生成资产二维码内容；无编号时返回空串，调用方应跳过生成 */
export function encodeAssetQr(asset) {
  const code = String(asset?.code ?? '').trim()
  return code ? `${QR_PREFIX}${code}` : ''
}

/**
 * 从扫码/输入文本中解析资产编号，无法识别时返回 null。
 * 支持：新短码、URL 码(?c=)、旧版多行文本、纯编号。
 */
export function decodeAssetQr(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null

  // 1. 新短码
  if (text.startsWith(QR_PREFIX)) {
    return text.slice(QR_PREFIX.length).trim() || null
  }

  // 2. URL 形式（含 c 参数）：兼容外部生成或过渡期标签
  const fromUrl = text.match(/[?&]c=([^&\s]+)/i)
  if (fromUrl) {
    try { return decodeURIComponent(fromUrl[1]).trim() || null } catch (e) { return fromUrl[1].trim() || null }
  }

  // 3. 历史纯文本二维码 / 扫码枪打出的多行文本：取「资产编号:」这一行
  const legacy = text.match(/资产编号\s*[:：]\s*([^\s\r\n]+)/)
  if (legacy) return legacy[1].trim() || null

  // 4. 纯编号（手工录入或扫码枪配置为只输出编号）
  if (/^[A-Za-z0-9_-]+$/.test(text)) return text

  return null
}
