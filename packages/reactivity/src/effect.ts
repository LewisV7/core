/**
 * Vue 响应式系统效果（Effect）实现
 * 该文件定义了响应式效果的核心类和函数，负责依赖收集和触发更新
 */
import { extend, hasChanged } from '@vue/shared'
import type { ComputedRefImpl } from './computed'
import type { TrackOpTypes, TriggerOpTypes } from './constants'
import { type Link, globalVersion } from './dep'
import { activeEffectScope } from './effectScope'
import { warn } from './warning'

/**
 * 效果调度器类型
 * 用于定义调度效果执行的函数
 */
export type EffectScheduler = (...args: any[]) => any

/**
 * 调试器事件类型
 */
export type DebuggerEvent = {
  effect: Subscriber
} & DebuggerEventExtraInfo

/**
 * 调试器事件额外信息类型
 */
export type DebuggerEventExtraInfo = {
  target: object
  type: TrackOpTypes | TriggerOpTypes
  key: any
  newValue?: any
  oldValue?: any
  oldTarget?: Map<any, any> | Set<any>
}

/**
 * 调试器选项接口
 */
export interface DebuggerOptions {
  onTrack?: (event: DebuggerEvent) => void  // 跟踪依赖时的回调
  onTrigger?: (event: DebuggerEvent) => void  // 触发更新时的回调
}

/**
 * 响应式效果选项接口
 */
export interface ReactiveEffectOptions extends DebuggerOptions {
  scheduler?: EffectScheduler  // 调度器函数
  allowRecurse?: boolean  // 是否允许递归
  onStop?: () => void  // 停止时的回调
}

/**
 * 响应式效果运行器接口
 */
export interface ReactiveEffectRunner<T = any> {
  (): T  // 运行效果的函数
  effect: ReactiveEffect  // 关联的效果对象
}

/**
 * 当前活动的订阅者
 */
export let activeSub: Subscriber | undefined

/**
 * 效果标志枚举
 * 用于表示响应式效果的各种状态
 */
export enum EffectFlags {
  /**
   * 效果是否激活
   * 仅 ReactiveEffect 使用
   */
  ACTIVE = 1 << 0,
  /**
   * 效果是否正在运行
   */
  RUNNING = 1 << 1,
  /**
   * 效果是否正在跟踪依赖
   */
  TRACKING = 1 << 2,
  /**
   * 效果是否已通知更新
   */
  NOTIFIED = 1 << 3,
  /**
   * 效果是否需要重新计算
   */
  DIRTY = 1 << 4,
  /**
   * 是否允许递归运行
   */
  ALLOW_RECURSE = 1 << 5,
  /**
   * 效果是否已暂停
   */
  PAUSED = 1 << 6,
  /**
   * 效果是否已计算
   */
  EVALUATED = 1 << 7,
}

/**
 * 订阅者接口
 * 跟踪（或订阅）一系列依赖的类型
 */
export interface Subscriber extends DebuggerOptions {
  /**
   * 表示依赖的双向链表头部
   * @internal
   */
  deps?: Link
  /**
   * 同一链表的尾部
   * @internal
   */
  depsTail?: Link
  /**
   * 效果标志
   * @internal
   */
  flags: EffectFlags
  /**
   * 指向下一个订阅者
   * @internal
   */
  next?: Subscriber
  /**
   * 通知方法
   * 返回 `true` 表示它是一个计算属性，需要在其依赖上调用 notify
   * @internal
   */
  notify(): true | void
}

/**
 * 存储已暂停的效果队列
 */
const pausedQueueEffects = new WeakSet<ReactiveEffect>()

/**
 * 响应式效果类
 * 实现响应式依赖追踪和触发更新的核心功能
 */
export class ReactiveEffect<T = any>
  implements Subscriber, ReactiveEffectOptions
{
  /**
   * 依赖链表头部
   * @internal
   */
  deps?: Link = undefined
  /**
   * 依赖链表尾部
   * @internal
   */
  depsTail?: Link = undefined
  /**
   * 效果标志，初始为激活和跟踪状态
   * @internal
   */
  flags: EffectFlags = EffectFlags.ACTIVE | EffectFlags.TRACKING
  /**
   * 指向下一个订阅者
   * @internal
   */
  next?: Subscriber = undefined
  /**
   * 清理函数
   * @internal
   */
  cleanup?: () => void = undefined

  scheduler?: EffectScheduler = undefined  // 调度器函数
  onStop?: () => void  // 停止时回调
  onTrack?: (event: DebuggerEvent) => void  // 跟踪依赖时回调
  onTrigger?: (event: DebuggerEvent) => void  // 触发更新时回调

  /**
   * 构造函数
   * @param fn - 要执行的效果函数
   */
  constructor(public fn: () => T) {
    if (activeEffectScope && activeEffectScope.active) {
      activeEffectScope.effects.push(this)
    }
  }

  /**
   * 暂停效果
   */
  pause(): void {
    this.flags |= EffectFlags.PAUSED
  }

  /**
   * 恢复已暂停的效果
   */
  resume(): void {
    if (this.flags & EffectFlags.PAUSED) {
      this.flags &= ~EffectFlags.PAUSED
      if (pausedQueueEffects.has(this)) {
        pausedQueueEffects.delete(this)
        this.trigger()
      }
    }
  }

  /**
   * 通知效果需要更新
   * @internal
   */
  notify(): void {
    if (
      this.flags & EffectFlags.RUNNING &&
      !(this.flags & EffectFlags.ALLOW_RECURSE)
    ) {
      return
    }
    if (!(this.flags & EffectFlags.NOTIFIED)) {
      batch(this)
    }
  }

  /**
   * 运行效果函数
   * @returns 效果函数的返回值
   */
  run(): T {
    // TODO cleanupEffect

    if (!(this.flags & EffectFlags.ACTIVE)) {
      // stopped during cleanup
      return this.fn()
    }

    this.flags |= EffectFlags.RUNNING
    cleanupEffect(this)
    prepareDeps(this)
    const prevEffect = activeSub
    const prevShouldTrack = shouldTrack
    activeSub = this
    shouldTrack = true

    try {
      return this.fn()
    } finally {
      if (__DEV__ && activeSub !== this) {
        warn(
          'Active effect was not restored correctly - ' +
            'this is likely a Vue internal bug.',
        )
      }
      cleanupDeps(this)
      activeSub = prevEffect
      shouldTrack = prevShouldTrack
      this.flags &= ~EffectFlags.RUNNING
    }
  }

  /**
   * 停止效果
   * 清除所有依赖并将效果标记为非激活
   */
  stop(): void {
    if (this.flags & EffectFlags.ACTIVE) {
      for (let link = this.deps; link; link = link.nextDep) {
        removeSub(link)
      }
      this.deps = this.depsTail = undefined
      cleanupEffect(this)
      this.onStop && this.onStop()
      this.flags &= ~EffectFlags.ACTIVE
    }
  }

  /**
   * 触发效果更新
   */
  trigger(): void {
    if (this.flags & EffectFlags.PAUSED) {
      pausedQueueEffects.add(this)
    } else if (this.scheduler) {
      this.scheduler()
    } else {
      this.runIfDirty()
    }
  }

  /**
   * 如果效果需要更新则运行
   * @internal
   */
  runIfDirty(): void {
    if (isDirty(this)) {
      this.run()
    }
  }

  /**
   * 检查效果是否需要更新
   */
  get dirty(): boolean {
    return isDirty(this)
  }
}

/**
 * For debugging
 */
// /**
//  * 打印依赖（调试用）
//  */
// function printDeps(sub: Subscriber) {
//   let d = sub.deps
//   let ds = []
//   while (d) {
//     ds.push(d)
//     d = d.nextDep
//   }
//   return ds.map(d => ({
//     id: d.id,
//     prev: d.prevDep?.id,
//     next: d.nextDep?.id,
//   }))
// }

/**
 * 批处理深度
 */
let batchDepth = 0
/**
 * 批处理的订阅者队列
 */
let batchedSub: Subscriber | undefined
/**
 * 批处理的计算属性队列
 */
let batchedComputed: Subscriber | undefined

/**
 * 批处理订阅者
 * @param sub - 订阅者
 * @param isComputed - 是否为计算属性
 */
export function batch(sub: Subscriber, isComputed = false): void {
  sub.flags |= EffectFlags.NOTIFIED
  if (isComputed) {
    sub.next = batchedComputed
    batchedComputed = sub
    return
  }
  sub.next = batchedSub
  batchedSub = sub
}

/**
 * 开始批处理
 * @internal
 */
export function startBatch(): void {
  batchDepth++
}

/**
 * 当所有批处理结束时运行批处理的效果
 * @internal
 */
export function endBatch(): void {
  if (--batchDepth > 0) {
    return
  }

  if (batchedComputed) {
    let e: Subscriber | undefined = batchedComputed
    batchedComputed = undefined
    while (e) {
      const next: Subscriber | undefined = e.next
      e.next = undefined
      e.flags &= ~EffectFlags.NOTIFIED
      e = next
    }
  }

  let error: unknown
  while (batchedSub) {
    let e: Subscriber | undefined = batchedSub
    batchedSub = undefined
    while (e) {
      const next: Subscriber | undefined = e.next
      e.next = undefined
      e.flags &= ~EffectFlags.NOTIFIED
      if (e.flags & EffectFlags.ACTIVE) {
        try {
          // ACTIVE flag is effect-only
          ;(e as ReactiveEffect).trigger()
        } catch (err) {
          if (!error) error = err
        }
      }
      e = next
    }
  }

  if (error) throw error
}

/**
 * 准备依赖进行跟踪
 * @param sub - 订阅者
 */
function prepareDeps(sub: Subscriber) {
  // 从头部开始准备依赖进行跟踪
  for (let link = sub.deps; link; link = link.nextDep) {
    // 将所有先前依赖的版本设置为 -1，以便我们可以跟踪运行后哪些未使用
    link.version = -1
    // 存储先前的活动订阅者（如果链接在另一个上下文中使用）
    link.prevActiveLink = link.dep.activeLink
    link.dep.activeLink = link
  }
}

/**
 * 清理未使用的依赖
 * @param sub - 订阅者
 */
function cleanupDeps(sub: Subscriber) {
  // 清理未使用的依赖
  let head
  let tail = sub.depsTail
  let link = tail
  while (link) {
    const prev = link.prevDep
    if (link.version === -1) {
      if (link === tail) tail = prev
      // 未使用 - 从依赖的订阅效果列表中移除
      removeSub(link)
      // 也从这个效果的依赖列表中移除
      removeDep(link)
    } else {
      // 新头部是最后一个未从双向链表中移除的节点
      head = link
    }

    // 恢复先前的活动链接（如果有）
    link.dep.activeLink = link.prevActiveLink
    link.prevActiveLink = undefined
    link = prev
  }
  // 设置新的头部和尾部
  sub.deps = head
  sub.depsTail = tail
}

/**
 * 检查订阅者是否需要更新
 * @param sub - 订阅者
 * @returns 是否需要更新
 */
function isDirty(sub: Subscriber): boolean {
  for (let link = sub.deps; link; link = link.nextDep) {
    if (
      link.dep.version !== link.version ||
      (link.dep.computed &&
        (refreshComputed(link.dep.computed) ||
          link.dep.version !== link.version))
    ) {
      return true
    }
  }
  // @ts-expect-error 仅为向后兼容，某些库手动设置此标志 - 例如 Pinia 的测试模块
  if (sub._dirty) {
    return true
  }
  return false
}

/**
 * 刷新计算属性
 * 返回 false 表示刷新失败
 * @internal
 */
export function refreshComputed(computed: ComputedRefImpl): undefined {
  if (
    computed.flags & EffectFlags.TRACKING &&
    !(computed.flags & EffectFlags.DIRTY)
  ) {
    return
  }
  computed.flags &= ~EffectFlags.DIRTY

  // 全局版本快速路径，当自上次刷新以来没有响应式更改发生时
  if (computed.globalVersion === globalVersion) {
    return
  }
  computed.globalVersion = globalVersion

  // 在 SSR 中没有渲染效果，因此计算属性没有订阅者，也不跟踪依赖，
  // 因此我们不能依赖脏检查。相反，计算属性总是重新评估，并依赖上面的全局版本快速路径进行缓存。
  // #12337 如果计算属性没有依赖（不依赖任何响应式数据）并且已经计算过，则不需要重新评估。
  if (
    !computed.isSSR &&
    computed.flags & EffectFlags.EVALUATED &&
    ((!computed.deps && !(computed as any)._dirty) || !isDirty(computed))
  ) {
    return
  }
  computed.flags |= EffectFlags.RUNNING

  const dep = computed.dep
  const prevSub = activeSub
  const prevShouldTrack = shouldTrack
  activeSub = computed
  shouldTrack = true

  try {
    prepareDeps(computed)
    const value = computed.fn(computed._value)
    if (dep.version === 0 || hasChanged(value, computed._value)) {
      computed.flags |= EffectFlags.EVALUATED
      computed._value = value
      dep.version++
    }
  } catch (err) {
    dep.version++
    throw err
  } finally {
    activeSub = prevSub
    shouldTrack = prevShouldTrack
    cleanupDeps(computed)
    computed.flags &= ~EffectFlags.RUNNING
  }
}

/**
 * 从依赖中移除订阅链接
 * @param link - 订阅链接
 * @param soft - 是否为软移除
 */
function removeSub(link: Link, soft = false) {
  const { dep, prevSub, nextSub } = link
  if (prevSub) {
    prevSub.nextSub = nextSub
    link.prevSub = undefined
  }
  if (nextSub) {
    nextSub.prevSub = prevSub
    link.nextSub = undefined
  }
  if (__DEV__ && dep.subsHead === link) {
    // 是先前的头部，将新头部指向next
    dep.subsHead = nextSub
  }

  if (dep.subs === link) {
    // 是先前的尾部，将新尾部指向前一个
    dep.subs = prevSub

    if (!prevSub && dep.computed) {
      // 如果是计算属性，取消订阅所有依赖，以便这个计算属性及其值可以被垃圾回收
      dep.computed.flags &= ~EffectFlags.TRACKING
      for (let l = dep.computed.deps; l; l = l.nextDep) {
        // 这里我们只是"软"取消订阅，因为计算属性仍然引用依赖，依赖不应减少其订阅计数
        removeSub(l, true)
      }
    }
  }

  if (!soft && !--dep.sc && dep.map) {
    // #11979
    // 属性依赖不再有效订阅者，删除它
    // 这主要是针对对象保留在内存中但一次只跟踪其属性子集的情况
    dep.map.delete(dep.key)
  }
}

/**
 * 从订阅者的依赖列表中移除链接
 * @param link - 依赖链接
 */
function removeDep(link: Link) {
  const { prevDep, nextDep } = link
  if (prevDep) {
    prevDep.nextDep = nextDep
    link.prevDep = undefined
  }
  if (nextDep) {
    nextDep.prevDep = prevDep
    link.nextDep = undefined
  }
}

/**
 * 响应式效果运行器接口
 * 重复定义以确保类型一致性
 */
export interface ReactiveEffectRunner<T = any> {
  (): T
  effect: ReactiveEffect
}

/**
 * 创建响应式效果
 * @param fn - 效果函数
 * @param options - 效果选项
 * @returns 效果运行器
 */
export function effect<T = any>(
  fn: () => T,
  options?: ReactiveEffectOptions,
): ReactiveEffectRunner<T> {
  if ((fn as ReactiveEffectRunner).effect instanceof ReactiveEffect) {
    fn = (fn as ReactiveEffectRunner).effect.fn
  }

  const e = new ReactiveEffect(fn)
  if (options) {
    extend(e, options)
  }
  try {
    e.run()
  } catch (err) {
    e.stop()
    throw err
  }
  const runner = e.run.bind(e) as ReactiveEffectRunner
  runner.effect = e
  return runner
}

/**
 * Stops the effect associated with the given runner.
 *
 * @param runner - Association with the effect to stop tracking.
 */
export function stop(runner: ReactiveEffectRunner): void {
  runner.effect.stop()
}

/**
 * @internal
 */
export let shouldTrack = true
const trackStack: boolean[] = []

/**
 * Temporarily pauses tracking.
 */
export function pauseTracking(): void {
  trackStack.push(shouldTrack)
  shouldTrack = false
}

/**
 * Re-enables effect tracking (if it was paused).
 */
export function enableTracking(): void {
  trackStack.push(shouldTrack)
  shouldTrack = true
}

/**
 * Resets the previous global effect tracking state.
 */
export function resetTracking(): void {
  const last = trackStack.pop()
  shouldTrack = last === undefined ? true : last
}

/**
 * Registers a cleanup function for the current active effect.
 * The cleanup function is called right before the next effect run, or when the
 * effect is stopped.
 *
 * Throws a warning if there is no current active effect. The warning can be
 * suppressed by passing `true` to the second argument.
 *
 * @param fn - the cleanup function to be registered
 * @param failSilently - if `true`, will not throw warning when called without
 * an active effect.
 */
export function onEffectCleanup(fn: () => void, failSilently = false): void {
  if (activeSub instanceof ReactiveEffect) {
    activeSub.cleanup = fn
  } else if (__DEV__ && !failSilently) {
    warn(
      `onEffectCleanup() was called when there was no active effect` +
        ` to associate with.`,
    )
  }
}

function cleanupEffect(e: ReactiveEffect) {
  const { cleanup } = e
  e.cleanup = undefined
  if (cleanup) {
    // run cleanup without active effect
    const prevSub = activeSub
    activeSub = undefined
    try {
      cleanup()
    } finally {
      activeSub = prevSub
    }
  }
}
