/**
 * Vue 响应式系统核心 API 导出
 * 该文件集中导出响应式系统的所有核心功能和类型
 */

/**
 * 引用（Ref）相关 API
 * 提供创建和操作响应式引用的功能
 */
export {
  ref,
  shallowRef,
  isRef,
  toRef,
  toValue,
  toRefs,
  unref,
  proxyRefs,
  customRef,
  triggerRef,
  type Ref,
  type MaybeRef,
  type MaybeRefOrGetter,
  type ToRef,
  type ToRefs,
  type UnwrapRef,
  type ShallowRef,
  type ShallowUnwrapRef,
  type RefUnwrapBailTypes,
  type CustomRefFactory,
} from './ref'
/**
 * 响应式对象相关 API
 * 提供创建和操作响应式对象的功能
 */
export {
  reactive,
  readonly,
  isReactive,
  isReadonly,
  isShallow,
  isProxy,
  shallowReactive,
  shallowReadonly,
  markRaw,
  toRaw,
  toReactive,
  toReadonly,
  type Raw,
  type DeepReadonly,
  type ShallowReactive,
  type UnwrapNestedRefs,
  type Reactive,
  type ReactiveMarker,
} from './reactive'
/**
 * 计算属性相关 API
 * 提供创建和操作计算属性的功能
 */
export {
  computed,
  type ComputedRef,
  type WritableComputedRef,
  type WritableComputedOptions,
  type ComputedGetter,
  type ComputedSetter,
  type ComputedRefImpl,
} from './computed'
/**
 * 效果（Effect）相关 API
 * 提供创建和管理响应式效果的功能
 */
export {
  effect,
  stop,
  enableTracking,
  pauseTracking,
  resetTracking,
  onEffectCleanup,
  ReactiveEffect,
  EffectFlags,
  type ReactiveEffectRunner,
  type ReactiveEffectOptions,
  type EffectScheduler,
  type DebuggerOptions,
  type DebuggerEvent,
  type DebuggerEventExtraInfo,
} from './effect'
/**
 * 依赖追踪相关 API
 * 提供依赖收集和触发更新的底层功能
 */
export {
  trigger,
  track,
  ITERATE_KEY,
  ARRAY_ITERATE_KEY,
  MAP_KEY_ITERATE_KEY,
} from './dep'
/**
 * 效果作用域相关 API
 * 提供管理效果作用域的功能
 */
export {
  effectScope,
  EffectScope,
  getCurrentScope,
  onScopeDispose,
} from './effectScope'
/**
 * 数组工具方法
 * 提供响应式数组的工具方法
 */
export { reactiveReadArray, shallowReadArray } from './arrayInstrumentations'
/**
 * 常量定义
 * 导出响应式系统使用的常量
 */
export { TrackOpTypes, TriggerOpTypes, ReactiveFlags } from './constants'
/**
 * 监听器相关 API
 * 提供创建和管理响应式监听器的功能
 */
export {
  watch,
  getCurrentWatcher,
  traverse,
  onWatcherCleanup,
  WatchErrorCodes,
  type WatchOptions,
  type WatchScheduler,
  type WatchStopHandle,
  type WatchHandle,
  type WatchEffect,
  type WatchSource,
  type WatchCallback,
  type OnCleanup,
} from './watch'
