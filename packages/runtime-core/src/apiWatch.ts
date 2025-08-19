/**
 * Vue 3 核心模块 - 响应式观察 API
 * 提供监测响应式数据变化并执行副作用的能力
 */
import {
  type WatchOptions as BaseWatchOptions,
  type DebuggerOptions,
  type ReactiveMarker,
  type WatchCallback,
  type WatchEffect,
  type WatchHandle,
  type WatchSource,
  watch as baseWatch,
} from '@vue/reactivity'
import { type SchedulerJob, SchedulerJobFlags, queueJob } from './scheduler'
import { EMPTY_OBJ, NOOP, extend, isFunction, isString } from '@vue/shared'
import {
  type ComponentInternalInstance,
  currentInstance,
  isInSSRComponentSetup,
  setCurrentInstance,
} from './component'
import { callWithAsyncErrorHandling } from './errorHandling'
import { queuePostRenderEffect } from './renderer'
import { warn } from './warning'
import type { ObjectWatchOptionItem } from './componentOptions'
import { useSSRContext } from './helpers/useSsrContext'

export type {
  WatchHandle,
  WatchStopHandle,
  WatchEffect,
  WatchSource,
  WatchCallback,
  OnCleanup,
} from '@vue/reactivity'

/**
 * 可能为 undefined 的类型
 * @template T 基础类型
 * @template I 是否可能为 undefined 的标记类型
 */
type MaybeUndefined<T, I> = I extends true ? T | undefined : T

/**
 * 映射观察源类型到其值类型
 * @template T 观察源对象类型
 * @template Immediate 是否立即执行的标记
 */
type MapSources<T, Immediate> = {
  [K in keyof T]: T[K] extends WatchSource<infer V>
    ? MaybeUndefined<V, Immediate>
    : T[K] extends object
      ? MaybeUndefined<T[K], Immediate>
      : never
}

/**
 * watchEffect 选项
 */
export interface WatchEffectOptions extends DebuggerOptions {
  flush?: 'pre' | 'post' | 'sync'
}

/**
 * watch 选项
 * @template Immediate 是否立即执行的标记
 */
export interface WatchOptions<Immediate = boolean> extends WatchEffectOptions {
  immediate?: Immediate
  deep?: boolean | number
  once?: boolean
}

// 简单副作用观察器
/**
 * 创建一个响应式的副作用函数，当依赖变化时重新运行
 * @param effect 要执行的副作用函数
 * @param options 配置选项
 * @returns 停止观察的函数
 */
export function watchEffect(
  effect: WatchEffect,
  options?: WatchEffectOptions,
): WatchHandle {
  return doWatch(effect, null, options)
}

/**
 * 创建一个在DOM更新后执行的副作用函数
 * @param effect 要执行的副作用函数
 * @param options 配置选项
 * @returns 停止观察的函数
 */
export function watchPostEffect(
  effect: WatchEffect,
  options?: DebuggerOptions,
): WatchHandle {
  return doWatch(
    effect,
    null,
    __DEV__ ? extend({}, options as any, { flush: 'post' }) : { flush: 'post' },
  )
}

/**
 * 创建一个同步执行的副作用函数
 * @param effect 要执行的副作用函数
 * @param options 配置选项
 * @returns 停止观察的函数
 */
export function watchSyncEffect(
  effect: WatchEffect,
  options?: DebuggerOptions,
): WatchHandle {
  return doWatch(
    effect,
    null,
    __DEV__ ? extend({}, options as any, { flush: 'sync' }) : { flush: 'sync' },
  )
}

/**
 * 多个观察源的数组类型
 */
export type MultiWatchSources = (WatchSource<unknown> | object)[]

// 重载: 单个源 + 回调函数
/**
 * 观察多个响应式源并在变化时执行回调
 * @template T 观察源数组类型
 * @template Immediate 是否立即执行的标记
 * @param sources 观察源数组
 * @param cb 回调函数
 * @param options 配置选项
 * @returns 停止观察的函数
 */
/**
 * 观察多个响应式源并在变化时执行回调
 * @template T 观察源数组类型
 * @template Immediate 是否立即执行的标记
 * @param sources 观察源数组
 * @param cb 回调函数
 * @param options 配置选项
 * @returns 停止观察的函数
 */
/**
 * 观察响应式对象并在变化时执行回调
 * @template T 响应式对象类型
 * @template Immediate 是否立即执行的标记
 * @param source 响应式对象
 * @param cb 回调函数
 * @param options 配置选项
 * @returns 停止观察的函数
 */
export function watch<T, Immediate extends Readonly<boolean> = false>(
  source: WatchSource<T>,
  cb: WatchCallback<T, MaybeUndefined<T, Immediate>>,
  options?: WatchOptions<Immediate>,
): WatchHandle

// 重载: 响应式数组或多个源的元组 + 回调函数
export function watch<
  T extends Readonly<MultiWatchSources>,
  Immediate extends Readonly<boolean> = false,
>(
  sources: readonly [...T] | T,
  cb: [T] extends [ReactiveMarker]
    ? WatchCallback<T, MaybeUndefined<T, Immediate>>
    : WatchCallback<MapSources<T, false>, MapSources<T, Immediate>>,
  options?: WatchOptions<Immediate>,
): WatchHandle

// 重载: 多个源的数组 + 回调函数
export function watch<
  T extends MultiWatchSources,
  Immediate extends Readonly<boolean> = false,
>(
  sources: [...T],
  cb: WatchCallback<MapSources<T, false>, MapSources<T, Immediate>>,
  options?: WatchOptions<Immediate>,
): WatchHandle

// 重载: 观察响应式对象 + 回调函数
export function watch<
  T extends object,
  Immediate extends Readonly<boolean> = false,
>(
  source: T,
  cb: WatchCallback<T, MaybeUndefined<T, Immediate>>,
  options?: WatchOptions<Immediate>,
): WatchHandle

// 实现
export function watch<T = any, Immediate extends Readonly<boolean> = false>(
  source: T | WatchSource<T>,
  cb: any,
  options?: WatchOptions<Immediate>,
): WatchHandle {
  if (__DEV__ && !isFunction(cb)) {
    warn(
      `\`watch(fn, options?)\` signature has been moved to a separate API. ` +
        `Use \`watchEffect(fn, options?)\` instead. \`watch\` now only ` +
        `supports \`watch(source, cb, options?) signature.`,
    )
  }
  return doWatch(source as any, cb, options)
}

function doWatch(
  source: WatchSource | WatchSource[] | WatchEffect | object,
  cb: WatchCallback | null,
  options: WatchOptions = EMPTY_OBJ,
): WatchHandle {
  // 提取选项
const { immediate, deep, flush, once } = options

  // 开发环境下的无效选项警告
if (__DEV__ && !cb) {
    if (immediate !== undefined) {
      warn(
        `watch() "immediate" option is only respected when using the ` +
          `watch(source, callback, options?) signature.`,
      )
    }
    if (deep !== undefined) {
      warn(
        `watch() "deep" option is only respected when using the ` +
          `watch(source, callback, options?) signature.`,
      )
    }
    if (once !== undefined) {
      warn(
        `watch() "once" option is only respected when using the ` +
          `watch(source, callback, options?) signature.`,
      )
    }
  }

  // 准备基础观察选项
const baseWatchOptions: BaseWatchOptions = extend({}, options)

  if (__DEV__) baseWatchOptions.onWarn = warn

  // immediate watcher or watchEffect
  // 立即执行的观察器或副作用观察
const runsImmediately = (cb && immediate) || (!cb && flush !== 'post')
  let ssrCleanup: (() => void)[] | undefined
  // SSR环境清理函数
if (__SSR__ && isInSSRComponentSetup) {
    if (flush === 'sync') {
      const ctx = useSSRContext()!
      ssrCleanup = ctx.__watcherHandles || (ctx.__watcherHandles = [])
    } else if (!runsImmediately) {
      const watchStopHandle = () => {}
      watchStopHandle.stop = NOOP
      watchStopHandle.resume = NOOP
      watchStopHandle.pause = NOOP
      return watchStopHandle
    }
  }

  // 获取当前组件实例
const instance = currentInstance
  baseWatchOptions.call = (fn, type, args) =>
    callWithAsyncErrorHandling(fn, instance, type, args)

  // 调度器设置
  let isPre = false
  if (flush === 'post') {
    baseWatchOptions.scheduler = job => {
      queuePostRenderEffect(job, instance && instance.suspense)
    }
  } else if (flush !== 'sync') {
    // default: 'pre'
    isPre = true
    baseWatchOptions.scheduler = (job, isFirstRun) => {
      if (isFirstRun) {
        job()
      } else {
        queueJob(job)
      }
    }
  }

  baseWatchOptions.augmentJob = (job: SchedulerJob) => {
    // important: mark the job as a watcher callback so that scheduler knows
    // it is allowed to self-trigger (#1727)
    if (cb) {
      job.flags! |= SchedulerJobFlags.ALLOW_RECURSE
    }
    if (isPre) {
      job.flags! |= SchedulerJobFlags.PRE
      if (instance) {
        job.id = instance.uid
        ;(job as SchedulerJob).i = instance
      }
    }
  }

  // 创建基础观察器
const watchHandle = baseWatch(source, cb, baseWatchOptions)

  if (__SSR__ && isInSSRComponentSetup) {
    if (ssrCleanup) {
      ssrCleanup.push(watchHandle)
    } else if (runsImmediately) {
      watchHandle()
    }
  }

  return watchHandle
}

// 组件实例的 $watch 方法
/**
 * 组件实例的 $watch 方法实现
 * @param source 观察源
 * @param value 回调函数或选项对象
 * @param options 配置选项
 * @returns 停止观察的函数
 */
export function instanceWatch(
  this: ComponentInternalInstance,
  source: string | Function,
  value: WatchCallback | ObjectWatchOptionItem,
  options?: WatchOptions,
): WatchHandle {
  const publicThis = this.proxy as any
  const getter = isString(source)
    ? source.includes('.')
      ? createPathGetter(publicThis, source)
      : () => publicThis[source]
    : source.bind(publicThis, publicThis)
  let cb
  if (isFunction(value)) {
    cb = value
  } else {
    cb = value.handler as Function
    options = value
  }
  const reset = setCurrentInstance(this)
  const res = doWatch(getter, cb.bind(publicThis), options)
  reset()
  return res
}

/**
 * 创建路径访问器函数
 * @param ctx 上下文对象
 * @param path 属性路径
 * @returns 访问指定路径属性的函数
 */
export function createPathGetter(ctx: any, path: string) {
  const segments = path.split('.')
  return (): any => {
    let cur = ctx
    for (let i = 0; i < segments.length && cur; i++) {
      cur = cur[segments[i]]
    }
    return cur
  }
}
