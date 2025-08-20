import { DeprecationTypes, compatUtils, warn } from '@vue/runtime-core'
import { includeBooleanAttr } from '@vue/shared'
import { unsafeToTrustedHTML } from '../nodeOps'

/**
 * 更新DOM元素的属性
 * @param {any} el - 要更新的DOM元素
 * @param {string} key - 属性名称
 * @param {any} value - 新的属性值
 * @param {any} parentComponent - 父组件实例
 * @param {string} [attrName] - 对应的HTML属性名称（可选）
 * @returns {void} 无返回值
 *
 * 注意：此函数包含潜在不安全的操作（如设置innerHTML），用户需确保传入的内容是可信的。
 */
export function patchDOMProp(
  el: any,
  key: string,
  value: any,
  parentComponent: any,
  attrName?: string,
): void {
  // __UNSAFE__
  // 原因：可能会设置innerHTML
  // 这可能来自于在render中显式使用v-html或innerHTML作为prop
  if (key === 'innerHTML' || key === 'textContent') {
    // null值的情况在渲染器的patchElement中处理，在修补子节点之前
    if (value != null) {
      el[key] = key === 'innerHTML' ? unsafeToTrustedHTML(value) : value
    }
    return
  }

  const tag = el.tagName

  if (
    key === 'value' &&
    tag !== 'PROGRESS' &&
    // 自定义元素可能在内部使用_value
    !tag.includes('-')
  ) {
    // #4956: <option>的值会回退到其文本内容，因此我们需要与其属性值进行比较
    const oldValue =
      tag === 'OPTION' ? el.getAttribute('value') || '' : el.value
    const newValue =
      value == null
        ? // #11647: 对于null和undefined，value应设置为空字符串
          // 但对于<input type="checkbox">，应设置为'on'
          el.type === 'checkbox'
          ? 'on'
          : ''
        : String(value)
    if (oldValue !== newValue || !('_value' in el)) {
      el.value = newValue
    }
    if (value == null) {
      el.removeAttribute(key)
    }
    // 同时将值存储为_value，因为非字符串值会被字符串化
    el._value = value
    return
  }

  let needRemove = false
  if (value === '' || value == null) {
    const type = typeof el[key]
    if (type === 'boolean') {
      // 例如：<select multiple> 编译为 { multiple: '' }
      value = includeBooleanAttr(value)
    } else if (value == null && type === 'string') {
      // 例如：<div :id="null">
      value = ''
      needRemove = true
    } else if (type === 'number') {
      // 例如：<img :width="null">
      value = 0
      needRemove = true
    }
  } else {
    if (
      __COMPAT__ &&
      value === false &&
      compatUtils.isCompatEnabled(
        DeprecationTypes.ATTR_FALSE_VALUE,
        parentComponent,
      )
    ) {
      const type = typeof el[key]
      if (type === 'string' || type === 'number') {
        __DEV__ &&
          compatUtils.warnDeprecation(
            DeprecationTypes.ATTR_FALSE_VALUE,
            parentComponent,
            key,
          )
        value = type === 'number' ? 0 : ''
        needRemove = true
      }
    }
  }

  // 某些属性会执行值验证并抛出异常
  // 某些属性有getter但没有setter，在'use strict'模式下会报错
  // 例如：<select :type="null"></select> <select :willValidate="null"></select>
  try {
    el[key] = value
  } catch (e: any) {
    // 如果值是从null或undefined自动转换而来，则不发出警告
    if (__DEV__ && !needRemove) {
      // 发出警告：无法在指定元素上设置属性
      warn(
        `Failed setting prop "${key}" on <${tag.toLowerCase()}>: ` +
          `value ${value} is invalid.`,
        e,
      )
    }
  }
  needRemove && el.removeAttribute(attrName || key)
}
