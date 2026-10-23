/**
 * 数据字典 → 业务枚举 的装载器
 *
 * 设计目标：**数据字典是业务枚举的统一维护入口**。
 * 字典项（如 asset_status / IDLE=空闲）灌入 constants/enums.js 的运行时覆盖表后，
 * 全站 labelOf()/optionsOf() 立即改用字典文案，做到"改字典 = 改全站文案"，无需改代码。
 *
 * 约定：
 * - 只装载「已绑定枚举」的字典类型（见 enums.js 的 ENUM_DICT_META）；
 * - 停用的字典项不进入下拉选项（optionsOf），但 labelOf 仍可取到内置文案，避免历史数据空白；
 * - 非 mock 模式下同样从接口读字典，装载逻辑与后端无关。
 */
import { dataService, COLLECTION } from './index'
import { applyDictEnums, DICT_CODE_TO_ENUM } from '../constants/enums'

/** 字典项所在集合名：system-dict-types-{字典编码}-items */
function itemsCollection(dictCode) {
  return `${COLLECTION.systemDictTypes}-${dictCode}-items`
}

/**
 * 装载字典枚举。
 * @returns {Promise<Record<string, Record<string,string>>>} 覆盖表 { ASSET_STATUS: { IDLE: '空闲' } }
 */
export async function loadDictEnums() {
  const result = {}
  let types = []
  try {
    types = await dataService.list(COLLECTION.systemDictTypes)
  } catch (e) {
    // 字典不可用时退回内置枚举，不影响主流程
    applyDictEnums({})
    return result
  }

  for (const t of types) {
    const enumName = DICT_CODE_TO_ENUM[t.code]
    if (!enumName) continue
    if (t.status && t.status !== 'ENABLED') continue
    let items = []
    try {
      items = await dataService.list(itemsCollection(t.code))
    } catch (e) {
      continue
    }
    const map = {}
    ;[...items]
      .filter(i => i.status !== 'DISABLED')
      .sort((a, b) => (a.sort || 0) - (b.sort || 0))
      .forEach(i => {
        if (i.value) map[i.value] = i.label || i.value
      })
    if (Object.keys(map).length) result[enumName] = map
  }

  applyDictEnums(result)
  return result
}

export default loadDictEnums
