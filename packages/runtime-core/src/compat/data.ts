// Vue 3 兼容性模块 - 数据合并
// 此模块提供 Vue 2 风格的数据合并功能
import { isPlainObject } from '@vue/shared'
import { DeprecationTypes, warnDeprecation } from './compatConfig'

/**
 * 深度合并数据对象
 * @param to - 目标对象，合并后的数据会保存到该对象
 * @param from - 源对象，提供要合并的数据
 * @returns 合并后的目标对象
 * @deprecated Vue 3 中已不推荐使用这种数据合并方式
 */
export function deepMergeData(to: any, from: any): any {
  // 遍历源对象的所有属性
  for (const key in from) {
    const toVal = to[key]
    const fromVal = from[key]

    // 如果目标对象中存在该属性，且两者都是纯对象，则递归合并
    if (key in to && isPlainObject(toVal) && isPlainObject(fromVal)) {
      // 在开发环境下发出弃用警告
      __DEV__ && warnDeprecation(DeprecationTypes.OPTIONS_DATA_MERGE, null, key)
      deepMergeData(toVal, fromVal)
    } else {
      // 否则直接覆盖目标对象中的属性
      to[key] = fromVal
    }
  }

  // 返回合并后的目标对象
  return to
}
