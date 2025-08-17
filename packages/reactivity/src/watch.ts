/**
 * Vue 响应式系统中的 Watch 实现
 * 提供了响应式数据监听功能，包括 watch 和 watchEffect API
 */

import {
  // 空对象常量
  EMPTY_OBJ,
  // 空操作函数
  NOOP,
  // 判断值是否变化的工具函数
  hasChanged,
  // 判断是否为数组的工具函数
  isArray,
  // 判断是否为函数的工具函数
  isFunction,
  // 判断是否为Map的工具函数
  isMap,
  // 判断是否为对象的工具函数
  isObject,
  // 判断是否为纯对象的工具函数
  isPlainObject,
  // 判断是否为Set的工具函数
  isSet,
  // 从数组中移除元素的工具函数
  remove,
} from '@vue/shared'
// 导入警告工具函数
import { warn } from './warning'
// 导入计算属性类型
import type { ComputedRef } from './computed'
// 导入响应式标志常量
import { ReactiveFlags } from './constants'
// 导入副作用相关类型和工具
import {
  type DebuggerOptions,
  EffectFlags,
  type EffectScheduler,
  ReactiveEffect,
  pauseTracking,
  resetTracking,
} from './effect'
// 导入响应式对象判断工具
import { isReactive, isShallow } from './reactive'
// 导入Ref类型和判断工具
import { type Ref, isRef } from './ref'
// 导入当前作用域获取工具
import { getCurrentScope } from './effectScope'

/**
 * 这些错误码从 `packages/runtime-core/src/errorHandling.ts` 转移而来
 * 移至 @vue/reactivity 以便与基础 watch 逻辑共存，因此必须保持这些值不变
 */
export enum WatchErrorCodes {
  // watch getter 函数执行错误
  WATCH_GETTER = 2,
  // watch 回调函数执行错误
  WATCH_CALLBACK,
  // watch 清理函数执行错误
  WATCH_CLEANUP,
}

/**
 * 监视副作用函数类型
 * @param onCleanup - 注册清理函数的回调
 */
export type WatchEffect = (onCleanup: OnCleanup) => void

/**
 * 监视源类型
 * @template T - 源值类型
 */
export type WatchSource<T = any> = Ref<T, any> | ComputedRef<T> | (() => T)

/**
 * 监视回调函数类型
 * @template V - 新值类型
 * @template OV - 旧值类型
 * @param value - 新值
 * @param oldValue - 旧值
 * @param onCleanup - 注册清理函数的回调
 */
export type WatchCallback<V = any, OV = any> = (
  value: V,
  oldValue: OV,
  onCleanup: OnCleanup,
) => any

/**
 * 清理函数注册类型
 * @param cleanupFn - 要注册的清理函数
 */
export type OnCleanup = (cleanupFn: () => void) => void

/**
 * 监视选项接口
 * @template Immediate - 是否立即执行的类型
 */
export interface WatchOptions<Immediate = boolean> extends DebuggerOptions {
  // 是否立即执行回调
  immediate?: Immediate
  // 是否深度监视，可以是布尔值或指定深度的数字
  deep?: boolean | number
  // 是否只执行一次
  once?: boolean
  // 调度器函数
  scheduler?: WatchScheduler
  // 自定义警告处理函数
  onWarn?: (msg: string, ...args: any[]) => void
  /**
   * @internal
   * 增强作业函数
   */
  augmentJob?: (job: (...args: any[]) => void) => void
  /**
   * @internal
   * 调用函数
   */
  call?: (
    fn: Function | Function[],
    type: WatchErrorCodes,
    args?: unknown[],
  ) => void
}

/**
 * 停止监视的函数类型
 */
export type WatchStopHandle = () => void

/**
 * 监视句柄接口
 * 继承自停止监视函数，并提供暂停和恢复功能
 */
export interface WatchHandle extends WatchStopHandle {
  // 暂停监视
  pause: () => void
  // 恢复监视
  resume: () => void
  // 停止监视
  stop: () => void
}

// 监视者的初始值，用于在未定义初始值时触发
const INITIAL_WATCHER_VALUE = {}

/**
 * 监视调度器类型
 * @param job - 要调度的作业函数
 * @param isFirstRun - 是否是首次运行
 */
export type WatchScheduler = (job: () => void, isFirstRun: boolean) => void

/**
 * 存储副作用函数与其清理函数的映射
 * 键为ReactiveEffect实例，值为该副作用的清理函数数组
 */
const cleanupMap: WeakMap<ReactiveEffect, (() => void)[]> = new WeakMap()

/**
 * 当前活跃的副作用监视者
 */
let activeWatcher: ReactiveEffect | undefined = undefined

/**
 * 获取当前活跃的副作用监视者
 * @returns 当前活跃的ReactiveEffect实例，如果没有则返回undefined
 */
export function getCurrentWatcher(): ReactiveEffect<any> | undefined {
  return activeWatcher
}

/**
 * 在当前活跃的副作用上注册清理回调
 * 注册的清理回调将在关联的副作用重新运行前被调用
 * 
 * @param cleanupFn - 要附加到副作用清理的回调函数
 * @param failSilently - 如果为`true`，当没有活跃副作用时调用不会抛出警告
 * @param owner - 清理函数应附加到的副作用
 * 默认情况下，是当前活跃的副作用
 */
export function onWatcherCleanup(
  cleanupFn: () => void,
  failSilently = false,
  owner: ReactiveEffect | undefined = activeWatcher,
): void {
  if (owner) {
    let cleanups = cleanupMap.get(owner)
    if (!cleanups) cleanupMap.set(owner, (cleanups = []))
    cleanups.push(cleanupFn)
  } else if (__DEV__ && !failSilently) {
    warn(
      `onWatcherCleanup() was called when there was no active watcher` +
        ` to associate with.`,
    )
  }
}

/**
 * 创建一个响应式监视
 * 可以监视单个源、多个源、函数或响应式对象
 * 
 * @param source - 要监视的源，可以是Ref、ComputedRef、函数、响应式对象或这些类型的数组
 * @param cb - 当源变化时调用的回调函数，如果为null或未提供，则作为watchEffect使用
 * @param options - 监视选项
 * @returns 监视句柄，包含停止、暂停和恢复监视的方法
 */
export function watch(
  source: WatchSource | WatchSource[] | WatchEffect | object,
  cb?: WatchCallback | null,
  options: WatchOptions = EMPTY_OBJ,
): WatchHandle {
  // 解构选项参数
  const { immediate, deep, once, scheduler, augmentJob, call } = options

  // 警告无效源的函数
  const warnInvalidSource = (s: unknown) => {
    ;(options.onWarn || warn)(
      `无效的watch源: `,
      s,
      `watch源只能是getter/effect函数、ref、响应式对象或这些类型的数组。`,
    )
  }

  /**
   * 响应式对象的getter函数
   * 根据deep选项决定如何遍历对象
   * 
   * @param source - 要获取的响应式对象
   * @returns 处理后的对象
   */
  const reactiveGetter = (source: object) => {
    // 如果deep为true，遍历将在下面的包装getter中发生
    if (deep) return source
    // 对于`deep: false | 0`或浅层响应式对象，只遍历根级属性
    if (isShallow(source) || deep === false || deep === 0)
      return traverse(source, 1)
    // 对于`deep: undefined`的响应式对象，深度遍历所有属性
    return traverse(source)
  }

  // 副作用实例
  let effect: ReactiveEffect
  // getter函数，用于获取监视源的值
  let getter: () => any
  // 清理函数
  let cleanup: (() => void) | undefined
  // 绑定到当前effect的清理函数
  let boundCleanup: typeof onWatcherCleanup
  // 是否强制触发更新
  let forceTrigger = false
  // 是否为多源监视
  let isMultiSource = false

  // 处理Ref类型的源
  if (isRef(source)) {
    // getter函数返回ref的值
    getter = () => source.value
    // 如果是浅层ref，则强制触发更新
    forceTrigger = isShallow(source)
  } 
  // 处理响应式对象类型的源
  else if (isReactive(source)) {
    // 使用reactiveGetter处理响应式对象
    getter = () => reactiveGetter(source)
    // 响应式对象总是强制触发更新
    forceTrigger = true
  } 
  // 处理数组类型的源
  else if (isArray(source)) {
    isMultiSource = true
    // 如果数组中有响应式对象或浅层响应式对象，则强制触发更新
    forceTrigger = source.some(s => isReactive(s) || isShallow(s))
    // getter函数遍历数组中的每个源并处理
    getter = () =>
      source.map(s => {
        if (isRef(s)) {
          return s.value
        } else if (isReactive(s)) {
          return reactiveGetter(s)
        } else if (isFunction(s)) {
          return call ? call(s, WatchErrorCodes.WATCH_GETTER) : s()
        } else {
          __DEV__ && warnInvalidSource(s)
        }
      })
  } 
  // 处理函数类型的源
  else if (isFunction(source)) {
    if (cb) {
      // 有回调函数 -> 作为getter使用
      getter = call
        ? () => call(source, WatchErrorCodes.WATCH_GETTER)
        : (source as () => any)
    } else {
      // 无回调函数 -> 作为简单effect使用
      getter = () => {
        if (cleanup) {
          pauseTracking()
          try {
            cleanup()
          } finally {
            resetTracking()
          }
        }
        const currentEffect = activeWatcher
        activeWatcher = effect
        try {
          return call
            ? call(source, WatchErrorCodes.WATCH_CALLBACK, [boundCleanup])
            : source(boundCleanup)
        } finally {
          activeWatcher = currentEffect
        }
      }
    }
  } 
  // 处理无效类型的源
  else {
    getter = NOOP
    __DEV__ && warnInvalidSource(source)
  }

  // 如果有回调函数且需要深度监视
  if (cb && deep) {
    const baseGetter = getter
    // 确定深度：如果deep为true则为无限深度，否则为指定的数字深度
    const depth = deep === true ? Infinity : deep
    // 包装getter函数，添加深度遍历逻辑
    getter = () => traverse(baseGetter(), depth)
  }

  // 获取当前作用域
  const scope = getCurrentScope()

  // 创建监视句柄函数
  const watchHandle: WatchHandle = () => {
    // 停止副作用
    effect.stop()
    // 如果作用域存在且活跃，则从作用域中移除副作用
    if (scope && scope.active) {
      remove(scope.effects, effect)
    }
  }

  // 处理一次性监视
  if (once && cb) {
    const _cb = cb
    // 包装回调函数，调用后立即停止监视
    cb = (...args) => {
      _cb(...args)
      watchHandle()
    }
  }

  // 初始化旧值
  // 如果是多源监视，则创建一个填充INITIAL_WATCHER_VALUE的数组
  // 否则直接使用INITIAL_WATCHER_VALUE
  let oldValue: any = isMultiSource
    ? new Array((source as []).length).fill(INITIAL_WATCHER_VALUE)
    : INITIAL_WATCHER_VALUE

  /**
   * 作业函数，当源值变化时执行
   * 
   * @param immediateFirstRun - 是否是立即执行的首次运行
   */
  const job = (immediateFirstRun?: boolean) => {
    // 如果副作用不活跃，或者既不脏也不是立即执行的首次运行，则不执行
    if (
      !(effect.flags & EffectFlags.ACTIVE) ||
      (!effect.dirty && !immediateFirstRun)
    ) {
      return
    }
    // 如果有回调函数
    if (cb) {
      // 执行getter获取新值
      const newValue = effect.run()
      // 检查是否需要触发回调
      if (
        deep ||
        forceTrigger ||
        (isMultiSource
          ? (newValue as any[]).some((v, i) => hasChanged(v, oldValue[i]))
          : hasChanged(newValue, oldValue))
      ) {
        // 在再次运行回调前执行清理
        if (cleanup) {
          cleanup()
        }
        const currentWatcher = activeWatcher
        activeWatcher = effect
        try {
          // 准备回调参数
          const args = [
            newValue,
            // 首次变化时传递undefined作为旧值
            oldValue === INITIAL_WATCHER_VALUE
              ? undefined
              : isMultiSource && oldValue[0] === INITIAL_WATCHER_VALUE
                ? []
                : oldValue,
            boundCleanup,
          ]
          // 更新旧值
          oldValue = newValue
          // 调用回调函数
          call
            ? call(cb!, WatchErrorCodes.WATCH_CALLBACK, args)
            : // @ts-expect-error
              cb!(...args)
        } finally {
          // 恢复当前活跃监视者
          activeWatcher = currentWatcher
        }
      }
    } else {
      // 没有回调函数，直接运行副作用（watchEffect）
      effect.run()
    }
  }

  if (augmentJob) {
    augmentJob(job)
  }

  // 创建响应式副作用
  effect = new ReactiveEffect(getter)

  // 设置调度器函数
  effect.scheduler = scheduler
    ? () => scheduler(job, false)
    : (job as EffectScheduler)

  // 绑定清理函数到当前effect
  boundCleanup = fn => onWatcherCleanup(fn, false, effect)

  // 定义副作用停止时的清理逻辑
  cleanup = effect.onStop = () => {
    const cleanups = cleanupMap.get(effect)
    if (cleanups) {
      if (call) {
        call(cleanups, WatchErrorCodes.WATCH_CLEANUP)
      } else {
        for (const cleanup of cleanups) cleanup()
      }
      cleanupMap.delete(effect)
    }
  }

  if (__DEV__) {
    effect.onTrack = options.onTrack
    effect.onTrigger = options.onTrigger
  }

  // 初始运行处理
  if (cb) {
    if (immediate) {
      // 立即执行情况
      job(true)
    } else {
      // 非立即执行情况下，先运行一次以初始化旧值
      oldValue = effect.run()
    }
  } else if (scheduler) {
    // 没有回调但有调度器的情况
    scheduler(job.bind(null, true), true)
  } else {
    // 既没有回调也没有调度器的情况（watchEffect）
    effect.run()
  }

  // 设置监视句柄的暂停方法
watchHandle.pause = effect.pause.bind(effect)
// 设置监视句柄的恢复方法
watchHandle.resume = effect.resume.bind(effect)
// 设置监视句柄的停止方法
watchHandle.stop = watchHandle

// 返回监视句柄，用于手动停止、暂停或恢复监视
return watchHandle
}

/**
 * 深度遍历响应式对象，用于实现深度监视
 * 
 * @param value - 要遍历的值
 * @param depth - 剩余遍历深度，默认为无限深度
 * @param seen - 已访问对象的集合，用于避免循环引用
 * @returns 遍历后的值
 */
export function traverse(
  value: unknown,
  depth: number = Infinity,
  seen?: Set<unknown>,
): unknown {
  // 如果深度小于等于0、不是对象或标记为跳过，则直接返回值
  if (depth <= 0 || !isObject(value) || (value as any)[ReactiveFlags.SKIP]) {
    return value
  }

  // 初始化或使用已有的已访问集合
  seen = seen || new Set()
  // 如果已经访问过该对象，则直接返回
  if (seen.has(value)) {
    return value
  }
  // 将当前对象添加到已访问集合
  seen.add(value)
  // 减少剩余深度
  depth--
  // 处理Ref类型
  if (isRef(value)) {
    traverse(value.value, depth, seen)
  } 
  // 处理数组类型
  else if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      traverse(value[i], depth, seen)
    }
  } 
  // 处理Set或Map类型
  else if (isSet(value) || isMap(value)) {
    value.forEach((v: any) => {
      traverse(v, depth, seen)
    })
  } 
  // 处理纯对象类型
  else if (isPlainObject(value)) {
    // 遍历所有常规属性
    for (const key in value) {
      traverse(value[key], depth, seen)
    }
    // 遍历所有Symbol属性
    for (const key of Object.getOwnPropertySymbols(value)) {
      if (Object.prototype.propertyIsEnumerable.call(value, key)) {
        traverse(value[key as any], depth, seen)
      }
    }
  }
  return value
}
