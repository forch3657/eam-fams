/**
 * 系统参数读取器
 *
 * 约定：系统参数（系统管理 > 系统参数）必须真正被业务消费，否则只是摆设。
 * 业务侧通过 paramValue()/paramNumber() 取值，取不到时用业务侧默认值兜底。
 *
 * 已接入的参数：
 * - sys.asset.code.prefix      固定资产卡片编号前缀（资产新增时生效）
 * - sys.lowvalue.code.prefix   低值物品编号前缀（物品新增时生效）
 * - sys.lowvalue.safetyRatio   低库存预警比例（低于安全库存该比例时预警）
 * - sys.inventory.remind.days  盘点截止前多少天开始提醒
 */
import { ref } from 'vue'
import { dataService, COLLECTION } from './index'

const params = ref({})
const loaded = ref(false)

/** 装载全部系统参数 */
export async function loadSysParams() {
  try {
    const rows = await dataService.list(COLLECTION.systemParams)
    params.value = (rows || []).reduce((m, r) => {
      if (r && r.key) m[r.key] = r.value
      return m
    }, {})
  } catch (e) {
    params.value = {}
  }
  loaded.value = true
  return params.value
}

/** 取参数值（字符串） */
export function paramValue(key, fallback = '') {
  const v = params.value[key]
  return v === undefined || v === null || v === '' ? fallback : v
}

/** 取参数值（数字） */
export function paramNumber(key, fallback) {
  const n = Number(paramValue(key, fallback))
  return Number.isFinite(n) ? n : fallback
}

export const sysParams = { params, loaded, loadSysParams, paramValue, paramNumber }

export default sysParams
