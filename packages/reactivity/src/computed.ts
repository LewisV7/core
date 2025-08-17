/**
 * Vue 响应式系统 - 计算属性实现
 * 提供计算属性功能，支持只读和可写两种模式
 */
import { isFunction } from '@vue/shared'
import {
  type DebuggerEvent,
  type DebuggerOptions,
  EffectFlags,
  type Subscriber,
  activeSub,
  batch,
  refreshComputed,
} from './effect'
import type { Ref } from './ref'
import { warn } from './warning'
import { Dep, type Link, globalVersion } from './dep'
import { ReactiveFlags, TrackOpTypes } from './constants'

/**
 * 计算属性引用的唯一标识符号
 */
declare const ComputedRefSymbol: unique symbol
/**
 * 可写计算属性引用的唯一标识符号
 */
declare const WritableComputedRefSymbol: unique symbol

/**
 * 计算属性引用的基础接口
 * @template T - 计算属性的值类型
 * @template S - 设置值的类型
 */
interface BaseComputedRef<T, S = T> extends Ref<T, S> {
  [ComputedRefSymbol]: true
  /**
   * @deprecated computed no longer uses effect
   */
  effect: ComputedRefImpl
}

/**
 * 只读计算属性引用接口
 * @template T - 计算属性的值类型
 */
export interface ComputedRef<T = any> extends BaseComputedRef<T> {
  readonly value: T
}

/**
 * 可写计算属性引用接口
 * @template T - 计算属性的值类型
 * @template S - 设置值的类型
 */
export interface WritableComputedRef<T, S = T> extends BaseComputedRef<T, S> {
  [WritableComputedRefSymbol]: true
}

/**
 * 计算属性的 getter 函数类型
 * @template T - 返回值类型
 * @param oldValue - 旧值（可选）
 * @returns 计算后的值
 */
export type ComputedGetter<T> = (oldValue?: T) => T
/**
 * 计算属性的 setter 函数类型
 * @template T - 值类型
 * @param newValue - 新值
 */
export type ComputedSetter<T> = (newValue: T) => void

/**
 * 可写计算属性的选项接口
 * @template T - getter 返回值类型
 * @template S - setter 接收值类型
 */
export interface WritableComputedOptions<T, S = T> {
  get: ComputedGetter<T>
  set: ComputedSetter<S>
}

/**
 * @private exported by @vue/reactivity for Vue core use, but not exported from
 * the main vue package
 */
/**
 * 计算属性引用的实现类
 * @template T - 计算属性的值类型
 * @internal 由 @vue/reactivity 导出供 Vue 核心使用，但不从主 vue 包导出
 */
export class ComputedRefImpl<T = any> implements Subscriber {
  /**
   * @internal
   */
  /**
 * 存储计算后的值
 * @internal
 */
_value: any = undefined
  /**
   * @internal
   */
  /**
 * 依赖收集器
 * @internal
 */
readonly dep: Dep = new Dep(this)
  /**
   * @internal
   */
  /**
 * 标记为 Ref 类型
 * @internal
 */
readonly __v_isRef = true
  // TODO isolatedDeclarations ReactiveFlags.IS_REF
  /**
   * @internal
   */
  /**
 * 是否为只读
 * @internal
 */
readonly __v_isReadonly: boolean
  // TODO isolatedDeclarations ReactiveFlags.IS_READONLY
  // A computed is also a subscriber that tracks other deps
  /**
   * @internal
   */
  /**
 * 依赖链表
 * @internal
 */
deps?: Link = undefined
  /**
   * @internal
   */
  /**
 * 依赖链表尾部
 * @internal
 */
depsTail?: Link = undefined
  /**
   * @internal
   */
  /**
 * 状态标志
 * @internal
 */
flags: EffectFlags = EffectFlags.DIRTY
  /**
   * @internal
   */
  /**
 * 全局版本号
 * @internal
 */
globalVersion: number = globalVersion - 1
  /**
   * @internal
   */
  /**
 * 是否在服务端渲染环境
 * @internal
 */
isSSR: boolean
  /**
   * @internal
   */
  /**
 * 下一个订阅者
 * @internal
 */
next?: Subscriber = undefined

  // for backwards compat
  /**
 * 向后兼容，指向自身
 */
effect: this = this
  // dev only
  /**
 * 依赖追踪回调（开发环境）
 */
onTrack?: (event: DebuggerEvent) => void
  // dev only
  /**
 * 触发更新回调（开发环境）
 */
onTrigger?: (event: DebuggerEvent) => void

  /**
   * Dev only
   * @internal
   */
  /**
 * 是否警告递归（开发环境）
 * @internal
 */
_warnRecursive?: boolean

  /**
 * 构造函数
 * @param fn - 计算函数
 * @param setter - 设置函数（可选）
 * @param isSSR - 是否在服务端渲染环境
 */
constructor(
    public fn: ComputedGetter<T>,
    private readonly setter: ComputedSetter<T> | undefined,
    isSSR: boolean,
  ) {
    this[ReactiveFlags.IS_READONLY] = !setter
    this.isSSR = isSSR
  }

  /**
   * @internal
   */
  /**
 * 通知计算属性更新
 * @internal
 */
notify(): true | void {
    this.flags |= EffectFlags.DIRTY
    if (
      !(this.flags & EffectFlags.NOTIFIED) &&
      // avoid infinite self recursion
      activeSub !== this
    ) {
      batch(this, true)
      return true
    } else if (__DEV__) {
      // TODO warn
    }
  }

  /**
 * 获取计算属性的值
 * 会触发依赖追踪和计算更新
 */
get value(): T {
    const link = __DEV__
      ? this.dep.track({
          target: this,
          type: TrackOpTypes.GET,
          key: 'value',
        })
      : this.dep.track()
    refreshComputed(this)
    // sync version after evaluation
    if (link) {
      link.version = this.dep.version
    }
    return this._value
  }

  /**
 * 设置计算属性的值
 * 只有可写计算属性才能调用
 * @param newValue - 新值
 */
set value(newValue) {
    if (this.setter) {
      this.setter(newValue)
    } else if (__DEV__) {
      warn('Write operation failed: computed value is readonly')
    }
  }
}

/**
 * Takes a getter function and returns a readonly reactive ref object for the
 * returned value from the getter. It can also take an object with get and set
 * functions to create a writable ref object.
 *
 * @example
 * ```js
 * // Creating a readonly computed ref:
 * const count = ref(1)
 * const plusOne = computed(() => count.value + 1)
 *
 * console.log(plusOne.value) // 2
 * plusOne.value++ // error
 * ```
 *
 * ```js
 * // Creating a writable computed ref:
 * const count = ref(1)
 * const plusOne = computed({
 *   get: () => count.value + 1,
 *   set: (val) => {
 *     count.value = val - 1
 *   }
 * })
 *
 * plusOne.value = 1
 * console.log(count.value) // 0
 * ```
 *
 * @param getter - Function that produces the next value.
 * @param debugOptions - For debugging. See {@link https://vuejs.org/guide/extras/reactivity-in-depth.html#computed-debugging}.
 * @see {@link https://vuejs.org/api/reactivity-core.html#computed}
 */
/**
 * 创建计算属性
 * 接收一个 getter 函数或包含 get 和 set 的对象
 * @example
 * ```js
 * // 创建只读计算属性
 * const count = ref(1)
 * const plusOne = computed(() => count.value + 1)
 *
 * // 创建可写计算属性
 * const count = ref(1)
 * const plusOne = computed({
 *   get: () => count.value + 1,
 *   set: (val) => { count.value = val - 1 }
 * })
 * ```
 * @param getterOrOptions - getter 函数或包含 get 和 set 的对象
 * @param debugOptions - 调试选项
 * @param isSSR - 是否在服务端渲染环境
 * @returns 计算属性引用
 */
export function computed<T>(
  getter: ComputedGetter<T>,
  debugOptions?: DebuggerOptions,
): ComputedRef<T>
export function computed<T, S = T>(
  options: WritableComputedOptions<T, S>,
  debugOptions?: DebuggerOptions,
): WritableComputedRef<T, S>
export function computed<T>(
  getterOrOptions: ComputedGetter<T> | WritableComputedOptions<T>,
  debugOptions?: DebuggerOptions,
  isSSR = false,
) {
  let getter: ComputedGetter<T>
  let setter: ComputedSetter<T> | undefined

  if (isFunction(getterOrOptions)) {
    getter = getterOrOptions
  } else {
    getter = getterOrOptions.get
    setter = getterOrOptions.set
  }

  const cRef = new ComputedRefImpl(getter, setter, isSSR)

  if (__DEV__ && debugOptions && !isSSR) {
    cRef.onTrack = debugOptions.onTrack
    cRef.onTrigger = debugOptions.onTrigger
  }

  return cRef as any
}
