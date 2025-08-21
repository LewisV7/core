// 枚举通过自定义转换被编译掉，因此这里没有实际依赖
// 此文件提供将值转换为显示字符串的功能，主要用于处理模板中的 {{ 插值表达式 }}
import { ReactiveFlags } from '@vue/reactivity'
import {
  isArray,
  isFunction,
  isMap,
  isObject,
  isPlainObject,
  isSet,
  isString,
  isSymbol,
  objectToString,
} from './general'

/**
 * 判断一个值是否为 Ref 对象
 * @param val 要检查的值
 * @returns 如果是 Ref 对象则返回 true，否则返回 false
 */
const isRef = (val: any): val is { value: unknown } => {
  return !!(val && val[ReactiveFlags.IS_REF] === true)
}

/**
 * 将 {{ 插值表达式 }} 的值转换为显示字符串
 * @param val 要转换的值，可以是任何类型
 * @returns 转换后的字符串
 * @example
 * ```
 * toDisplayString('hello') // 'hello'
 * toDisplayString(123) // '123'
 * toDisplayString({ name: 'vue' }) // '{"name":"vue"}'
 * toDisplayString([1, 2, 3]) // '[1, 2, 3]'
 * ```
 */
export const toDisplayString = (val: unknown): string => {
  return isString(val)
    ? val
    : val == null
      ? ''
      : isArray(val) ||
          (isObject(val) &&
            (val.toString === objectToString || !isFunction(val.toString)))
        ? isRef(val)
          ? toDisplayString(val.value)
          : JSON.stringify(val, replacer, 2)
        : String(val)
}

/**
 * JSON.stringify 的替换函数，用于处理特殊类型的值
 * @param _key 键名（未使用）
 * @param val 要处理的值
 * @returns 处理后的值
 */
const replacer = (_key: string, val: unknown): any => {
  if (isRef(val)) {
    return replacer(_key, val.value)
  } else if (isMap(val)) {
    return {
      [`Map(${val.size})`]: [...val.entries()].reduce(
        (entries, [key, val], i) => {
          entries[stringifySymbol(key, i) + ' =>'] = val
          return entries
        },
        {} as Record<string, any>,
      ),
    }
  } else if (isSet(val)) {
    return {
      [`Set(${val.size})`]: [...val.values()].map(v => stringifySymbol(v)),
    }
  } else if (isSymbol(val)) {
    return stringifySymbol(val)
  } else if (isObject(val) && !isArray(val) && !isPlainObject(val)) {
    // native elements
    return String(val)
  }
  return val
}

/**
 * 将 Symbol 类型的值转换为字符串
 * @param v 要转换的值
 * @param i 索引或标识符（可选）
 * @returns 转换后的字符串
 */
const stringifySymbol = (v: unknown, i: number | string = ''): any =>
  // Symbol.description in es2019+ so we need to cast here to pass
  // the lib: es2016 check
  isSymbol(v) ? `Symbol(${(v as any).description ?? i})` : v
