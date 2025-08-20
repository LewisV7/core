import { type ElementWithTransition, vtcKey } from '../components/Transition'

/**
 * 更新元素的class属性
 * @param {Element} el - 要更新的DOM元素
 * @param {string | null} value - 新的class值，如果为null则移除class属性
 * @param {boolean} isSVG - 是否为SVG元素
 */
// 编译器会将同一元素上的class和:class绑定规范化为一个绑定['staticClass', dynamic]
export function patchClass(
  el: Element,
  value: string | null,
  isSVG: boolean,
): void {
  // 理论上，直接设置className应该比setAttribute更快
  // 如果这是一个处于过渡中的元素，需要考虑临时过渡类
  const transitionClasses = (el as ElementWithTransition)[vtcKey]
  if (transitionClasses) {
    value = (
      value ? [value, ...transitionClasses] : [...transitionClasses]
    ).join(' ')
  }
  if (value == null) {
    el.removeAttribute('class')
  } else if (isSVG) {
    el.setAttribute('class', value)
  } else {
    el.className = value
  }
}
