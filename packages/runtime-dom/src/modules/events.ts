import { NOOP, hyphenate, isArray, isFunction } from '@vue/shared'
import {
  type ComponentInternalInstance,
  ErrorCodes,
  callWithAsyncErrorHandling,
  warn,
} from '@vue/runtime-core'

/**
 * 事件调用器接口，扩展自原生EventListener
 * @interface Invoker
 * @extends {EventListener}
 * @property {EventValue} value - 事件处理函数或函数数组
 * @property {number} attached - 事件附加的时间戳
 */
interface Invoker extends EventListener {
  value: EventValue
  attached: number
}

/**
 * 事件值类型，可以是单个函数或函数数组
 * @typedef {Function | Function[]} EventValue
 */
type EventValue = Function | Function[]

/**
 * 添加事件监听器
 * @param {Element} el - 要添加事件监听器的DOM元素
 * @param {string} event - 事件类型名称
 * @param {EventListener} handler - 事件处理函数
 * @param {EventListenerOptions} [options] - 事件监听器选项
 */
export function addEventListener(
  el: Element,
  event: string,
  handler: EventListener,
  options?: EventListenerOptions,
): void {
  el.addEventListener(event, handler, options)
}

/**
 * 移除事件监听器
 * @param {Element} el - 要移除事件监听器的DOM元素
 * @param {string} event - 事件类型名称
 * @param {EventListener} handler - 事件处理函数
 * @param {EventListenerOptions} [options] - 事件监听器选项
 */
export function removeEventListener(
  el: Element,
  event: string,
  handler: EventListener,
  options?: EventListenerOptions,
): void {
  el.removeEventListener(event, handler, options)
}

/**
 * Vue事件调用器的唯一标识符
 * 用于在DOM元素上存储事件调用器的映射
 */
const veiKey: unique symbol = Symbol('_vei')

/**
 * 更新元素的事件监听
 * @param {Element & { [veiKey]?: Record<string, Invoker | undefined> }} el - DOM元素
 * @param {string} rawName - 原始事件名称
 * @param {EventValue | null} prevValue - 之前的事件处理函数
 * @param {EventValue | unknown} nextValue - 新的事件处理函数
 * @param {ComponentInternalInstance | null} [instance=null] - 组件内部实例
 */
export function patchEvent(
  el: Element & { [veiKey]?: Record<string, Invoker | undefined> },
  rawName: string,
  prevValue: EventValue | null,
  nextValue: EventValue | unknown,
  instance: ComponentInternalInstance | null = null,
): void {
  // vei = Vue事件调用器
  const invokers = el[veiKey] || (el[veiKey] = {})
  const existingInvoker = invokers[rawName]
  if (nextValue && existingInvoker) {
    // patch
    existingInvoker.value = __DEV__
      ? sanitizeEventValue(nextValue, rawName)
      : (nextValue as EventValue)
  } else {
    const [name, options] = parseName(rawName)
    if (nextValue) {
      // add
      const invoker = (invokers[rawName] = createInvoker(
        __DEV__
          ? sanitizeEventValue(nextValue, rawName)
          : (nextValue as EventValue),
        instance,
      ))
      addEventListener(el, name, invoker, options)
    } else if (existingInvoker) {
      // remove
      removeEventListener(el, name, existingInvoker, options)
      invokers[rawName] = undefined
    }
  }
}

/**
 * 事件选项修饰符正则表达式
 * 用于匹配事件名称末尾的Once、Passive和Capture修饰符
 */
const optionsModifierRE = /(?:Once|Passive|Capture)$/

/**
 * 解析事件名称，提取事件类型和选项
 * @param {string} name - 原始事件名称
 * @returns {[string, EventListenerOptions | undefined]} - 解析后的事件名称和选项对象
 */
function parseName(name: string): [string, EventListenerOptions | undefined] {
  let options: EventListenerOptions | undefined
  if (optionsModifierRE.test(name)) {
    options = {}
    let m
    while ((m = name.match(optionsModifierRE))) {
      name = name.slice(0, name.length - m[0].length)
      ;(options as any)[m[0].toLowerCase()] = true
    }
  }
  const event = name[2] === ':' ? name.slice(3) : hyphenate(name.slice(2))
  return [event, options]
}

/**
 * 缓存的当前时间戳
 * 用于避免在同一事件循环中重复调用Date.now()的开销
 */
let cachedNow: number = 0

/**
 * 用于异步重置缓存时间戳的Promise
 */
const p = /*@__PURE__*/ Promise.resolve()

/**
 * 获取当前时间戳
 * 如果在同一事件循环中多次调用，返回缓存的时间戳
 * @returns {number} 当前时间戳
 */
const getNow = () =>
  cachedNow || (p.then(() => (cachedNow = 0)), (cachedNow = Date.now()))

/**
 * 创建事件调用器
 * @param {EventValue} initialValue - 初始的事件处理函数或函数数组
 * @param {ComponentInternalInstance | null} instance - 组件内部实例
 * @returns {Invoker} - 创建的事件调用器
 */
function createInvoker(
  initialValue: EventValue,
  instance: ComponentInternalInstance | null,
) {
  const invoker: Invoker = (e: Event & { _vts?: number }) => {
    // 异步边缘情况 vuejs/vue#6566
    // 内部点击事件触发补丁更新，事件处理程序
    // 在补丁更新期间附加到外部元素，并再次被触发。
    // 这是因为浏览器在事件传播之间触发微任务。
    // 在Vue 3的模板中不再发生这种情况，但对于手写的渲染函数仍可能理论上发生。
    // 解决方案：我们保存处理程序附加时的时间戳，
    // 并将时间戳附加到任何首次由Vue处理的事件（以避免不一致的事件时间戳实现
    // or events fired from iframes, e.g. #2513)
    // The handler would only fire if the event passed to it was fired
    // AFTER it was attached.
    if (!e._vts) {
      e._vts = Date.now()
    } else if (e._vts <= invoker.attached) {
      return
    }
    callWithAsyncErrorHandling(
      patchStopImmediatePropagation(e, invoker.value),
      instance,
      ErrorCodes.NATIVE_EVENT_HANDLER,
      [e],
    )
  }
  invoker.value = initialValue
  invoker.attached = getNow()
  return invoker
}

function sanitizeEventValue(value: unknown, propName: string): EventValue {
  if (isFunction(value) || isArray(value)) {
    return value as EventValue
  }
  warn(
    `Wrong type passed as event handler to ${propName} - did you forget @ or : ` +
      `in front of your prop?\nExpected function or array of functions, received type ${typeof value}.`,
  )
  return NOOP
}

function patchStopImmediatePropagation(
  e: Event,
  value: EventValue,
): EventValue {
  if (isArray(value)) {
    const originalStop = e.stopImmediatePropagation
    e.stopImmediatePropagation = () => {
      originalStop.call(e)
      ;(e as any)._stopped = true
    }
    return (value as Function[]).map(
      fn => (e: Event) => !(e as any)._stopped && fn && fn(e),
    )
  } else {
    return value
  }
}
