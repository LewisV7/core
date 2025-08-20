import { patchClass } from './modules/class' // 导入类名修补函数
import { patchStyle } from './modules/style' // 导入样式修补函数
import { patchAttr } from './modules/attrs' // 导入属性修补函数
import { patchDOMProp } from './modules/props' // 导入DOM属性修补函数
import { patchEvent } from './modules/events' // 导入事件修补函数
import {
  camelize, // 连字符转驼峰命名
  isFunction, // 判断是否为函数
  isModelListener, // 判断是否为v-model监听器
  isOn, // 判断是否为事件处理器
  isString, // 判断是否为字符串
} from '@vue/shared'
import type { RendererOptions } from '@vue/runtime-core' // 导入渲染器选项类型
import type { VueElement } from './apiCustomElement' // 导入Vue自定义元素类型

/**
 * 检查是否为原生DOM事件处理器属性
 * @param key 属性名
 * @returns 是否为原生事件处理器属性
 */
const isNativeOn = (key: string) =>
  key.charCodeAt(0) === 111 /* o */ &&
  key.charCodeAt(1) === 110 /* n */ &&
  // 第三个字符是小写字母
  key.charCodeAt(2) > 96 &&
  key.charCodeAt(2) < 123

// DOM渲染器选项类型
type DOMRendererOptions = RendererOptions<Node, Element>

/**
 * DOM属性修补函数 - 用于更新DOM元素的属性
 * @param el DOM元素
 * @param key 属性名
 * @param prevValue 旧属性值
 * @param nextValue 新属性值
 * @param namespace 命名空间
 * @param parentComponent 父组件
 */
export const patchProp: DOMRendererOptions['patchProp'] = (
  el,
  key,
  prevValue,
  nextValue,
  namespace,
  parentComponent,
) => {
  const isSVG = namespace === 'svg' // 是否为SVG元素
  if (key === 'class') {
    // 处理class属性
    patchClass(el, nextValue, isSVG)
  } else if (key === 'style') {
    // 处理style属性
    patchStyle(el, prevValue, nextValue)
  } else if (isOn(key)) {
    // 处理事件监听器
    // 忽略v-model监听器
    if (!isModelListener(key)) {
      patchEvent(el, key, prevValue, nextValue, parentComponent)
    }
  } else if (
    // 处理DOM属性
    key[0] === '.'
      ? ((key = key.slice(1)), true) // .开头强制作为属性
      : key[0] === '^'
        ? ((key = key.slice(1)), false) // ^开头强制作为特性
        : shouldSetAsProp(el, key, nextValue, isSVG) // 自动判断
  ) {
    patchDOMProp(el, key, nextValue, parentComponent)
    // #6007 同时设置表单状态为特性，使其与<input type="reset">或期望特性的库/扩展兼容
    // #11163 自定义元素可能将value用作属性并设置为对象
    if (
      !el.tagName.includes('-') &&
      (key === 'value' || key === 'checked' || key === 'selected')
    ) {
      patchAttr(el, key, nextValue, isSVG, parentComponent, key !== 'value')
    }
  } else if (
    // #11081 为可能的异步自定义元素强制设置属性
    (el as VueElement)._isVueCE &&
    (/[A-Z]/.test(key) || !isString(nextValue))
  ) {
    patchDOMProp(el, camelize(key), nextValue, parentComponent, key)
  } else {
    // 特殊情况：<input v-model type="checkbox">带有: true-value和: false-value
    // 将值存储为DOM属性，因为非字符串值会被字符串化
    if (key === 'true-value') {
      ;(el as any)._trueValue = nextValue
    } else if (key === 'false-value') {
      ;(el as any)._falseValue = nextValue
    }
    patchAttr(el, key, nextValue, isSVG, parentComponent)
  }
}

/**
 * 决定是否应将属性设置为DOM属性
 * @param el DOM元素
 * @param key 属性名
 * @param value 属性值
 * @param isSVG 是否为SVG元素
 * @returns 是否应设置为DOM属性
 */
function shouldSetAsProp(
  el: Element,
  key: string,
  value: unknown,
  isSVG: boolean,
) {
  if (isSVG) {
    // 大多数SVG元素的属性必须设置为HTML特性才能工作
    // ...除了innerHTML和textContent
    if (key === 'innerHTML' || key === 'textContent') {
      return true
    }
    // 或者带函数值的原生事件处理器
    if (key in el && isNativeOn(key) && isFunction(value)) {
      return true
    }
    return false
  }

  // 这些是枚举特性，但它们对应的DOM属性实际上是布尔值
  // 这导致使用字符串"false"值时会被强制转换为`true`，所以我们需要始终将它们视为特性
  // 注意：`contentEditable`没有这个问题，它的DOM属性也是枚举的字符串值
  if (
    key === 'spellcheck' ||  // 拼写检查
    key === 'draggable' ||   // 可拖拽
    key === 'translate' ||   // 翻译
    key === 'autocorrect'    // 自动纠正
  ) {
    return false
  }

  // #1787, #2840 表单元素上的form属性是只读的，必须设置为特性
  if (key === 'form') {
    return false
  }

  // #1526 <input list>必须设置为特性
  if (key === 'list' && el.tagName === 'INPUT') {
    return false
  }

  // #2766 <textarea type>必须设置为特性
  if (key === 'type' && el.tagName === 'TEXTAREA') {
    return false
  }

  // #8780 嵌入标签的宽度或高度必须设置为特性
  if (key === 'width' || key === 'height') {
    const tag = el.tagName
    if (
      tag === 'IMG' ||      // 图片
      tag === 'VIDEO' ||    // 视频
      tag === 'CANVAS' ||   // 画布
      tag === 'SOURCE'      // 源
    ) {
      return false
    }
  }

  // 带字符串值的原生事件处理器，必须设置为特性
  if (isNativeOn(key) && isString(value)) {
    return false
  }

  // 其他情况下，如果元素有该属性则设置为DOM属性
  return key in el
}
