/**
 * 单据编号生成
 *
 * 规则：前缀 + 年份 + 序号（如 RK20261001）。
 * 种子数据占用 100~900 段，新增单据从 1000 起递增，避免撞号。
 */

/**
 * 生成不与现有单号重复的单号
 * @param {string} prefix 单号前缀（RK/FP/TK/JC/DB/WX/BG/CZ…）
 * @param {string[]} existingCodes 集合中已有的单号
 * @param {number} [year] 年份，默认当前年
 * @param {number} [start] 起始序号，默认 1000
 */
export function genDocNo(prefix, existingCodes = [], year = new Date().getFullYear(), start = 1000) {
  const exists = new Set(existingCodes.filter(Boolean))
  let seq = start
  while (exists.has(`${prefix}${year}${seq}`)) seq += 1
  return `${prefix}${year}${seq}`
}

export default genDocNo
