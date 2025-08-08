import { def, hasOwn, isObject, toRawType } from '@vue/shared'
import {
  mutableHandlers,
  readonlyHandlers,
  shallowReactiveHandlers,
  shallowReadonlyHandlers,
} from './baseHandlers'
import {
  mutableCollectionHandlers,
  readonlyCollectionHandlers,
  shallowCollectionHandlers,
  shallowReadonlyCollectionHandlers,
} from './collectionHandlers'
import type { RawSymbol, Ref, UnwrapRefSimple } from './ref'
import { ReactiveFlags } from './constants'
import { warn } from './warning'

export interface Target {
  // 响应式标志 渲染时是否跳过
  [ReactiveFlags.SKIP]?: boolean
  // 是否有响应式
  [ReactiveFlags.IS_REACTIVE]?: boolean
  // 是否为只读标志
  [ReactiveFlags.IS_READONLY]?: boolean
  // 是否为浅形的
  [ReactiveFlags.IS_SHALLOW]?: boolean
  // 是否为普通对象
  [ReactiveFlags.RAW]?: any
}
// weakmap对象
export const reactiveMap: WeakMap<Target, any> = new WeakMap<Target, any>()
// 浅层响应式对象
export const shallowReactiveMap: WeakMap<Target, any> = new WeakMap<
  Target,
  any
>()
// 只读
export const readonlyMap: WeakMap<Target, any> = new WeakMap<Target, any>()
// 浅层只读响应式对象
export const shallowReadonlyMap: WeakMap<Target, any> = new WeakMap<
  Target,
  any
>()
// 目标类型
enum TargetType {
  INVALID = 0, // 普通类型
  COMMON = 1, // 普通对象
  COLLECTION = 2, // 集合类型
}
// 判断目标类型
function targetTypeMap(rawType: string) {
  switch (rawType) {
    case 'Object':
    case 'Array':
      return TargetType.COMMON
    case 'Map':
    case 'Set':
    case 'WeakMap':
    case 'WeakSet':
      return TargetType.COLLECTION
    default:
      return TargetType.INVALID
  }
}
// 根据value获取目标类型
function getTargetType(value: Target) {
  return value[ReactiveFlags.SKIP] || !Object.isExtensible(value) // 对象是否可扩展
    ? TargetType.INVALID
    : targetTypeMap(toRawType(value))
}
// 如果T类型是Ref响应式类型的则为T否则为
// only unwrap nested ref
export type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRefSimple<T>
// 独有的reactive标记
declare const ReactiveMarkerSymbol: unique symbol
// 响应式标记
export interface ReactiveMarker {
  [ReactiveMarkerSymbol]?: void
}

export type Reactive<T> = UnwrapNestedRefs<T> &
  (T extends readonly any[] ? ReactiveMarker : {})

/**
 * Returns a reactive proxy of the object.
 *
 * The reactive conversion is "deep": it affects all nested properties. A
 * reactive object also deeply unwraps any properties that are refs while
 * maintaining reactivity.
 *
 * @example
 * ```js
 * const obj = reactive({ count: 0 })
 * ```
 *
 * @param target - The source object.
 * @see {@link https://vuejs.org/api/reactivity-core.html#reactive}
 */
export function reactive<T extends object>(target: T): Reactive<T>
// 响应式 传入一个目标值
export function reactive(target: object) {
  // if trying to observe a readonly proxy, return the readonly version.
  // 如果为只读的，则直接返回
  if (isReadonly(target)) {
    return target
  }
  // 否则去创建响应式对象
  return createReactiveObject(
    target,
    false,
    mutableHandlers,
    mutableCollectionHandlers,
    reactiveMap,
  )
}
// 浅层响应式标记
export declare const ShallowReactiveMarker: unique symbol

export type ShallowReactive<T> = T & { [ShallowReactiveMarker]?: true }

/**
 * Shallow version of {@link reactive}.
 *
 * Unlike {@link reactive}, there is no deep conversion: only root-level
 * properties are reactive for a shallow reactive object. Property values are
 * stored and exposed as-is - this also means properties with ref values will
 * not be automatically unwrapped.
 *
 * @example
 * ```js
 * const state = shallowReactive({
 *   foo: 1,
 *   nested: {
 *     bar: 2
 *   }
 * })
 *
 * // mutating state's own properties is reactive
 * state.foo++
 *
 * // ...but does not convert nested objects
 * isReactive(state.nested) // false
 *
 * // NOT reactive
 * state.nested.bar++
 * ```
 *
 * @param target - The source object.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#shallowreactive}
 */
// 浅层响应式对象创建 传入目标值
export function shallowReactive<T extends object>(
  target: T,
): ShallowReactive<T> {
  return createReactiveObject(
    target,
    false,
    shallowReactiveHandlers,
    shallowCollectionHandlers,
    shallowReactiveMap,
  )
}

type Primitive = string | number | boolean | bigint | symbol | undefined | null
export type Builtin = Primitive | Function | Date | Error | RegExp
export type DeepReadonly<T> = T extends Builtin
  ? T
  : T extends Map<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends ReadonlyMap<infer K, infer V>
      ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
      : T extends WeakMap<infer K, infer V>
        ? WeakMap<DeepReadonly<K>, DeepReadonly<V>>
        : T extends Set<infer U>
          ? ReadonlySet<DeepReadonly<U>>
          : T extends ReadonlySet<infer U>
            ? ReadonlySet<DeepReadonly<U>>
            : T extends WeakSet<infer U>
              ? WeakSet<DeepReadonly<U>>
              : T extends Promise<infer U>
                ? Promise<DeepReadonly<U>>
                : T extends Ref<infer U, unknown>
                  ? Readonly<Ref<DeepReadonly<U>>>
                  : T extends {}
                    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
                    : Readonly<T>

/**
 * Takes an object (reactive or plain) or a ref and returns a readonly proxy to
 * the original.
 *
 * A readonly proxy is deep: any nested property accessed will be readonly as
 * well. It also has the same ref-unwrapping behavior as {@link reactive},
 * except the unwrapped values will also be made readonly.
 *
 * @example
 * ```js
 * const original = reactive({ count: 0 })
 *
 * const copy = readonly(original)
 *
 * watchEffect(() => {
 *   // works for reactivity tracking
 *   console.log(copy.count)
 * })
 *
 * // mutating original will trigger watchers relying on the copy
 * original.count++
 *
 * // mutating the copy will fail and result in a warning
 * copy.count++ // warning!
 * ```
 *
 * @param target - The source object.
 * @see {@link https://vuejs.org/api/reactivity-core.html#readonly}
 */
// 只读响应式类型创建
export function readonly<T extends object>(
  target: T,
): DeepReadonly<UnwrapNestedRefs<T>> {
  return createReactiveObject(
    target,
    true,
    readonlyHandlers,
    readonlyCollectionHandlers,
    readonlyMap,
  )
}

/**
 * Shallow version of {@link readonly}.
 *
 * Unlike {@link readonly}, there is no deep conversion: only root-level
 * properties are made readonly. Property values are stored and exposed as-is -
 * this also means properties with ref values will not be automatically
 * unwrapped.
 *
 * @example
 * ```js
 * const state = shallowReadonly({
 *   foo: 1,
 *   nested: {
 *     bar: 2
 *   }
 * })
 *
 * // mutating state's own properties will fail
 * state.foo++
 *
 * // ...but works on nested objects
 * isReadonly(state.nested) // false
 *
 * // works
 * state.nested.bar++
 * ```
 *
 * @param target - The source object.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#shallowreadonly}
 */
// 浅层只读响应式
export function shallowReadonly<T extends object>(target: T): Readonly<T> {
  return createReactiveObject(
    target,
    true,
    shallowReadonlyHandlers,
    shallowReadonlyCollectionHandlers,
    shallowReadonlyMap,
  )
}
// 创建响应式对象
// 四个参数 是否为只读 拦截器们 集合拦截器们 响应式map
function createReactiveObject(
  target: Target,
  isReadonly: boolean,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>,
  proxyMap: WeakMap<Target, any>,
) {
  // 如果不是对象，并且在DEV环境下直接报提示 并返回该对象
  if (!isObject(target)) {
    if (__DEV__) {
      warn(
        `value cannot be made ${isReadonly ? 'readonly' : 'reactive'}: ${String(
          target,
        )}`,
      )
    }
    return target
  }
  // target is already a Proxy, return it.
  // exception: calling readonly() on a reactive object
  // 是否为普通对象并且不为只读类型并且还不是响应式对象
  if (
    target[ReactiveFlags.RAW] &&
    !(isReadonly && target[ReactiveFlags.IS_REACTIVE])
  ) {
    return target
  }
  // only specific value types can be observed.
  // 获取类型 如果为普通类型直接返回该对象
  const targetType = getTargetType(target)
  if (targetType === TargetType.INVALID) {
    return target
  }
  // target already has corresponding Proxy
  // 在proxy代理map中是否存在这个目标 如果存在直接返回这个存在的代理对象
  const existingProxy = proxyMap.get(target)
  if (existingProxy) {
    return existingProxy
  }
  // 否则直接创建代理对象
  const proxy = new Proxy(
    target,
    // 是否为集合类型如果为集合类型则使用集合拦截器 如果为普通对象则使用基础拦截器
    targetType === TargetType.COLLECTION ? collectionHandlers : baseHandlers,
  )
  // 并将这个对象存入proxyMap中
  proxyMap.set(target, proxy)
  // 最后返回这个proxy
  return proxy
}

/**
 * Checks if an object is a proxy created by {@link reactive} or
 * {@link shallowReactive} (or {@link ref} in some cases).
 *
 * @example
 * ```js
 * isReactive(reactive({}))            // => true
 * isReactive(readonly(reactive({})))  // => true
 * isReactive(ref({}).value)           // => true
 * isReactive(readonly(ref({})).value) // => true
 * isReactive(ref(true))               // => false
 * isReactive(shallowRef({}).value)    // => false
 * isReactive(shallowReactive({}))     // => true
 * ```
 *
 * @param value - The value to check.
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#isreactive}
 */
// 是否为reactive响应式对象
export function isReactive(value: unknown): boolean {
  // 是否为只读类型
  if (isReadonly(value)) {
    // 使用其中的普通对象再去进行判断
    return isReactive((value as Target)[ReactiveFlags.RAW])
  }
  // 是否有值并且还有is_reactive标识
  return !!(value && (value as Target)[ReactiveFlags.IS_REACTIVE])
}

/**
 * Checks whether the passed value is a readonly object. The properties of a
 * readonly object can change, but they can't be assigned directly via the
 * passed object.
 *
 * The proxies created by {@link readonly} and {@link shallowReadonly} are
 * both considered readonly, as is a computed ref without a set function.
 *
 * @param value - The value to check.
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#isreadonly}
 */
// 是否为只读类型
export function isReadonly(value: unknown): boolean {
  // 查看是否存在这个标识
  return !!(value && (value as Target)[ReactiveFlags.IS_READONLY])
}
// 是否为浅层类型
export function isShallow(value: unknown): boolean {
  return !!(value && (value as Target)[ReactiveFlags.IS_SHALLOW])
}

/**
 * Checks if an object is a proxy created by {@link reactive},
 * {@link readonly}, {@link shallowReactive} or {@link shallowReadonly}.
 *
 * @param value - The value to check.
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#isproxy}
 */
// 是否为代理对象 如果这个值存在并且有Raw标识
export function isProxy(value: any): boolean {
  return value ? !!value[ReactiveFlags.RAW] : false
}

/**
 * Returns the raw, original object of a Vue-created proxy.
 *
 * `toRaw()` can return the original object from proxies created by
 * {@link reactive}, {@link readonly}, {@link shallowReactive} or
 * {@link shallowReadonly}.
 *
 * This is an escape hatch that can be used to temporarily read without
 * incurring proxy access / tracking overhead or write without triggering
 * changes. It is **not** recommended to hold a persistent reference to the
 * original object. Use with caution.
 *
 * @example
 * ```js
 * const foo = {}
 * const reactiveFoo = reactive(foo)
 *
 * console.log(toRaw(reactiveFoo) === foo) // true
 * ```
 *
 * @param observed - The object for which the "raw" value is requested.
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#toraw}
 */
// 获取被代理的原始（非响应式）对象
export function toRaw<T>(observed: T): T {
  // 获取原始对象
  const raw = observed && (observed as Target)[ReactiveFlags.RAW]
  return raw ? toRaw(raw) : observed
}

export type Raw<T> = T & { [RawSymbol]?: true }

/**
 * Marks an object so that it will never be converted to a proxy. Returns the
 * object itself.
 *
 * @example
 * ```js
 * const foo = markRaw({})
 * console.log(isReactive(reactive(foo))) // false
 *
 * // also works when nested inside other reactive objects
 * const bar = reactive({ foo })
 * console.log(isReactive(bar.foo)) // false
 * ```
 *
 * **Warning:** `markRaw()` together with the shallow APIs such as
 * {@link shallowReactive} allow you to selectively opt-out of the default
 * deep reactive/readonly conversion and embed raw, non-proxied objects in your
 * state graph.
 *
 * @param value - The object to be marked as "raw".
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#markraw}
 */
// 标记为原始对象
export function markRaw<T extends object>(value: T): Raw<T> {
  if (!hasOwn(value, ReactiveFlags.SKIP) && Object.isExtensible(value)) {
    def(value, ReactiveFlags.SKIP, true)
  }
  return value
}

/**
 * Returns a reactive proxy of the given value (if possible).
 *
 * If the given value is not an object, the original value itself is returned.
 *
 * @param value - The value for which a reactive proxy shall be created.
 */
// 将目标值改为 reactive对象
export const toReactive = <T extends unknown>(value: T): T =>
  isObject(value) ? reactive(value) : value

/**
 * Returns a readonly proxy of the given value (if possible).
 *
 * If the given value is not an object, the original value itself is returned.
 *
 * @param value - The value for which a readonly proxy shall be created.
 */
// 将目标值改为readonly对象 只读
export const toReadonly = <T extends unknown>(value: T): DeepReadonly<T> =>
  isObject(value) ? readonly(value) : (value as DeepReadonly<T>)
