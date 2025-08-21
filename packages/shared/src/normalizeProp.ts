/**
 * 属性规范化工具函数
 * 提供样式、类名和属性的规范化处理
 * @module shared/normalizeProp
 */
import { hyphenate, isArray, isObject, isString } from './general'

/**
 * 规范化后的样式对象类型
 * @typedef {Object} NormalizedStyle
 * @property {string|number} [key] - 样式属性值
 */
export type NormalizedStyle = Record<string, string | number>

/**
 * 规范化样式值
 * 支持字符串、对象和数组形式的样式
 * @param {unknown} value - 要规范化的样式值
 * @returns {NormalizedStyle|string|undefined} 规范化后的样式
 * @example
 * normalizeStyle('color: red; font-size: 14px') // { color: 'red', 'font-size': '14px' }
 * normalizeStyle([{ color: 'red' }, 'font-size: 14px']) // { color: 'red', 'font-size': '14px' }
 */
export function normalizeStyle(
  value: unknown,
): NormalizedStyle | string | undefined {
  if (isArray(value)) {
    const res: NormalizedStyle = {} // 创建结果对象
    for (let i = 0; i < value.length; i++) {
      const item = value[i]
      // 递归处理数组中的每个项
      const normalized = isString(item)
        ? parseStringStyle(item) // 如果是字符串则解析
        : (normalizeStyle(item) as NormalizedStyle) // 如果是对象则递归规范化
      if (normalized) {
        // 合并到结果对象
        for (const key in normalized) {
          res[key] = normalized[key]
        }
      }
    }
    return res
  } else if (isString(value) || isObject(value)) {
    // 字符串和对象直接返回
    return value
  }
  // 其他类型返回undefined
}

/**
 * 样式列表分隔符正则表达式
 * 匹配不在括号内的分号
 */
const listDelimiterRE = /;(?![^(]*\))/g

/**
 * 样式属性分隔符正则表达式
 * 匹配冒号及其后的内容
 */
const propertyDelimiterRE = /:([^]+)/

/**
 * 样式注释正则表达式
 * 匹配CSS注释
 */
const styleCommentRE = /\/\*[^]*?\*\//g

/**
 * 解析CSS字符串为样式对象
 * @param {string} cssText - CSS文本字符串
 * @returns {NormalizedStyle} 解析后的样式对象
 * @example
 * parseStringStyle('color: red; font-size: 14px') // { color: 'red', 'font-size': '14px' }
 */
export function parseStringStyle(cssText: string): NormalizedStyle {
  const ret: NormalizedStyle = {} 
  cssText
    .replace(styleCommentRE, '') // 移除CSS注释
    .split(listDelimiterRE) // 按分号分割样式列表
    .forEach(item => {
      if (item) {
        const tmp = item.split(propertyDelimiterRE) // 分割属性名和值
        tmp.length > 1 && (ret[tmp[0].trim()] = tmp[1].trim()) // 添加到结果对象
      }
    })
  return ret
}

/**
 * 将样式对象转换为CSS字符串
 * @param {NormalizedStyle|string|undefined} styles - 样式对象或字符串
 * @returns {string} CSS字符串
 * @example
 * stringifyStyle({ color: 'red', fontSize: '14px' }) // 'color:red;font-size:14px;'
 */
export function stringifyStyle(
  styles: NormalizedStyle | string | undefined,
): string {
  if (!styles) return '' // 空值返回空字符串
  if (isString(styles)) return styles // 字符串直接返回

  let ret = ''
  for (const key in styles) {
    const value = styles[key]
    if (isString(value) || typeof value === 'number') {
      // 处理CSS变量（以--开头的属性）
      const normalizedKey = key.startsWith(`--`) ? key : hyphenate(key)
      // 只渲染有效值
      ret += `${normalizedKey}:${value};`
    }
  }
  return ret
}

/**
 * 规范化类名
 * 支持字符串、数组和对象形式的类名
 * @param {unknown} value - 要规范化的类名
 * @returns {string} 规范化后的类名字符串
 * @example
 * normalizeClass('foo bar') // 'foo bar'
 * normalizeClass(['foo', 'bar']) // 'foo bar'
 * normalizeClass({ foo: true, bar: false }) // 'foo'
 */
export function normalizeClass(value: unknown): string {
  let res = ''
  if (isString(value)) {
    res = value // 字符串直接使用
  } else if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      // 递归处理数组中的每个项
      const normalized = normalizeClass(value[i])
      if (normalized) {
        res += normalized + ' '
      }
    }
  } else if (isObject(value)) {
    // 对象形式 { className: boolean }
    for (const name in value) {
      if (value[name]) {
        res += name + ' '
      }
    }
  }
  return res.trim() // 去除首尾空格
}

/**
 * 规范化组件属性
 * 主要处理class和style属性的规范化
 * @param {Record<string, any>|null} props - 组件属性对象
 * @returns {Record<string, any>|null} 规范化后的属性对象
 * @example
 * normalizeProps({ class: ['foo', 'bar'], style: { color: 'red' } })
 * // { class: 'foo bar', style: { color: 'red' } }
 */
export function normalizeProps(
  props: Record<string, any> | null,
): Record<string, any> | null {
  if (!props) return null // 空值返回null
  let { class: klass, style } = props
  // 规范化class属性
  if (klass && !isString(klass)) {
    props.class = normalizeClass(klass)
  }
  // 规范化style属性
  if (style) {
    props.style = normalizeStyle(style)
  }
  return props
}
