// 导入Vue运行时核心模块中的ObjectDirective类型
import type { ObjectDirective } from '@vue/runtime-core'

/**
 * 存储元素原始display属性值的符号
 * @type {unique symbol}
 */
export const vShowOriginalDisplay: unique symbol = Symbol('_vod')
/**
 * 标记元素是否隐藏的符号
 * @type {unique symbol}
 */
export const vShowHidden: unique symbol = Symbol('_vsh')

/**
 * 扩展的HTMLElement接口，用于v-show指令
 * @interface VShowElement
 * @extends HTMLElement
 * @description 为HTMLElement添加v-show指令所需的特殊属性
 */
export interface VShowElement extends HTMLElement {
  // _vod = vue original display
  [vShowOriginalDisplay]: string
  [vShowHidden]: boolean
}

/**
 * v-show指令实现
 * @type {ObjectDirective<VShowElement> & { name?: 'show' }}
 * @description 控制元素显示与隐藏的指令，通过修改display属性实现
 */
export const vShow: ObjectDirective<VShowElement> & { name?: 'show' } = {
  /**
 * 指令挂载前的钩子
 * @param el 元素
 * @param value 绑定的值
 * @param transition 过渡对象
 * @description 初始化元素的原始display属性，并根据绑定值设置初始显示状态
 */
beforeMount(el, { value }, { transition }) {
    el[vShowOriginalDisplay] =
      el.style.display === 'none' ? '' : el.style.display
    if (transition && value) {
      transition.beforeEnter(el)
    } else {
      setDisplay(el, value)
    }
  },
  /**
 * 指令挂载后的钩子
 * @param el 元素
 * @param value 绑定的值
 * @param transition 过渡对象
 * @description 处理元素挂载后的过渡效果
 */
mounted(el, { value }, { transition }) {
    if (transition && value) {
      transition.enter(el)
    }
  },
  /**
 * 指令更新时的钩子
 * @param el 元素
 * @param value 新值
 * @param oldValue 旧值
 * @param transition 过渡对象
 * @description 处理值变化时的显示/隐藏逻辑和过渡效果
 */
updated(el, { value, oldValue }, { transition }) {
    if (!value === !oldValue) return
    if (transition) {
      if (value) {
        transition.beforeEnter(el)
        setDisplay(el, true)
        transition.enter(el)
      } else {
        transition.leave(el, () => {
          setDisplay(el, false)
        })
      }
    } else {
      setDisplay(el, value)
    }
  },
  /**
 * 指令卸载前的钩子
 * @param el 元素
 * @param value 绑定的值
 * @description 在元素卸载前设置最终显示状态
 */
beforeUnmount(el, { value }) {
    setDisplay(el, value)
  },
}

if (__DEV__) {
  vShow.name = 'show'
}

/**
 * 设置元素的显示状态
 * @param el 元素
 * @param value 是否显示
 * @description 根据值设置元素的display属性，并更新隐藏标记
 */
function setDisplay(el: VShowElement, value: unknown): void {
  el.style.display = value ? el[vShowOriginalDisplay] : 'none'
  el[vShowHidden] = !value
}

/**
 * 为SSR初始化v-show指令
 * @description 在SSR环境中初始化v-show指令，设置getSSRProps方法以处理服务端渲染时的显示逻辑
 */
export function initVShowForSSR(): void {
  vShow.getSSRProps = ({ value }) => {
    if (!value) {
      return { style: { display: 'none' } }
    }
  }
}
