/**
 * 松散相等比较工具函数
 * 提供宽松的相等性检查，适用于不同类型的值比较
 * @module shared/looseEqual
 */
import { isArray, isDate, isObject, isSymbol } from './general'

/**
 * 松散比较两个数组是否相等
 * @param {any[]} a - 第一个要比较的数组
 * @param {any[]} b - 第二个要比较的数组
 * @returns {boolean} 如果数组长度相同且对应元素都松散相等则返回true，否则返回false
 */
function looseCompareArrays(a: any[], b: any[]) {
  if (a.length !== b.length) return false
  let equal = true
  for (let i = 0; equal && i < a.length; i++) {
    equal = looseEqual(a[i], b[i])
  }
  return equal
}

/**
 * 检查两个值是否松散相等
 * 支持多种类型的比较，包括原始类型、日期、符号、数组和对象
 * @param {any} a - 第一个要比较的值
 * @param {any} b - 第二个要比较的值
 * @returns {boolean} 如果值松散相等则返回true，否则返回false
 * @example
 * looseEqual(1, '1') // true
 * looseEqual([1, 2], [1, 2]) // true
 * looseEqual({a: 1}, {a: 1}) // true
 * looseEqual(new Date('2020-01-01'), new Date('2020-01-01')) // true
 */
export function looseEqual(a: any, b: any): boolean {
  // 严格相等检查（快速路径）
  if (a === b) return true

  // 处理日期类型
  let aValidType = isDate(a)
  let bValidType = isDate(b)
  if (aValidType || bValidType) {
    return aValidType && bValidType ? a.getTime() === b.getTime() : false
  }

  // 处理符号类型
  aValidType = isSymbol(a)
  bValidType = isSymbol(b)
  if (aValidType || bValidType) {
    return a === b
  }

  // 处理数组类型
  aValidType = isArray(a)
  bValidType = isArray(b)
  if (aValidType || bValidType) {
    return aValidType && bValidType ? looseCompareArrays(a, b) : false
  }

  // 处理对象类型
  aValidType = isObject(a)
  bValidType = isObject(b)
  if (aValidType || bValidType) {
    if (!aValidType || !bValidType) {
      return false
    }

    // 比较对象键数量
    const aKeysCount = Object.keys(a).length
    const bKeysCount = Object.keys(b).length
    if (aKeysCount !== bKeysCount) {
      return false
    }

    // 比较对象属性
    for (const key in a) {
      const aHasKey = a.hasOwnProperty(key)
      const bHasKey = b.hasOwnProperty(key)
      if (
        (aHasKey && !bHasKey) ||
        (!aHasKey && bHasKey) ||
        !looseEqual(a[key], b[key])
      ) {
        return false
      }
    }
  }

  // 最后尝试字符串比较
  return String(a) === String(b)
}

/**
 * 在数组中查找与给定值松散相等的元素的索引
 * 使用looseEqual函数进行比较
 * @param {any[]} arr - 要搜索的数组
 * @param {any} val - 要查找的值
 * @returns {number} 找到的元素索引，如果未找到则返回-1
 * @example
 * looseIndexOf([1, 2, 3], '2') // 1
 * looseIndexOf([{a: 1}, {a: 2}], {a: 1}) // 0
 */
export function looseIndexOf(arr: any[], val: any): number {
  return arr.findIndex(item => looseEqual(item, val))
}
