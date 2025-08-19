// Vue 3 兼容性模块 - 异步组件转换
// 此模块提供将 Vue 2 风格异步组件转换为 Vue 3 兼容格式的功能
import { isArray, isObject, isPromise } from '@vue/shared'
import { defineAsyncComponent } from '../apiAsyncComponent'
import type { Component } from '../component'
import { isVNode } from '../vnode'

/**
 * Vue 2 异步组件选项接口
 */
interface LegacyAsyncOptions {
  component: Promise<Component> // 异步加载的组件
  loading?: Component // 加载中显示的组件
  error?: Component // 加载失败显示的组件
  delay?: number // 显示加载组件前的延迟时间(毫秒)
  timeout?: number // 超时时间(毫秒)
}

/**
 * Vue 2 异步组件返回值类型
 * 可以是组件Promise或异步组件选项对象
 */
type LegacyAsyncReturnValue = Promise<Component> | LegacyAsyncOptions

/**
 * Vue 2 风格异步组件类型
 * @param resolve - 解析回调函数
 * @param reject - 拒绝回调函数
 * @returns 异步组件返回值
 */
type LegacyAsyncComponent = (
  resolve?: (res: LegacyAsyncReturnValue) => void,
  reject?: (reason?: any) => void,
) => LegacyAsyncReturnValue | undefined

// 缓存已转换的异步组件
const normalizedAsyncComponentMap = new WeakMap<
  LegacyAsyncComponent,
  Component
>()

/**
 * 转换 Vue 2 风格异步组件为 Vue 3 兼容格式
 * @param comp - Vue 2 风格异步组件
 * @returns 转换后的 Vue 3 组件
 */
export function convertLegacyAsyncComponent(
  comp: LegacyAsyncComponent,
): Component {
  // 检查缓存，避免重复转换
  if (normalizedAsyncComponentMap.has(comp)) {
    return normalizedAsyncComponentMap.get(comp)!
  }

  // 必须在这里调用函数，因为 Vue 2 的 API 在调用前不会暴露选项
  let resolve: (res: LegacyAsyncReturnValue) => void
  let reject: (reason?: any) => void
  // 创建一个默认的 Promise 作为回退
  const fallbackPromise = new Promise<Component>((r, rj) => {
    ;(resolve = r), (reject = rj)
  })

  // 调用 Vue 2 异步组件函数
  const res = comp(resolve!, reject!)

  let converted: Component
  // 处理返回 Promise 的情况
  if (isPromise(res)) {
    converted = defineAsyncComponent(() => res)
  } 
  // 处理返回选项对象的情况
  else if (isObject(res) && !isVNode(res) && !isArray(res)) {
    converted = defineAsyncComponent({
      loader: () => res.component,
      loadingComponent: res.loading,
      errorComponent: res.error,
      delay: res.delay,
      timeout: res.timeout,
    })
  } 
  // 处理返回 null/undefined 的情况
  else if (res == null) {
    converted = defineAsyncComponent(() => fallbackPromise)
  } 
  // 其他情况，可能是 Vue 3 函数式组件
  else {
    converted = comp as any // probably a v3 functional comp
  }
  // 缓存转换结果
  normalizedAsyncComponentMap.set(comp, converted)
  return converted
}
