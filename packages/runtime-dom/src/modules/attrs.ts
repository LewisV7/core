import {
  NOOP,
  includeBooleanAttr,
  isSpecialBooleanAttr,
  isSymbol,
  makeMap,
} from '@vue/shared'
import {
  type ComponentInternalInstance,
  DeprecationTypes,
  compatUtils,
} from '@vue/runtime-core'

/**
 * SVG xlink 命名空间 URL
 * 用于处理 SVG 元素的 xlink 属性
 */
export const xlinkNS = 'http://www.w3.org/1999/xlink'

/**
 * 补丁更新元素属性
 * 负责更新DOM元素的属性，处理SVG属性、布尔属性和普通属性
 *
 * @param el DOM元素
 * @param key 属性名称
 * @param value 新的属性值
 * @param isSVG 是否为SVG元素
 * @param instance 组件内部实例，可选
 * @param isBoolean 是否为布尔属性，默认为是否是特殊布尔属性
 */
export function patchAttr(
  el: Element,
  key: string,
  value: any,
  isSVG: boolean,
  instance?: ComponentInternalInstance | null,
  isBoolean: boolean = isSpecialBooleanAttr(key),
): void {
  if (isSVG && key.startsWith('xlink:')) {
    if (value == null) {
      el.removeAttributeNS(xlinkNS, key.slice(6, key.length))
    } else {
      el.setAttributeNS(xlinkNS, key, value)
    }
  } else {
    if (__COMPAT__ && compatCoerceAttr(el, key, value, instance)) {
      return
    }

    // note we are only checking boolean attributes that don't have a
    // corresponding dom prop of the same name here.
    if (value == null || (isBoolean && !includeBooleanAttr(value))) {
      el.removeAttribute(key)
    } else {
      // attribute value is a string https://html.spec.whatwg.org/multipage/dom.html#attributes
      el.setAttribute(
        key,
        isBoolean ? '' : isSymbol(value) ? String(value) : value,
      )
    }
  }
}

// 2.x 兼容性
/**
 * 是否为枚举属性
 * 仅在兼容模式下使用，用于判断属性是否为枚举类型
 * 包括: contenteditable, draggable, spellcheck
 */
const isEnumeratedAttr = __COMPAT__
  ? /*@__PURE__*/ makeMap('contenteditable,draggable,spellcheck')
  : NOOP

/**
 * 兼容模式下处理属性值
 * 用于Vue 2.x兼容性，处理枚举属性和布尔属性的特殊转换
 *
 * @param el DOM元素
 * @param key 属性名称
 * @param value 属性值
 * @param instance 组件内部实例，默认为null
 * @returns 如果属性值已被转换处理则返回true，否则返回false
 */
export function compatCoerceAttr(
  el: Element,
  key: string,
  value: unknown,
  instance: ComponentInternalInstance | null = null,
): boolean {
  if (isEnumeratedAttr(key)) {
    const v2CoercedValue =
      value === null
        ? 'false'
        : typeof value !== 'boolean' && value !== undefined
          ? 'true'
          : null
    if (
      v2CoercedValue &&
      compatUtils.softAssertCompatEnabled(
        DeprecationTypes.ATTR_ENUMERATED_COERCION,
        instance,
        key,
        value,
        v2CoercedValue,
      )
    ) {
      el.setAttribute(key, v2CoercedValue)
      return true
    }
  } else if (
    value === false &&
    !(el.tagName === 'INPUT' && key === 'value') &&
    !isSpecialBooleanAttr(key) &&
    compatUtils.isCompatEnabled(DeprecationTypes.ATTR_FALSE_VALUE, instance)
  ) {
    compatUtils.warnDeprecation(
      DeprecationTypes.ATTR_FALSE_VALUE,
      instance,
      key,
    )
    el.removeAttribute(key)
    return true
  }
  return false
}
