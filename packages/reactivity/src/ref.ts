/**
 * Vue 响应式系统中的 Ref 实现
 * 该文件定义了 Ref 接口及其相关 API，用于创建可以响应式变化的引用类型
 * Ref 是 Vue 响应式系统的核心组成部分，允许基本类型值也能成为响应式的
 */
import {
  type IfAny,          // 条件类型工具，如果是 any 类型则返回指定类型
  hasChanged,          // 检查两个值是否有变化
  isArray,             // 检查是否为数组
  isFunction,          // 检查是否为函数
  isObject,            // 检查是否为对象
} from '@vue/shared'   // Vue 共享工具函数库
import { Dep, getDepFromReactive } from './dep'  // 依赖追踪相关功能
import {
  type Builtin,                  // 内置类型
  type ShallowReactiveMarker,    // 浅层响应式标记类型
  isProxy,                       // 检查是否为代理对象
  isReactive,                    // 检查是否为响应式对象
  isReadonly,                    // 检查是否为只读对象
  isShallow,                     // 检查是否为浅层响应式
  toRaw,                         // 获取原始对象
  toReactive,                    // 转换为响应式对象
} from './reactive'              // 响应式系统核心实现
import type { ComputedRef, WritableComputedRef } from './computed'  // 计算属性相关类型
import { ReactiveFlags, TrackOpTypes, TriggerOpTypes } from './constants'  // 响应式系统常量
import { warn } from './warning'  // 警告工具函数

/**
 * Ref 类型的唯一标识符
 * 用于在类型系统中区分 Ref 类型与其他类型
 */
declare const RefSymbol: unique symbol
/**
 * 原始值的唯一标识符
 * 用于标记对象的原始值
 */
export declare const RawSymbol: unique symbol

/**
 * 响应式引用接口
 * 用于包装基本类型值或对象，使其成为响应式的
 * 
 * @template T - 值的类型
 * @template S - 可设置的值的类型
 */
export interface Ref<T = any, S = T> {
  /**
   * 获取引用的值
   */
  get value(): T
  
  /**
   * 设置引用的值
   */
  set value(_: S)
  
  /**
   * 类型区分符
   * 仅用于类型系统区分Ref类型，不会出现在IDE自动补全中
   */
  [RefSymbol]: true
}

/**
 * 检查一个值是否是Ref对象
 * 
 * @param r - 要检查的值
 * @returns 如果是Ref对象则返回true，否则返回false
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#isref}
 */
export function isRef<T>(r: Ref<T> | unknown): r is Ref<T>
export function isRef(r: any): r is Ref {
    return r ? r[ReactiveFlags.IS_REF] === true : false
  }

/**
 * 创建一个响应式的引用对象
 * 将一个内部值转换为响应式的、可变的ref对象
 * 该对象有一个单一属性`.value`指向内部值
 * 
 * @param value - 要包装的内部值
 * @returns 新创建的ref对象
 * @see {@link https://vuejs.org/api/reactivity-core.html#ref}
 */
export function ref<T>(
  value: T,
): [T] extends [Ref] ? IfAny<T, Ref<T>, T> : Ref<UnwrapRef<T>, UnwrapRef<T> | T>
export function ref<T = any>(): Ref<T | undefined>
export function ref(value?: unknown) {
  // 创建ref对象
  return createRef(value, false)
}

/**
 * 浅层Ref的唯一标识符
 * 用于在类型系统中区分浅层Ref与普通Ref
 */
declare const ShallowRefMarker: unique symbol

/**
 * 浅层响应式引用类型
 * 与普通Ref不同，浅层Ref不会递归地将对象转换为响应式
 * 
 * @template T - 值的类型
 * @template S - 可设置的值的类型
 */
export type ShallowRef<T = any, S = T> = Ref<T, S> & {
  [ShallowRefMarker]?: true
}

/**
 * 创建一个浅层响应式的引用对象
 * 与ref不同，shallowRef不会递归地将对象转换为响应式
 * 只有替换整个.value时才会触发更新
 * 
 * @example
 * ```js
 * const state = shallowRef({ count: 1 })
 * 
 * // 不会触发更新
 * state.value.count = 2
 * 
 * // 会触发更新
 * state.value = { count: 2 }
 * ```
 * 
 * @param value - 浅层ref的内部值
 * @returns 新创建的浅层ref对象
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#shallowref}
 */
export function shallowRef<T>(
  value: T,
): Ref extends T
  ? T extends Ref
    ? IfAny<T, ShallowRef<T>, T>
    : ShallowRef<T>
  : ShallowRef<T>
export function shallowRef<T = any>(): ShallowRef<T | undefined>
export function shallowRef(value?: unknown) {
  return createRef(value, true)
}
/**
 * 创建Ref对象的内部函数
 * 根据传入的参数决定是创建普通Ref还是浅层Ref
 * 
 * @param rawValue - 原始值
 * @param shallow - 是否为浅层Ref
 * @returns 创建的Ref对象
 */
function createRef(rawValue: unknown, shallow: boolean) {
  // 如果是ref对象 直接返回这个对象 否则就new RefImpl对象 
  if (isRef(rawValue)) {
    return rawValue
  }
  return new RefImpl(rawValue, shallow)
}

/**
 * Ref接口的具体实现类
 * 负责管理响应式引用的值和依赖追踪
 * 
 * @internal
 * @template T - 值的类型
 */
class RefImpl<T = any> {
  /**
   * 存储经过处理的值
   * 对于普通Ref，这是响应式的值；对于浅层Ref，这是原始值
   */
  _value: T
  
  /**
   * 存储原始值
   * 用于比较值是否变化
   */
  private _rawValue: T
  
  /**
   * 依赖对象
   * 用于追踪哪些副作用函数依赖此Ref
   */
  dep: Dep = new Dep()
  
  /**
   * 标记是否为Ref对象
   */
  public readonly [ReactiveFlags.IS_REF] = true
  
  /**
   * 标记是否为浅层Ref
   */
  public readonly [ReactiveFlags.IS_SHALLOW]: boolean = false
  
  /**
   * 构造函数
   * 
   * @param value - 初始值
   * @param isShallow - 是否为浅层Ref
   */
  constructor(value: T, isShallow: boolean) {
    // 存储原始值：如果是浅层Ref则直接使用传入的值，否则获取其原始值
    this._rawValue = isShallow ? value : toRaw(value)
    // 存储处理后的值：如果是浅层Ref则直接使用传入的值，否则转换为响应式
    this._value = isShallow ? value : toReactive(value)
    // 设置是否为浅层Ref的标记
    this[ReactiveFlags.IS_SHALLOW] = isShallow
  }

  /**
   * 获取引用的值
   * 同时触发依赖追踪
   * 
   * @returns 引用的值
   */
  get value() {
    // 开发环境下，触发带有详细信息的依赖追踪
    if (__DEV__) {
      this.dep.track({
        target: this,
        type: TrackOpTypes.GET,
        key: 'value',
      })
    } else {
      // 生产环境下，简化的依赖追踪
      this.dep.track()
    }
    return this._value
  }
  /**
   * 设置引用的值
   * 如果值发生变化，触发依赖更新
   * 
   * @param newValue - 新值
   */
  set value(newValue) {
    const oldValue = this._rawValue
    // 判断是否直接使用新值（不进行响应式转换）
    const useDirectValue =
      this[ReactiveFlags.IS_SHALLOW] ||  // 如果是浅层Ref
      isShallow(newValue) ||             // 如果新值已经是浅层响应式
      isReadonly(newValue)               // 如果新值是只读的
      // 如果为浅层对象或只读对象直接返回新值 否则就调用toRaw函数 获取被代理的原始对象
    newValue = useDirectValue ? newValue : toRaw(newValue)
    // 如果新的值和旧的值发生变化了
    if (hasChanged(newValue, oldValue)) {
      // 将新增赋值给原始对象
      this._rawValue = newValue
      // 判断是否只读和浅层根据其结果返回响应式还是原值
      this._value = useDirectValue ? newValue : toReactive(newValue)
      // 调用trigger函数
      if (__DEV__) {
        this.dep.trigger({
          target: this,
          type: TriggerOpTypes.SET,
          key: 'value',
          newValue,
          oldValue,
        })
      } else {
        this.dep.trigger()
      }
    }
  }
}

/**
 * 强制触发依赖于浅层ref的副作用函数
 * 通常在对浅层ref的内部值进行深度修改后使用
 *
 * @example
 * ```js
 * const shallow = shallowRef({
 *   greet: 'Hello, world'
 * })
 *
 * // 首次运行时会记录 "Hello, world"
 * watchEffect(() => {
 *   console.log(shallow.value.greet)
 * })
 *
 * // 这不会触发副作用，因为ref是浅层的
 * shallow.value.greet = 'Hello, universe'
 *
 * // 记录 "Hello, universe"
 * triggerRef(shallow)
 * ```
 *
 * @param ref - 要执行其关联副作用的ref
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#triggerref}
 */
/**
 * 强制触发依赖于浅层ref的副作用函数
 * 通常在对浅层ref的内部值进行深度修改后使用
 * 
 * @param ref - 要执行其关联副作用的ref
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#triggerref}
 */
export function triggerRef(ref: Ref): void {
  // ref可能是ObjectRefImpl的实例
  // 检查ref是否有依赖对象
  if ((ref as unknown as RefImpl).dep) {
      if (__DEV__) {
        // 开发环境下，触发带有详细信息的依赖更新
        ;(ref as unknown as RefImpl).dep.trigger({
          target: ref,
          type: TriggerOpTypes.SET,
          key: 'value',
          newValue: (ref as unknown as RefImpl)._value,
        })
      } else {
        // 生产环境下，简化的依赖更新
        ;(ref as unknown as RefImpl).dep.trigger()
      }
  }
}

/**
 * 可能是Ref或普通值的类型
 * 
 * @template T - 值的类型
 */
export type MaybeRef<T = any> =
  | T
  | Ref<T>
  | ShallowRef<T>
  | WritableComputedRef<T>

/**
 * 可能是Ref、计算属性或 getter 函数的类型
 * 
 * @template T - 值的类型
 */
export type MaybeRefOrGetter<T = any> = MaybeRef<T> | ComputedRef<T> | (() => T)

/**
 * 如果参数是ref，则返回其内部值，否则返回参数本身
 * 这是一个语法糖函数，等价于 `val = isRef(val) ? val.value : val`
 * 
 * @example
 * ```js
 * function useFoo(x: number | Ref<number>) {
 *   const unwrapped = unref(x)
 *   // unwrapped 现在保证是number类型
 * }
 * ```
 * 
 * @param ref - 要解包的ref或普通值
 * @returns 解包后的值
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#unref}
 */
export function unref<T>(ref: MaybeRef<T> | ComputedRef<T>): T {
  return isRef(ref) ? ref.value : ref
}

/**
 * 将值/refs/getter函数标准化为值
 * 与{@link unref}类似，但它还能标准化getter函数
 * 如果参数是getter函数，它将被调用并返回其返回值
 * 
 * @example
 * ```js
 * toValue(1) // 1
 * toValue(ref(1)) // 1
 * toValue(() => 1) // 1
 * ```
 * 
 * @param source - getter函数、已存在的ref或非函数值
 * @returns 标准化后的值
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#tovalue}
 */
export function toValue<T>(source: MaybeRefOrGetter<T>): T {
  return isFunction(source) ? source() : unref(source)
}
/**
 * 浅层解包处理器
 * 用于创建一个代理，该代理会浅层解包 refs 属性
 */
const shallowUnwrapHandlers: ProxyHandler<any> = {
  /**
   * getter 处理器
   * 如果访问的是原始值标识，则返回目标对象本身
   * 否则对获取的值进行解包
   */
  get: (target, key, receiver) =>
    key === ReactiveFlags.RAW
      ? target
      : unref(Reflect.get(target, key, receiver)),
  /**
   * setter 处理器
   * 如果设置的属性是ref，并且新值不是ref，则更新ref的值
   * 否则直接设置属性
   */
  set: (target, key, value, receiver) => {
    const oldValue = target[key]
    if (isRef(oldValue) && !isRef(value)) {
      oldValue.value = value
      return true
    } else {
      return Reflect.set(target, key, value, receiver)
    }
  },
}

/**
 * 返回一个代理对象，该对象会浅层解包包含refs的属性
 * 如果对象已经是响应式的，则原样返回
 * 否则，创建一个新的响应式代理
 * 
 * @param objectWithRefs - 已经是响应式的对象或包含refs的简单对象
 * @returns 带有浅层解包refs功能的代理对象
 */
export function proxyRefs<T extends object>(
  objectWithRefs: T,
): ShallowUnwrapRef<T> {
  // 判断是否为响应式对象：如果是则直接返回，否则创建新的代理
  return isReactive(objectWithRefs)
    ? objectWithRefs
    : new Proxy(objectWithRefs, shallowUnwrapHandlers)
}
/**
 * 自定义ref工厂函数类型
 * 
 * @template T - ref的值类型
 */
export type CustomRefFactory<T> = (
  track: () => void,
  trigger: () => void,
) => {
  get: () => T
  set: (value: T) => void
}

/**
 * 自定义Ref实现类
 * 用于创建具有自定义依赖追踪和更新触发逻辑的ref
 * 
 * @template T - 值的类型
 */
class CustomRefImpl<T> {
  /**
   * 依赖对象
   * 用于追踪哪些副作用函数依赖此ref
   */
  public dep: Dep

  /**
   * 自定义getter函数
   */
  private readonly _get: ReturnType<CustomRefFactory<T>>['get']
  
  /**
   * 自定义setter函数
   */
  private readonly _set: ReturnType<CustomRefFactory<T>>['set']

  /**
   * 标记是否为Ref对象
   */
  public readonly [ReactiveFlags.IS_REF] = true

  /**
   * 缓存的值
   */
  public _value: T = undefined!

  /**
   * 构造函数
   * 
   * @param factory - 自定义ref工厂函数
   */
  constructor(factory: CustomRefFactory<T>) {
    const dep = (this.dep = new Dep())
    // 调用工厂函数获取自定义的getter和setter
    const { get, set } = factory(dep.track.bind(dep), dep.trigger.bind(dep))
    this._get = get
    this._set = set
  }

  /**
   * 获取引用的值
   * 调用自定义的getter函数
   * 
   * @returns 引用的值
   */
  get value() {
    return (this._value = this._get())
  }

  /**
   * 设置引用的值
   * 调用自定义的setter函数
   * 
   * @param newVal - 新值
   */
  set value(newVal) {
    this._set(newVal)
  }
}

/**
 * 创建一个自定义的ref，具有对依赖追踪和更新触发的显式控制
 * 
 * @param factory - 接收`track`和`trigger`回调的函数
 * @returns 新创建的自定义ref对象
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#customref}
 */
export function customRef<T>(factory: CustomRefFactory<T>): Ref<T> {
  return new CustomRefImpl(factory) as any
}

/**
 * 将响应式对象转换为refs对象的类型
 * 每个属性都是对应的ref
 * 
 * @template T - 原始对象类型
 */
export type ToRefs<T = any> = {
  [K in keyof T]: ToRef<T[K]>
}

/**
 * 将响应式对象转换为普通对象，其中每个属性都是指向原始对象对应属性的ref
 * 每个ref都是使用{@link toRef}创建的
 * 
 * @param object - 要转换为refs对象的响应式对象
 * @returns 包含refs的普通对象
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#torefs}
 */
export function toRefs<T extends object>(object: T): ToRefs<T> {
  // 开发环境下，警告如果传入的不是代理对象
  if (__DEV__ && !isProxy(object)) {
    warn(`toRefs() 期望接收一个响应式对象，但收到了一个普通对象。`)
  }
  // 根据输入对象类型创建返回值：数组创建数组，否则创建普通对象
  const ret: any = isArray(object) ? new Array(object.length) : {}
  // 遍历对象的所有属性，为每个属性创建ref
  for (const key in object) {
    ret[key] = propertyToRef(object, key)
  }
  return ret
}
/**
 * 对象属性ref实现类
 * 用于创建指向对象特定属性的ref
 * 
 * @template T - 对象类型
 * @template K - 属性键类型
 */
class ObjectRefImpl<T extends object, K extends keyof T> {
  public readonly [ReactiveFlags.IS_REF] = true
  public _value: T[K] = undefined!

  constructor(
    private readonly _object: T,
    private readonly _key: K,
    private readonly _defaultValue?: T[K],
  ) {}

  get value() {
    const val = this._object[this._key]
    return (this._value = val === undefined ? this._defaultValue! : val)
  }

  set value(newVal) {
    this._object[this._key] = newVal
  }

  get dep(): Dep | undefined {
    return getDepFromReactive(toRaw(this._object), this._key)
  }
}
  /**
 * Getter ref实现类
 * 用于创建基于getter函数的只读ref
 * 
 * @template T - 值的类型
 */
class GetterRefImpl<T> {
  public readonly [ReactiveFlags.IS_REF] = true
  public readonly [ReactiveFlags.IS_READONLY] = true
  public _value: T = undefined!

  constructor(private readonly _getter: () => T) {}
  get value() {
    return (this._value = this._getter())
  }
}

export type ToRef<T> = IfAny<T, Ref<T>, [T] extends [Ref] ? T : Ref<T>>

/**
 * 用于将值/refs/getter函数标准化为refs
 * 
 * @example
 * ```js
 * // 原样返回已存在的refs
 * toRef(existingRef)
 * 
 * // 创建一个在.value访问时调用getter的ref
 * toRef(() => props.foo)
 * 
 * // 从非函数值创建普通refs
 * // 等价于 ref(1)
 * toRef(1)
 * ```
 * 
 * 也可以用于为源响应式对象的属性创建ref
 * 创建的ref与源属性同步：修改源属性会更新ref，反之亦然
 * 
 * @example
 * ```js
 * const state = reactive({
 *   foo: 1,
 *   bar: 2
 * })
 * 
 * const fooRef = toRef(state, 'foo')
 * 
 * // 修改ref会更新原始对象
 * fooRef.value++
 * console.log(state.foo) // 2
 * 
 * // 修改原始对象也会更新ref
 * state.foo++
 * console.log(fooRef.value) // 3
 * ```
 * 
 * @param source - getter函数、已存在的ref、非函数值或用于创建属性ref的响应式对象
 * @param [key] - (可选) 响应式对象中的属性名称
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#toref}
 */
export function toRef<T>(
  value: T,
): T extends () => infer R
  ? Readonly<Ref<R>>
  : T extends Ref
    ? T
    : Ref<UnwrapRef<T>>
export function toRef<T extends object, K extends keyof T>(
  object: T,
  key: K,
): ToRef<T[K]>
export function toRef<T extends object, K extends keyof T>(
  object: T,
  key: K,
  defaultValue: T[K],
): ToRef<Exclude<T[K], undefined>>
/**
 * toRef函数的实现
 * 根据输入参数类型创建相应的ref
 * 
 * @param source - getter函数、已存在的ref、非函数值或响应式对象
 * @param key - 响应式对象中的属性名称（可选）
 * @param defaultValue - 属性的默认值（可选）
 * @returns 创建的ref对象
 */
export function toRef(
  source: Record<string, any> | MaybeRef,
  key?: string,
  defaultValue?: unknown,
): Ref {
  if (isRef(source)) {
    // 如果已经是ref，则直接返回
    return source
  } else if (isFunction(source)) {
    // 如果是函数，则创建GetterRefImpl
    return new GetterRefImpl(source) as any
  } else if (isObject(source) && arguments.length > 1) {
    // 如果是对象且提供了key，则创建属性ref
    return propertyToRef(source, key!, defaultValue)
  } else {
    // 其他情况，创建普通ref
    return ref(source)
  }
}
// 如果为ref对象
function propertyToRef(
  source: Record<string, any>,
  key: string,
  defaultValue?: unknown,
) {
  const val = source[key]
  return isRef(val)
    ? val
    : (new ObjectRefImpl(source, key, defaultValue) as any)
}

/**
 * This is a special exported interface for other packages to declare
 * additional types that should bail out for ref unwrapping. For example
 * \@vue/runtime-dom can declare it like so in its d.ts:
 *
 * ``` ts
 * declare module '@vue/reactivity' {
 *   export interface RefUnwrapBailTypes {
 *     runtimeDOMBailTypes: Node | Window
 *   }
 * }
 * ```
 */
export interface RefUnwrapBailTypes {}

export type ShallowUnwrapRef<T> = {
  [K in keyof T]: DistributeRef<T[K]>
}

type DistributeRef<T> = T extends Ref<infer V, unknown> ? V : T

export type UnwrapRef<T> =
  T extends ShallowRef<infer V, unknown>
    ? V
    : T extends Ref<infer V, unknown>
      ? UnwrapRefSimple<V>
      : UnwrapRefSimple<T>

export type UnwrapRefSimple<T> = T extends
  | Builtin
  | Ref
  | RefUnwrapBailTypes[keyof RefUnwrapBailTypes]
  | { [RawSymbol]?: true }
  ? T
  : T extends Map<infer K, infer V>
    ? Map<K, UnwrapRefSimple<V>> & UnwrapRef<Omit<T, keyof Map<any, any>>>
    : T extends WeakMap<infer K, infer V>
      ? WeakMap<K, UnwrapRefSimple<V>> &
          UnwrapRef<Omit<T, keyof WeakMap<any, any>>>
      : T extends Set<infer V>
        ? Set<UnwrapRefSimple<V>> & UnwrapRef<Omit<T, keyof Set<any>>>
        : T extends WeakSet<infer V>
          ? WeakSet<UnwrapRefSimple<V>> & UnwrapRef<Omit<T, keyof WeakSet<any>>>
          : T extends ReadonlyArray<any>
            ? { [K in keyof T]: UnwrapRefSimple<T[K]> }
            : T extends object & { [ShallowReactiveMarker]?: never }
              ? {
                  [P in keyof T]: P extends symbol ? T[P] : UnwrapRef<T[P]>
                }
              : T
