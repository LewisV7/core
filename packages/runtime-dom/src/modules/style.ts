import { capitalize, hyphenate, isArray, isString } from '@vue/shared'
import { camelize, warn } from '@vue/runtime-core'
import {
  type VShowElement,
  vShowHidden,
  vShowOriginalDisplay,
} from '../directives/vShow'
import { CSS_VAR_TEXT } from '../helpers/useCssVars'

/**
 * 更新DOM元素的样式
 * @param {Element} el - 要更新样式的DOM元素
 * @param {Style} prev - 之前的样式值
 * @param {Style} next - 新的样式值
 * @returns {void} 无返回值
 *
 * 样式可以是字符串形式的CSS文本，也可以是键值对对象形式的样式声明，或null表示移除样式
 */
type Style = string | Record<string, string | string[]> | null

/**
 * 匹配CSS中display属性的正则表达式
 */
const displayRE = /(^|;)\s*display\s*:/

export function patchStyle(el: Element, prev: Style, next: Style): void {
  const style = (el as HTMLElement).style
  const isCssString = isString(next)
  let hasControlledDisplay = false // 是否显式设置了display属性

  // 处理对象形式的样式
  if (next && !isCssString) {
    // 移除之前存在但新样式中不存在的属性
    if (prev) {
      if (!isString(prev)) {
        // 之前也是对象形式
        for (const key in prev) {
          if (next[key] == null) {
            setStyle(style, key, '')
          }
        }
      } else {
        // 之前是字符串形式
        for (const prevStyle of prev.split(';')) {
          const key = prevStyle.slice(0, prevStyle.indexOf(':')).trim()
          if (next[key] == null) {
            setStyle(style, key, '')
          }
        }
      }
    }

    // 设置新样式
    for (const key in next) {
      if (key === 'display') {
        hasControlledDisplay = true
      }
      setStyle(style, key, next[key])
    }
  } else {
    // 处理字符串形式的样式或null
    if (isCssString) {
      if (prev !== next) {
        // #9821: 保留CSS变量
        const cssVarText = (style as any)[CSS_VAR_TEXT]
        if (cssVarText) {
          ;(next as string) += ';' + cssVarText
        }
        style.cssText = next as string
        hasControlledDisplay = displayRE.test(next)
      }
    } else if (prev) {
      // 移除所有样式
      el.removeAttribute('style')
    }
  }
  // 处理v-show指令与样式display的优先级
  if (vShowOriginalDisplay in el) {
    // 当元素显示时，让v-show尊重当前通过v-bind设置的display样式
    el[vShowOriginalDisplay] = hasControlledDisplay ? style.display : ''
    // 如果v-show处于隐藏状态，v-show具有更高优先级
    if ((el as VShowElement)[vShowHidden]) {
      style.display = 'none'
    }
  }
}

/**
 * 匹配样式值末尾分号的正则表达式
 */
const semicolonRE = /[^\\];\s*$/

/**
 * 匹配样式值中!important标记的正则表达式
 */
const importantRE = /\s*!important$/

/**
 * 设置单个样式属性
 * @param {CSSStyleDeclaration} style - 元素的style对象
 * @param {string} name - 样式属性名
 * @param {string | string[]} val - 样式属性值，可以是字符串或字符串数组
 * @returns {void} 无返回值
 */
function setStyle(
  style: CSSStyleDeclaration,
  name: string,
  val: string | string[],
) {
  if (isArray(val)) {
    // 处理数组形式的值
    val.forEach(v => setStyle(style, name, v))
  } else {
    if (val == null) val = ''

    if (__DEV__) {
      // 开发环境下，警告值末尾多余的分号
      if (semicolonRE.test(val)) {
        warn(
          `'${name}' 样式值末尾存在意外的分号: '${val}'`,
        )
      }
    }

    if (name.startsWith('--')) {
      // 自定义CSS属性
      style.setProperty(name, val)
    } else {
      // 自动添加浏览器前缀
      const prefixed = autoPrefix(style, name)

      if (importantRE.test(val)) {
        // 处理!important标记
        style.setProperty(
          hyphenate(prefixed),
          val.replace(importantRE, ''),
          'important',
        )
      } else {
        // 设置常规样式
        style[prefixed as any] = val
      }
    }
  }
}

/**
 * 常见的浏览器前缀数组
 */
const prefixes = ['Webkit', 'Moz', 'ms']

/**
 * 缓存已添加前缀的CSS属性名，避免重复计算
 */
const prefixCache: Record<string, string> = {}

/**
 * 为CSS属性自动添加浏览器前缀
 * @param {CSSStyleDeclaration} style - 元素的style对象
 * @param {string} rawName - 原始CSS属性名（可以是连字符形式）
 * @returns {string} 添加前缀后的CSS属性名（驼峰式）
 *
 * 该函数会优先检查无前缀的属性是否可用，如果不可用，则尝试添加各种浏览器前缀
 */
function autoPrefix(style: CSSStyleDeclaration, rawName: string): string {
  // 检查缓存
  const cached = prefixCache[rawName]
  if (cached) {
    return cached
  }

  // 转换为驼峰式
  let name = camelize(rawName)

  // 检查无前缀的属性是否可用
  // 注意：特殊处理filter属性，因为某些浏览器可能不支持无前缀的filter
  if (name !== 'filter' && name in style) {
    return (prefixCache[rawName] = name)
  }

  // 尝试添加浏览器前缀
  name = capitalize(name)
  for (let i = 0; i < prefixes.length; i++) {
    const prefixed = prefixes[i] + name
    if (prefixed in style) {
      return (prefixCache[rawName] = prefixed)
    }
  }

  // 如果所有前缀都不可用，则返回原始名称
  return rawName
}
