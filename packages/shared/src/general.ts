/**
 * 共享工具函数和常量
 * 此文件包含了Vue框架内部使用的通用工具函数和常量定义
 */
import { makeMap } from './makeMap'

/**
 * 空对象常量
 * 在开发环境下会被冻结以防止修改
 */
export const EMPTY_OBJ: { readonly [key: string]: any } = __DEV__
  ? Object.freeze({})
  : {}
/**
 * 空数组常量
 * 在开发环境下会被冻结以防止修改
 */
export const EMPTY_ARR: readonly never[] = __DEV__ ? Object.freeze([]) : []

/**
 * 空函数
 * 用于作为默认值或占位符
 */
export const NOOP = (): void => {}

/**
 * 始终返回false的函数
 * 用于作为默认的否定性回调
 */
export const NO = () => false

/**
 * 检查字符串是否以'on'开头并且后面紧跟大写字母
 * 用于检测事件处理器属性
 * @param {string} key - 要检查的字符串
 * @returns {boolean} 是否为事件处理器属性
 */
export const isOn = (key: string): boolean =>
  key.charCodeAt(0) === 111 /* o */ &&
  key.charCodeAt(1) === 110 /* n */ &&
  // 大写字母
  (key.charCodeAt(2) > 122 || key.charCodeAt(2) < 97)

/**
 * 检查字符串是否为模型更新监听器
 * @param {string} key - 要检查的字符串
 * @returns {boolean} 是否为模型更新监听器
 */
export const isModelListener = (key: string): key is `onUpdate:${string}` =>
  key.startsWith('onUpdate:')

/**
 * 对象扩展函数
 * 等同于Object.assign
 */
export const extend: typeof Object.assign = Object.assign

/**
 * 从数组中移除指定元素
 * @template T - 数组元素类型
 * @param {T[]} arr - 要操作的数组
 * @param {T} el - 要移除的元素
 */
export const remove = <T>(arr: T[], el: T): void => {
  const i = arr.indexOf(el)
  if (i > -1) {
    arr.splice(i, 1)
  }
}

/**
 * 检查对象是否具有指定的自有属性
 * @param {object} val - 要检查的对象
 * @param {string | symbol} key - 要检查的属性键
 * @returns {boolean} 对象是否具有该自有属性
 */
const hasOwnProperty = Object.prototype.hasOwnProperty
export const hasOwn =
  (val: object, key: string | symbol): key is keyof typeof val =>
    hasOwnProperty.call(val, key)

/**
 * 检查值是否为数组
 * 等同于Array.isArray
 */
export const isArray: typeof Array.isArray = Array.isArray
/**
 * 检查值是否为Map对象
 * @param {unknown} val - 要检查的值
 * @returns {boolean} 是否为Map对象
 */
export const isMap = (val: unknown): val is Map<any, any> =>
  toTypeString(val) === '[object Map]'
/**
 * 检查值是否为Set对象
 * @param {unknown} val - 要检查的值
 * @returns {boolean} 是否为Set对象
 */
export const isSet = (val: unknown): val is Set<any> =>
  toTypeString(val) === '[object Set]'

/**
 * 检查值是否为Date对象
 * @param {unknown} val - 要检查的值
 * @returns {boolean} 是否为Date对象
 */
export const isDate = (val: unknown): val is Date =>
  toTypeString(val) === '[object Date]'
/**
 * 检查值是否为RegExp对象
 * @param {unknown} val - 要检查的值
 * @returns {boolean} 是否为RegExp对象
 */
export const isRegExp = (val: unknown): val is RegExp =>
  toTypeString(val) === '[object RegExp]'
/**
 * 检查值是否为函数
 * @param {unknown} val - 要检查的值
 * @returns {boolean} 是否为函数
 */
export const isFunction = (val: unknown): val is Function =>
  typeof val === 'function'
/**
 * 检查值是否为字符串
 * @param {unknown} val - 要检查的值
 * @returns {boolean} 是否为字符串
 */
export const isString = (val: unknown): val is string => typeof val === 'string'
/**
 * 检查值是否为符号
 * @param {unknown} val - 要检查的值
 * @returns {boolean} 是否为符号
 */
export const isSymbol = (val: unknown): val is symbol => typeof val === 'symbol'
/**
 * 检查值是否为对象
 * @param {unknown} val - 要检查的值
 * @returns {boolean} 是否为对象
 */
export const isObject = (val: unknown): val is Record<any, any> =>
  val !== null && typeof val === 'object'

/**
 * 检查值是否为Promise对象
 * @template T - Promise解析类型
 * @param {unknown} val - 要检查的值
 * @returns {boolean} 是否为Promise对象
 */
export const isPromise = <T = any>(val: unknown): val is Promise<T> => {
  return (
    (isObject(val) || isFunction(val)) &&
    isFunction((val as any).then) &&
    isFunction((val as any).catch)
  )
}

/**
 * 对象toString方法
 * 等同于Object.prototype.toString
 */
export const objectToString: typeof Object.prototype.toString =
  Object.prototype.toString
/**
 * 获取值的类型字符串
 * @param {unknown} value - 要检查的值
 * @returns {string} 类型字符串，如'[object Object]'
 */
export const toTypeString = (value: unknown): string =>
  objectToString.call(value)

/**
 * 获取值的原始类型
 * @param {unknown} value - 要检查的值
 * @returns {string} 原始类型名称，如'Object'
 */
export const toRawType = (value: unknown): string => {
  // 从"[object RawType]"格式的字符串中提取"RawType"
  return toTypeString(value).slice(8, -1)
}

/**
 * 检查值是否为纯对象
 * @param {unknown} val - 要检查的值
 * @returns {boolean} 是否为纯对象
 */
export const isPlainObject = (val: unknown): val is object =>
  toTypeString(val) === '[object Object]'

/**
 * 检查键是否为整数
 * @param {unknown} key - 要检查的键
 * @returns {boolean} 是否为整数键
 */
export const isIntegerKey = (key: unknown): boolean =>
  isString(key) &&
  key !== 'NaN' &&
  key[0] !== '-' &&
  '' + parseInt(key, 10) === key

/**
 * 检查属性是否为保留属性
 * @param {string} key - 要检查的属性名
 * @returns {boolean} 是否为保留属性
 */
export const isReservedProp: (key: string) => boolean = /*@__PURE__*/ makeMap(
  // 前导逗号是有意为之，以便也包含空字符串""
  ',key,ref,ref_for,ref_key,' +
    'onVnodeBeforeMount,onVnodeMounted,' +
    'onVnodeBeforeUpdate,onVnodeUpdated,' +
    'onVnodeBeforeUnmount,onVnodeUnmounted',
)

/**
 * 检查指令是否为内置指令
 * @param {string} key - 要检查的指令名
 * @returns {boolean} 是否为内置指令
 */
export const isBuiltInDirective: (key: string) => boolean =
  /*@__PURE__*/ makeMap(
    'bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo',
  )

/**
 * 缓存字符串函数的结果
 * @template T - 字符串函数类型
 * @param {T} fn - 要缓存的函数
 * @returns {T} 包装后的函数
 */
const cacheStringFunction = <T extends (str: string) => string>(fn: T): T => {
  const cache: Record<string, string> = Object.create(null)
  return ((str: string) => {
    const hit = cache[str]
    return hit || (cache[str] = fn(str))
  }) as T
}

/**
 * 连字符转驼峰式命名
 * @param {string} str - 要转换的字符串
 * @returns {string} 转换后的驼峰式字符串
 * @private
 */
const camelizeRE = /-(\w)/g
export const camelize: (str: string) => string = cacheStringFunction(
  (str: string): string => {
    return str.replace(camelizeRE, (_, c) => (c ? c.toUpperCase() : ''))
  },
)

/**
 * 驼峰式命名转连字符
 * @param {string} str - 要转换的字符串
 * @returns {string} 转换后的连字符字符串
 * @private
 */
const hyphenateRE = /\B([A-Z])/g
export const hyphenate: (str: string) => string = cacheStringFunction(
  (str: string) => str.replace(hyphenateRE, '-$1').toLowerCase(),
)

/**
 * 首字母大写
 * @template T - 字符串类型
 * @param {T} str - 要转换的字符串
 * @returns {Capitalize<T>} 首字母大写后的字符串
 * @private
 */
export const capitalize: <T extends string>(str: T) => Capitalize<T> =
  cacheStringFunction(<T extends string>(str: T) => {
    return (str.charAt(0).toUpperCase() + str.slice(1)) as Capitalize<T>
  })

/**
 * 转换为处理器键
 * @template T - 字符串类型
 * @param {T} str - 要转换的字符串
 * @returns {T extends '' ? '' : `on${Capitalize<T>}`} 转换后的处理器键
 * @private
 */
export const toHandlerKey: <T extends string>(
  str: T,
) => T extends '' ? '' : `on${Capitalize<T>}` = cacheStringFunction(
  <T extends string>(str: T) => {
    const s = str ? `on${capitalize(str)}` : ``
    return s as T extends '' ? '' : `on${Capitalize<T>}`
  },
)

/**
 * 比较两个值是否发生变化，处理NaN的情况
 * @param {any} value - 新值
 * @param {any} oldValue - 旧值
 * @returns {boolean} 值是否发生变化
 */
export const hasChanged = (value: any, oldValue: any): boolean =>
  !Object.is(value, oldValue)

/**
 * 调用数组中的所有函数
 * @param {Function[]} fns - 函数数组
 * @param {...any} arg - 传递给函数的参数
 */
export const invokeArrayFns = (fns: Function[], ...arg: any[]): void => {
  for (let i = 0; i < fns.length; i++) {
    fns[i](...arg)
  }
}

/**
 * 定义对象属性
 * @param {object} obj - 目标对象
 * @param {string | symbol} key - 属性键
 * @param {any} value - 属性值
 * @param {boolean} [writable=false] - 是否可写
 */
export const def = (
  obj: object,
  key: string | symbol,
  value: any,
  writable = false,
): void => {
  Object.defineProperty(obj, key, {
    configurable: true,
    enumerable: false,
    writable,
    value,
  })
}

/**
 * 宽松转换为数字
 * "123-foo" 会被解析为 123
 * 用于v-model的.number修饰符
 * @param {any} val - 要转换的值
 * @returns {any} 转换后的结果
 */
export const looseToNumber = (val: any): any => {
  const n = parseFloat(val)
  return isNaN(n) ? val : n
}

/**
 * 转换为数字
 * 只处理类数字字符串
 * "123-foo" 会原样返回
 * @param {any} val - 要转换的值
 * @returns {any} 转换后的结果
 */
export const toNumber = (val: any): any => {
  const n = isString(val) ? Number(val) : NaN
  return isNaN(n) ? val : n
}

/**
 * 获取全局对象
 * 适配不同环境(浏览器、Node.js等)
 * @returns {any} 全局对象
 */
// 用于在没有@types/node的情况下检查global类型
declare var global: {}

let _globalThis: any
export const getGlobalThis = (): any => {
  return (
    _globalThis ||
    (_globalThis =
      typeof globalThis !== 'undefined'
        ? globalThis
        : typeof self !== 'undefined'
          ? self
          : typeof window !== 'undefined'
            ? window
            : typeof global !== 'undefined'
              ? global
              : {})
  )
}

const identRE = /^[_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*$/

export function genPropsAccessExp(name: string): string {
  return identRE.test(name)
    ? `__props.${name}`
    : `__props[${JSON.stringify(name)}]`
}

export function genCacheKey(source: string, options: any): string {
  return (
    source +
    JSON.stringify(options, (_, val) =>
      typeof val === 'function' ? val.toString() : val,
    )
  )
}
