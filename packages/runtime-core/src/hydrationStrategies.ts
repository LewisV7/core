import { getGlobalThis, isString } from '@vue/shared'
import { DOMNodeTypes, isComment } from './hydration'

/**
 * Vue 3 核心模块 - 水合策略
 * 提供异步组件的懒加载水合策略实现，支持多种触发水合的条件
 */

// Safari 浏览器支持的 Polyfills
// 参考 https://caniuse.com/requestidlecallback
const requestIdleCallback: Window['requestIdleCallback'] =
  getGlobalThis().requestIdleCallback || (cb => setTimeout(cb, 1))
const cancelIdleCallback: Window['cancelIdleCallback'] =
  getGlobalThis().cancelIdleCallback || (id => clearTimeout(id))

/**
 * 异步组件的懒加载水合策略
 * @param hydrate - 执行实际水合操作的函数
 * @param forEachElement - 遍历组件未水合 DOM 的根元素的函数，考虑可能的片段
 * @returns 一个清理函数，如果异步组件在水合前被卸载则调用此函数
 *          可用于移除 DOM 事件监听器等操作
 */
export type HydrationStrategy = (
  hydrate: () => void,
  forEachElement: (cb: (el: Element) => any) => void,
) => (() => void) | void

/**
 * 水合策略工厂函数类型
 * @template Options - 策略选项的类型
 * @param options - 可选的策略配置选项
 * @returns 水合策略函数
 */
export type HydrationStrategyFactory<Options> = (
  options?: Options,
) => HydrationStrategy

/**
 * 在浏览器空闲时执行水合
 * @param timeout - 超时时间（毫秒），默认 10000ms
 * @returns 水合策略函数
 */
export const hydrateOnIdle: HydrationStrategyFactory<number> =
  (timeout = 10000) =>
  hydrate => {
    // 请求浏览器在空闲时执行水合
    const id = requestIdleCallback(hydrate, { timeout })
    // 返回清理函数，用于取消空闲回调
    return () => cancelIdleCallback(id)
  }

/**
 * 检查元素是否在视口中可见
 * @param el - 要检查的元素
 * @returns 如果元素在视口中可见则返回 true，否则返回 false
 */
function elementIsVisibleInViewport(el: Element) {
  // 获取元素的边界矩形
  const { top, left, bottom, right } = el.getBoundingClientRect()
  // 获取窗口的内部高度和宽度
  // eslint-disable-next-line no-restricted-globals
  const { innerHeight, innerWidth } = window
  // 检查元素是否与视口有交集
  return (
    ((top > 0 && top < innerHeight) || (bottom > 0 && bottom < innerHeight)) &&
    ((left > 0 && left < innerWidth) || (right > 0 && right < innerWidth))
  )
}

/**
 * 当元素在视口中可见时执行水合
 * @param opts - IntersectionObserver 配置选项
 * @returns 水合策略函数
 */
export const hydrateOnVisible: HydrationStrategyFactory<
  IntersectionObserverInit
> = opts => (hydrate, forEach) => {
  // 创建交叉观察器，用于检测元素是否进入视口
  const ob = new IntersectionObserver(entries => {
    for (const e of entries) {
      // 如果元素没有交叉（不在视口内），则跳过
      if (!e.isIntersecting) continue
      // 断开观察器
      ob.disconnect()
      // 执行水合
      hydrate()
      break
    }
  }, opts)
  // 遍历所有根元素
  forEach(el => {
    if (!(el instanceof Element)) return
    // 检查元素是否已经在视口中可见
    if (elementIsVisibleInViewport(el)) {
      // 立即执行水合
      hydrate()
      // 断开观察器
      ob.disconnect()
      return false
    }
    // 开始观察元素
    ob.observe(el)
  })
  // 返回清理函数，用于断开观察器
  return () => ob.disconnect()
}

/**
 * 当媒体查询匹配时执行水合
 * @param query - 媒体查询字符串
 * @returns 水合策略函数
 */
export const hydrateOnMediaQuery: HydrationStrategyFactory<string> =
  query => hydrate => {
    if (query) {
      // 创建媒体查询列表
      const mql = matchMedia(query)
      // 如果媒体查询已经匹配
      if (mql.matches) {
        // 立即执行水合
        hydrate()
      } else {
        // 监听媒体查询变化
        mql.addEventListener('change', hydrate, { once: true })
        // 返回清理函数，用于移除事件监听器
        return () => mql.removeEventListener('change', hydrate)
      }
    }
  }

/**
 * 当用户与元素交互时执行水合
 * @param interactions - 触发水合的事件类型，可以是单个事件名或事件名数组
 * @returns 水合策略函数
 */
export const hydrateOnInteraction: HydrationStrategyFactory<
  keyof HTMLElementEventMap | Array<keyof HTMLElementEventMap>
> = 
  (interactions = []) =>
  (hydrate, forEach) => {
    // 确保interactions是数组形式
    if (isString(interactions)) interactions = [interactions]
    // 标记是否已经执行过水合
    let hasHydrated = false
    // 水合执行函数
    const doHydrate = (e: Event) => {
      if (!hasHydrated) {
        // 标记为已水合
        hasHydrated = true
        // 执行清理
        teardown()
        // 执行水合
        hydrate()
        // 重放事件
        e.target!.dispatchEvent(new (e.constructor as any)(e.type, e))
      }
    }
    // 清理函数，移除所有事件监听器
    const teardown = () => {
      forEach(el => {
        for (const i of interactions) {
          el.removeEventListener(i, doHydrate)
        }
      })
    }
    // 为每个元素添加事件监听器
    forEach(el => {
      for (const i of interactions) {
        el.addEventListener(i, doHydrate, { once: true })
      }
    })
    // 返回清理函数
    return teardown
  }

/**
 * 遍历 DOM 节点及其子节点中的元素
 * @param node - 要遍历的起始节点
 * @param cb - 对每个元素执行的回调函数，如果返回 false 则中断遍历
 */
export function forEachElement(
  node: Node,
  cb: (el: Element) => void | false,
): void {
  // 处理片段节点
  if (isComment(node) && node.data === '[') {
    let depth = 1
    let next = node.nextSibling
    while (next) {
      // 如果是元素节点
      if (next.nodeType === DOMNodeTypes.ELEMENT) {
        // 调用回调函数
        const result = cb(next as Element)
        // 如果回调返回 false，则中断遍历
        if (result === false) {
          break
        }
      } else if (isComment(next)) {
        // 处理嵌套片段
        if (next.data === ']') {
          if (--depth === 0) break
        } else if (next.data === '[') {
          depth++
        }
      }
      // 移动到下一个兄弟节点
      next = next.nextSibling
    }
  } else {
    // 普通元素节点，直接调用回调
    cb(node as Element)
  }
}
