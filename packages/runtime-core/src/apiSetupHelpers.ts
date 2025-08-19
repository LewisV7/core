/**
 * Vue 3 核心模块 - Setup 辅助函数
 * 此文件包含用于 `<script setup>` 语法的编译器宏和运行时辅助函数，
 * 提供了声明属性、事件、暴露接口等功能。
 */
import {
  type IfAny,
  type LooseRequired,
  type Prettify,
  type UnionToIntersection,
  extend,
  isArray,
  isFunction,
  isPromise,
} from '@vue/shared'
import {
  type SetupContext,
  createSetupContext,
  getCurrentInstance,
  setCurrentInstance,
  unsetCurrentInstance,
} from './component'
import type { EmitFn, EmitsOptions, ObjectEmitsOptions } from './componentEmits'
import type {
  ComponentOptionsBase,
  ComponentOptionsMixin,
  ComputedOptions,
  MethodOptions,
} from './componentOptions'
import type {
  ComponentObjectPropsOptions,
  ComponentPropsOptions,
  ExtractPropTypes,
  PropOptions,
} from './componentProps'
import { warn } from './warning'
import type { SlotsType, StrictUnwrapSlotsType } from './componentSlots'
import type { Ref } from '@vue/reactivity'

/**
 * 开发环境下的运行时警告函数
 * @param method - 被错误调用的方法名
 */
// dev only
const warnRuntimeUsage = (method: string) =>
  warn(
    `${method}() is a compiler-hint helper that is only usable inside ` +
      `<script setup> of a single file component. Its arguments should be ` +
      `compiled away and passing it at runtime has no effect.`,
  )

/**
 * Vue `<script setup>` compiler macro for declaring component props. The
 * expected argument is the same as the component `props` option.
 *
 * Example runtime declaration:
 * ```js
 * // using Array syntax
 * const props = defineProps(['foo', 'bar'])
 * // using Object syntax
 * const props = defineProps({
 *   foo: String,
 *   bar: {
 *     type: Number,
 *     required: true
 *   }
 * })
 * ```
 *
 * Equivalent type-based declaration:
 * ```ts
 * // will be compiled into equivalent runtime declarations
 * const props = defineProps<{
 *   foo?: string
 *   bar: number
 * }>()
 * ```
 *
 * @see {@link https://vuejs.org/api/sfc-script-setup.html#defineprops-defineemits}
 *
 * This is only usable inside `<script setup>`, is compiled away in the
 * output and should **not** be actually called at runtime.
 */
// overload 1: runtime props w/ array
/**
 * Vue `<script setup>` 编译器宏，用于声明组件属性
 * 期望的参数与组件的 `props` 选项相同
 * @see {@link https://vuejs.org/api/sfc-script-setup.html#defineprops-defineemits}
 * @remarks 仅在 `<script setup>` 中可用，会在输出中被编译移除，运行时调用无效
 */
// 重载 1: 运行时 props - 数组形式

// 重载 2: 运行时 props - 对象形式

// 重载 3: 基于类型的声明
export function defineProps<PropNames extends string = string>(
  props: PropNames[],
): Prettify<Readonly<{ [key in PropNames]?: any }>>
// overload 2: runtime props w/ object
export function defineProps<
  PP extends ComponentObjectPropsOptions = ComponentObjectPropsOptions,
>(props: PP): Prettify<Readonly<ExtractPropTypes<PP>>>
// overload 3: typed-based declaration
export function defineProps<TypeProps>(): DefineProps<
  LooseRequired<TypeProps>,
  BooleanKey<TypeProps>
>
// implementation

// 实现
export function defineProps() {
  if (__DEV__) {
    warnRuntimeUsage(`defineProps`)
  }
  return null as any
}

/**
 * 定义组件属性的类型
 * @template T - 属性类型
 * @template BKeys - 布尔类型的属性键
 */
export type DefineProps<T, BKeys extends keyof T> = Readonly<T> & {
  readonly [K in BKeys]-?: boolean
}

/**
 * 提取类型中值为布尔类型的键
 * @template T - 源类型
 * @template K - 键类型
 */
type BooleanKey<T, K extends keyof T = keyof T> = K extends any
  ? [T[K]] extends [boolean | undefined]
    ? K
    : never
  : never

/**
 * Vue `<script setup>` compiler macro for declaring a component's emitted
 * events. The expected argument is the same as the component `emits` option.
 *
 * Example runtime declaration:
 * ```js
 * const emit = defineEmits(['change', 'update'])
 * ```
 *
 * Example type-based declaration:
 * ```ts
 * const emit = defineEmits<{
 *   // <eventName>: <expected arguments>
 *   change: []
 *   update: [value: number] // named tuple syntax
 * }>()
 *
 * emit('change')
 * emit('update', 1)
 * ```
 *
 * This is only usable inside `<script setup>`, is compiled away in the
 * output and should **not** be actually called at runtime.
 *
 * @see {@link https://vuejs.org/api/sfc-script-setup.html#defineprops-defineemits}
 */
// overload 1: runtime emits w/ array

// 重载 1: 运行时 emits - 数组形式

// 重载 2: 运行时 emits - 对象形式

// 重载 3: 基于类型的声明
export function defineEmits<EE extends string = string>(
  emitOptions: EE[],
): EmitFn<EE[]>
export function defineEmits<E extends EmitsOptions = EmitsOptions>(
  emitOptions: E,
): EmitFn<E>
export function defineEmits<T extends ComponentTypeEmits>(): T extends (
  ...args: any[]
) => any
  ? T
  : ShortEmits<T>
// implementation

// 实现
export function defineEmits() {
  if (__DEV__) {
    warnRuntimeUsage(`defineEmits`)
  }
  return null as any
}

/**
 * 组件 emits 类型
 */
export type ComponentTypeEmits = ((...args: any[]) => any) | Record<string, any>

/**
 * 将记录类型转换为联合类型
 * @template T - 记录类型
 */
type RecordToUnion<T extends Record<string, any>> = T[keyof T]

/**
 * 短格式 emits 类型
 * @template T - 记录类型
 */
type ShortEmits<T extends Record<string, any>> = UnionToIntersection<
  RecordToUnion<{
    [K in keyof T]: (evt: K, ...args: T[K]) => void
  }>
>

/**
 * Vue `<script setup>` compiler macro for declaring a component's exposed
 * instance properties when it is accessed by a parent component via template
 * refs.
 *
 * `<script setup>` components are closed by default - i.e. variables inside
 * the `<script setup>` scope is not exposed to parent unless explicitly exposed
 * via `defineExpose`.
 *
 * This is only usable inside `<script setup>`, is compiled away in the
 * output and should **not** be actually called at runtime.
 *
 * @see {@link https://vuejs.org/api/sfc-script-setup.html#defineexpose}
 */

// 实现
export function defineExpose<
  Exposed extends Record<string, any> = Record<string, any>,
>(exposed?: Exposed): void {
  if (__DEV__) {
    warnRuntimeUsage(`defineExpose`)
  }
}

/**
 * Vue `<script setup>` compiler macro for declaring a component's additional
 * options. This should be used only for options that cannot be expressed via
 * Composition API - e.g. `inheritAttrs`.
 *
 * @see {@link https://vuejs.org/api/sfc-script-setup.html#defineoptions}
 */

// 实现
export function defineOptions<
  RawBindings = {},
  D = {},
  C extends ComputedOptions = {},
  M extends MethodOptions = {},
  Mixin extends ComponentOptionsMixin = ComponentOptionsMixin,
  Extends extends ComponentOptionsMixin = ComponentOptionsMixin,
>(
  options?: ComponentOptionsBase<
    {},
    RawBindings,
    D,
    C,
    M,
    Mixin,
    Extends,
    {}
  > & {
    /**
     * props should be defined via defineProps().
     */
    props?: never
    /**
     * emits should be defined via defineEmits().
     */
    emits?: never
    /**
     * expose should be defined via defineExpose().
     */
    expose?: never
    /**
     * slots should be defined via defineSlots().
     */
    slots?: never
  },
): void {
  if (__DEV__) {
    warnRuntimeUsage(`defineOptions`)
  }
}

/**
 * Vue `<script setup>` 编译器宏，用于声明组件的插槽
 * @template S - 插槽类型
 * @returns 插槽对象
 * @remarks 仅在 `<script setup>` 中可用，会在输出中被编译移除，运行时调用无效
 */
export function defineSlots<
  S extends Record<string, any> = Record<string, any>,
>(): StrictUnwrapSlotsType<SlotsType<S>> {
  if (__DEV__) {
    warnRuntimeUsage(`defineSlots`)
  }
  return null as any
}

/**
 * 模型引用类型
 * @template T - 原始类型
 * @template M - 属性键类型
 * @template G - getter 返回类型
 * @template S - setter 参数类型
 */
export type ModelRef<T, M extends PropertyKey = string, G = T, S = T> = Ref<
  G,
  S
> &
  [ModelRef<T, M, G, S>, Record<M, true | undefined>]

/**
 * defineModel 选项类型
 * @template T - 原始类型
 * @template G - getter 返回类型
 * @template S - setter 参数类型
 */
export type DefineModelOptions<T = any, G = T, S = T> = {
  get?: (v: T) => G
  set?: (v: S) => any
}

/**
 * Vue `<script setup>` compiler macro for declaring a
 * two-way binding prop that can be consumed via `v-model` from the parent
 * component. This will declare a prop with the same name and a corresponding
 * `update:propName` event.
 *
 * If the first argument is a string, it will be used as the prop name;
 * Otherwise the prop name will default to "modelValue". In both cases, you
 * can also pass an additional object which will be used as the prop's options.
 *
 * The returned ref behaves differently depending on whether the parent
 * provided the corresponding v-model props or not:
 * - If yes, the returned ref's value will always be in sync with the parent
 *   prop.
 * - If not, the returned ref will behave like a normal local ref.
 *
 * @example
 * ```ts
 * // default model (consumed via `v-model`)
 * const modelValue = defineModel<string>()
 * modelValue.value = "hello"
 *
 * // default model with options
 * const modelValue = defineModel<string>({ required: true })
 *
 * // with specified name (consumed via `v-model:count`)
 * const count = defineModel<number>('count')
 * count.value++
 *
 * // with specified name and default value
 * const count = defineModel<number>('count', { default: 0 })
 * ```
 */

// 重载 1: 带选项的默认模型
/**
 * 声明一个双向绑定属性
 * @template T - 属性类型
 * @template M - 属性键类型
 * @template G - getter 返回类型
 * @template S - setter 参数类型
 * @param options - 模型选项
 * @returns 模型引用
 */

// 重载 2: 可选的默认模型
/**
 * 声明一个双向绑定属性
 * @template T - 属性类型
 * @template M - 属性键类型
 * @template G - getter 返回类型
 * @template S - setter 参数类型
 * @param options - 模型选项
 * @returns 模型引用
 */

// 重载 3: 带名称和选项的必填模型
/**
 * 声明一个双向绑定属性
 * @template T - 属性类型
 * @template M - 属性键类型
 * @template G - getter 返回类型
 * @template S - setter 参数类型
 * @param name - 属性名称
 * @param options - 模型选项
 * @returns 模型引用
 */

// 重载 4: 带名称的可选模型
/**
 * 声明一个双向绑定属性
 * @template T - 属性类型
 * @template M - 属性键类型
 * @template G - getter 返回类型
 * @template S - setter 参数类型
 * @param name - 属性名称
 * @param options - 模型选项
 * @returns 模型引用
 */
export function defineModel<T, M extends PropertyKey = string, G = T, S = T>(
  options: ({ default: any } | { required: true }) &
    PropOptions<T> &
    DefineModelOptions<T, G, S>,
): ModelRef<T, M, G, S>

export function defineModel<T, M extends PropertyKey = string, G = T, S = T>(
  options?: PropOptions<T> & DefineModelOptions<T, G, S>,
): ModelRef<T | undefined, M, G | undefined, S | undefined>

export function defineModel<T, M extends PropertyKey = string, G = T, S = T>(
  name: string,
  options: ({ default: any } | { required: true }) &
    PropOptions<T> &
    DefineModelOptions<T, G, S>,
): ModelRef<T, M, G, S>

export function defineModel<T, M extends PropertyKey = string, G = T, S = T>(
  name: string,
  options?: PropOptions<T> & DefineModelOptions<T, G, S>,
): ModelRef<T | undefined, M, G | undefined, S | undefined>


// 实现
export function defineModel(): any {
  if (__DEV__) {
    warnRuntimeUsage('defineModel')
  }
}

/**
 * 排除 undefined 类型
 * @template T - 源类型
 */
type NotUndefined<T> = T extends undefined ? never : T
/**
 * 映射并省略指定键的类型
 * @template T - 源类型
 * @template K - 要省略的键
 */
type MappedOmit<T, K extends keyof any> = {
  [P in keyof T as P extends K ? never : P]: T[P]
}

/**
 * 推断默认值类型
 * @template T - 源类型
 */
type InferDefaults<T> = {
  [K in keyof T]?: InferDefault<T, T[K]>
}

/**
 * JavaScript 原生类型
 */
type NativeType = null | number | string | boolean | symbol | Function

/**
 * 推断默认值的类型
 * @template P - 属性类型
 * @template T - 值类型
 */
type InferDefault<P, T> =
  | ((props: P) => T & {})
  | (T extends NativeType ? T : never)

/**
 * 带默认值的属性类型
 * @template T - 原始属性类型
 * @template Defaults - 默认值类型
 * @template BKeys - 布尔类型的属性键
 */
type PropsWithDefaults<
  T,
  Defaults extends InferDefaults<T>,
  BKeys extends keyof T,
> = T extends unknown
  ? Readonly<MappedOmit<T, keyof Defaults>> & {
      readonly [K in keyof Defaults as K extends keyof T
        ? K
        : never]-?: K extends keyof T
        ? Defaults[K] extends undefined
          ? IfAny<Defaults[K], NotUndefined<T[K]>, T[K]>
          : NotUndefined<T[K]>
        : never
    } & {
      readonly [K in BKeys]-?: K extends keyof Defaults
        ? Defaults[K] extends undefined
          ? boolean | undefined
          : boolean
        : boolean
    }
  : never

/**
 * Vue `<script setup>` compiler macro for providing props default values when
 * using type-based `defineProps` declaration.
 *
 * Example usage:
 * ```ts
 * withDefaults(defineProps<{
 *   size?: number
 *   labels?: string[]
 * }>(), {
 *   size: 3,
 *   labels: () => ['default label']
 * })
 * ```
 *
 * This is only usable inside `<script setup>`, is compiled away in the output
 * and should **not** be actually called at runtime.
 *
 * @see {@link https://vuejs.org/guide/typescript/composition-api.html#typing-component-props}
 */

// 实现
export function withDefaults<
  T,
  BKeys extends keyof T,
  Defaults extends InferDefaults<T>,
>(
  props: DefineProps<T, BKeys>,
  defaults: Defaults,
): PropsWithDefaults<T, Defaults, BKeys> {
  if (__DEV__) {
    warnRuntimeUsage(`withDefaults`)
  }
  return null as any
}

/**
 * 获取插槽上下文
 * @returns 插槽对象
 */
export function useSlots(): SetupContext['slots'] {
  return getContext('useSlots').slots
}

/**
 * 获取属性上下文
 * @returns 属性对象
 */
export function useAttrs(): SetupContext['attrs'] {
  return getContext('useAttrs').attrs
}

/**
 * 获取当前组件的上下文
 * @param calledFunctionName - 调用此函数的函数名
 * @returns 组件上下文
 */
function getContext(calledFunctionName: string): SetupContext {
  const i = getCurrentInstance()!
  if (__DEV__ && !i) {
    warn(`${calledFunctionName}() called without active instance.`)
  }
  return i.setupContext || (i.setupContext = createSetupContext(i))
}

/**
 * @internal
 */

// 实现
export function normalizePropsOrEmits(
  props: ComponentPropsOptions | EmitsOptions,
): ComponentObjectPropsOptions | ObjectEmitsOptions {
  return isArray(props)
    ? props.reduce(
        (normalized, p) => ((normalized[p] = null), normalized),
        {} as ComponentObjectPropsOptions | ObjectEmitsOptions,
      )
    : props
}

/**
 * Runtime helper for merging default declarations. Imported by compiled code
 * only.
 * @internal
 */

// 实现
export function mergeDefaults(
  raw: ComponentPropsOptions,
  defaults: Record<string, any>,
): ComponentObjectPropsOptions {
  const props = normalizePropsOrEmits(raw)
  for (const key in defaults) {
    if (key.startsWith('__skip')) continue
    let opt = props[key]
    if (opt) {
      if (isArray(opt) || isFunction(opt)) {
        opt = props[key] = { type: opt, default: defaults[key] }
      } else {
        opt.default = defaults[key]
      }
    } else if (opt === null) {
      opt = props[key] = { default: defaults[key] }
    } else if (__DEV__) {
      warn(`props default key "${key}" has no corresponding declaration.`)
    }
    if (opt && defaults[`__skip_${key}`]) {
      opt.skipFactory = true
    }
  }
  return props
}

/**
 * Runtime helper for merging model declarations.
 * Imported by compiled code only.
 * @internal
 */

// 实现
export function mergeModels(
  a: ComponentPropsOptions | EmitsOptions,
  b: ComponentPropsOptions | EmitsOptions,
): ComponentPropsOptions | EmitsOptions {
  if (!a || !b) return a || b
  if (isArray(a) && isArray(b)) return a.concat(b)
  return extend({}, normalizePropsOrEmits(a), normalizePropsOrEmits(b))
}

/**
 * Used to create a proxy for the rest element when destructuring props with
 * defineProps().
 * @internal
 */

// 实现
export function createPropsRestProxy(
  props: any,
  excludedKeys: string[],
): Record<string, any> {
  const ret: Record<string, any> = {}
  for (const key in props) {
    if (!excludedKeys.includes(key)) {
      Object.defineProperty(ret, key, {
        enumerable: true,
        get: () => props[key],
      })
    }
  }
  return ret
}

/**
 * `<script setup>` helper for persisting the current instance context over
 * async/await flows.
 *
 * `@vue/compiler-sfc` converts the following:
 *
 * ```ts
 * const x = await foo()
 * ```
 *
 * into:
 *
 * ```ts
 * let __temp, __restore
 * const x = (([__temp, __restore] = withAsyncContext(() => foo())),__temp=await __temp,__restore(),__temp)
 * ```
 * @internal
 */

// 实现
export function withAsyncContext(getAwaitable: () => any): [any, () => void] {
  const ctx = getCurrentInstance()!
  if (__DEV__ && !ctx) {
    warn(
      `withAsyncContext called without active current instance. ` +
        `This is likely a bug.`,
    )
  }
  let awaitable = getAwaitable()
  unsetCurrentInstance()
  if (isPromise(awaitable)) {
    awaitable = awaitable.catch(e => {
      setCurrentInstance(ctx)
      throw e
    })
  }
  return [awaitable, () => setCurrentInstance(ctx)]
}
