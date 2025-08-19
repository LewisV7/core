/* eslint-disable no-restricted-globals */
/**
 * Vue 3 核心模块 - 调试工具集成
 * 提供与 Vue Devtools 扩展交互的功能，用于在开发过程中调试和分析 Vue 应用
 */
import type { App } from './apiCreateApp'
import { Comment, Fragment, Static, Text } from './vnode'
import type { ComponentInternalInstance } from './component'

/**
 * 应用记录接口
 * 存储 Vue 应用的基本信息和类型映射
 */
interface AppRecord {
  id: number // 应用唯一标识
  app: App // 应用实例
  version: string // Vue 版本号
  types: Record<string, string | Symbol> // 类型映射表
}

/**
 * 调试工具钩子事件枚举
 * 定义了所有可用的调试工具事件类型
 */
enum DevtoolsHooks {
  APP_INIT = 'app:init', // 应用初始化事件
  APP_UNMOUNT = 'app:unmount', // 应用卸载事件
  COMPONENT_UPDATED = 'component:updated', // 组件更新事件
  COMPONENT_ADDED = 'component:added', // 组件添加事件
  COMPONENT_REMOVED = 'component:removed', // 组件移除事件
  COMPONENT_EMIT = 'component:emit', // 组件触发事件
  PERFORMANCE_START = 'perf:start', // 性能计时开始
  PERFORMANCE_END = 'perf:end', // 性能计时结束
}

/**
 * 调试工具钩子接口
 * 定义了与 Devtools 通信的方法和属性
 */
export interface DevtoolsHook {
  enabled?: boolean // 是否启用调试工具
  emit: (event: string, ...payload: any[]) => void // 发送事件
  on: (event: string, handler: Function) => void // 监听事件
  once: (event: string, handler: Function) => void // 监听一次事件
  off: (event: string, handler: Function) => void // 移除事件监听
  appRecords: AppRecord[] // 应用记录数组
  /**
   * 清理缓冲区
   * @param matchArg 匹配参数
   * @returns 参数是否在缓冲区中
   */
  cleanupBuffer?: (matchArg: unknown) => boolean
}

/**
 * 调试工具实例
 * 用于与 Devtools 扩展进行通信
 */
export let devtools: DevtoolsHook

/**
 * 事件缓冲区
 * 存储在 Devtools 未加载时发送的事件
 */
let buffer: { event: string; args: any[] }[] = []

/**
 * 调试工具未安装标记
 * 标识是否已确认用户未安装 Devtools
 */
let devtoolsNotInstalled = false

/**
 * 发送调试事件
 * @param event 事件类型
 * @param args 事件参数
 */
function emit(event: string, ...args: any[]) {
  // 如果调试工具已加载，则直接发送事件
  if (devtools) {
    devtools.emit(event, ...args)
  } else if (!devtoolsNotInstalled) {
    // 否则将事件添加到缓冲区
    buffer.push({ event, args })
  }
}

/**
 * 设置调试工具钩子
 * @param hook 调试工具钩子实例
 * @param target 目标对象（通常是 window）
 */
export function setDevtoolsHook(hook: DevtoolsHook, target: any): void {
  devtools = hook
  if (devtools) {
    // 启用调试工具
    devtools.enabled = true
    // 重放缓冲区中的事件
    buffer.forEach(({ event, args }) => devtools.emit(event, ...args))
    // 清空缓冲区
    buffer = []
  } else if (
    // 处理延迟注入的调试工具
    // 仅在真实浏览器环境中执行，避免在测试环境中卡住
    typeof window !== 'undefined' &&
    window.HTMLElement &&
    // eslint-disable-next-line no-restricted-syntax
    !window.navigator?.userAgent?.includes('jsdom')
  ) {
    // 创建或获取重放数组
    const replay = (target.__VUE_DEVTOOLS_HOOK_REPLAY__ =
      target.__VUE_DEVTOOLS_HOOK_REPLAY__ || [])
    // 添加重放回调
    replay.push((newHook: DevtoolsHook) => {
      setDevtoolsHook(newHook, target)
    })
    // 3秒后如果仍未加载调试工具，则清空缓冲区
    // 避免内存泄漏 (#4738)
    setTimeout(() => {
      if (!devtools) {
        target.__VUE_DEVTOOLS_HOOK_REPLAY__ = null
        devtoolsNotInstalled = true
        buffer = []
      }
    }, 3000)
  } else {
    // 非浏览器环境，假设未安装调试工具
    devtoolsNotInstalled = true
    buffer = []
  }
}

/**
 * 初始化应用调试信息
 * @param app 应用实例
 * @param version Vue 版本号
 */
export function devtoolsInitApp(app: App, version: string): void {
  emit(DevtoolsHooks.APP_INIT, app, version, {
    Fragment,
    Text,
    Comment,
    Static,
  })
}

/**
 * 应用卸载调试通知
 * @param app 应用实例
 */
export function devtoolsUnmountApp(app: App): void {
  emit(DevtoolsHooks.APP_UNMOUNT, app)
}

/**
 * 组件添加调试钩子
 * 当组件被添加到DOM时触发
 */
export const devtoolsComponentAdded: DevtoolsComponentHook =
  /*@__PURE__*/ createDevtoolsComponentHook(DevtoolsHooks.COMPONENT_ADDED)

export const devtoolsComponentUpdated: DevtoolsComponentHook =
  /*@__PURE__*/ createDevtoolsComponentHook(DevtoolsHooks.COMPONENT_UPDATED)

/**
 * 内部组件移除钩子
 */
const _devtoolsComponentRemoved = /*@__PURE__*/ createDevtoolsComponentHook(
  DevtoolsHooks.COMPONENT_REMOVED,
)

/**
 * 组件移除调试钩子
 * 当组件从DOM中移除时触发
 * @param component 组件内部实例
 */
export const devtoolsComponentRemoved = (
  component: ComponentInternalInstance,
): void => {
  if (
    devtools &&
    typeof devtools.cleanupBuffer === 'function' &&
    // 如果组件不在缓冲区中，则移除它
    !devtools.cleanupBuffer(component)
  ) {
    _devtoolsComponentRemoved(component)
  }
}

/**
 * 组件调试钩子类型
 */
type DevtoolsComponentHook = (component: ComponentInternalInstance) => void

/*! #__NO_SIDE_EFFECTS__ */
/**
 * 创建组件调试钩子
 * @param hook 钩子类型
 * @returns 组件调试钩子函数
 */
function createDevtoolsComponentHook(
  hook: DevtoolsHooks,
): DevtoolsComponentHook {
  return (component: ComponentInternalInstance) => {
    emit(
      hook,
      component.appContext.app,
      component.uid,
      component.parent ? component.parent.uid : undefined,
      component,
    )
  }
}

/**
 * 性能计时开始钩子
 * 用于标记性能测量的开始点
 */
export const devtoolsPerfStart: DevtoolsPerformanceHook =
  /*@__PURE__*/ createDevtoolsPerformanceHook(DevtoolsHooks.PERFORMANCE_START)

/**
 * 性能计时结束钩子
 * 用于标记性能测量的结束点并记录耗时
 */
export const devtoolsPerfEnd: DevtoolsPerformanceHook =
  /*@__PURE__*/ createDevtoolsPerformanceHook(DevtoolsHooks.PERFORMANCE_END)

/**
 * 性能调试钩子类型
 */
type DevtoolsPerformanceHook = (
  component: ComponentInternalInstance,
  type: string,
  time: number,
) => void

/**
 * 创建性能调试钩子
 * @param hook 钩子类型
 * @returns 性能调试钩子函数
 */
function createDevtoolsPerformanceHook(
  hook: DevtoolsHooks,
): DevtoolsPerformanceHook {
  return (component: ComponentInternalInstance, type: string, time: number) => {
    emit(hook, component.appContext.app, component.uid, component, type, time)
  }
}

/**
 * 组件事件触发调试通知
 * 当组件触发事件时通知调试工具
 * @param component 组件内部实例
 * @param event 事件名称
 * @param params 事件参数
 */
export function devtoolsComponentEmit(
  component: ComponentInternalInstance,
  event: string,
  params: any[],
): void {
  emit(
    DevtoolsHooks.COMPONENT_EMIT,
    component.appContext.app,
    component,
    event,
    params,
  )
}
