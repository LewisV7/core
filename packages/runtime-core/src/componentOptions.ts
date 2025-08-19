/**
 * 组件选项处理
 * 此文件包含Vue组件选项的类型定义、工具函数和处理逻辑
 * 负责组件属性、生命周期钩子、事件等选项的规范化和处理
 */
import {
  type Component,
  type ComponentInternalInstance,
  type ComponentInternalOptions,
  type ConcreteComponent,
  type Data,
  type InternalRenderFunction,
  type SetupContext,
  currentInstance,
} from './component'
import {
  type LooseRequired,
  NOOP,
  type Prettify,
  extend,
  isArray,
  isFunction,
  isObject,
  isPromise,
  isString,
} from '@vue/shared'
import { type Ref, getCurrentScope, isRef, traverse } from '@vue/reactivity'
import { computed } from './apiComputed'
import {
  type WatchCallback,
  type WatchOptions,
  createPathGetter,
  watch,
} from './apiWatch'
import { inject, provide } from './apiInject'
import {
  type DebuggerHook,
  type ErrorCapturedHook,
  onActivated,
  onBeforeMount,
  onBeforeUnmount,
  onBeforeUpdate,
  onDeactivated,
  onErrorCaptured,
  onMounted,
  onRenderTracked,
  onRenderTriggered,
  onServerPrefetch,
  onUnmounted,
  onUpdated,
} from './apiLifecycle'
import {
  type ComputedGetter,
  type WritableComputedOptions,
  reactive,
} from '@vue/reactivity'
import type {
  ComponentObjectPropsOptions,
  ComponentPropsOptions,
  ExtractDefaultPropTypes,
  ExtractPropTypes,
} from './componentProps'
import type {
  EmitsOptions,
  EmitsToProps,
  TypeEmitsToOptions,
} from './componentEmits'
import type { Directive } from './directives'
import {
  type ComponentPublicInstance,
  type CreateComponentPublicInstanceWithMixins,
  type IntersectionMixin,
  type UnwrapMixinsType,
  isReservedPrefix,
} from './componentPublicInstance'
import { warn } from './warning'
import type { VNodeChild } from './vnode'
import { callWithAsyncErrorHandling } from './errorHandling'
import { deepMergeData } from './compat/data'
import { DeprecationTypes, checkCompatEnabled } from './compat/compatConfig'
import {
  type CompatConfig,
  isCompatEnabled,
  softAssertCompatEnabled,
} from './compat/compatConfig'
import type { OptionMergeFunction } from './apiCreateApp'
import { LifecycleHooks } from './enums'
import type { SlotsType } from './componentSlots'
import {
  type ComponentTypeEmits,
  normalizePropsOrEmits,
} from './apiSetupHelpers'
import { markAsyncBoundary } from './helpers/useId'

/**
 * 自定义组件选项接口
 * 用于声明组件的自定义选项，可以通过模块扩展来添加新的选项
 *
 * @example
 * ```ts
 * declare module 'vue' {
 *   interface ComponentCustomOptions {
 *     beforeRouteUpdate?(
 *       to: Route,
 *       from: Route,
 *       next: () => void
 *     ): void
 *   }
 * }
 * ```
 */
export interface ComponentCustomOptions {}

/**
 * 渲染函数类型
 * 组件渲染函数，返回虚拟DOM节点
 */
export type RenderFunction = () => VNodeChild

/**
 * 组件选项基础接口
 * 定义了组件的核心选项和类型参数
 *
 * @template Props - 组件属性类型
 * @template RawBindings - setup函数返回的绑定类型
 * @template D - 组件数据类型
 * @template C - 计算属性类型
 * @template M - 方法类型
 * @template Mixin - 混入类型
 * @template Extends - 继承类型
 * @template E - 事件选项类型
 * @template EE - 事件名称类型
 * @template Defaults - 默认属性类型
 * @template I - 注入选项类型
 * @template II - 注入键类型
 * @template S - 插槽类型
 * @template LC - 局部组件类型
 * @template Directives - 指令类型
 * @template Exposed - 暴露属性类型
 * @template Provide - 提供选项类型
 */
export interface ComponentOptionsBase<
  Props,
  RawBindings,
  D,
  C extends ComputedOptions,
  M extends MethodOptions,
  Mixin extends ComponentOptionsMixin,
  Extends extends ComponentOptionsMixin,
  E extends EmitsOptions,
  EE extends string = string,
  Defaults = {},
  I extends ComponentInjectOptions = {},
  II extends string = string,
  S extends SlotsType = {},
  LC extends Record<string, Component> = {},
  Directives extends Record<string, Directive> = {},
  Exposed extends string = string,
  Provide extends ComponentProvideOptions = ComponentProvideOptions,
> extends LegacyOptions<Props, D, C, M, Mixin, Extends, I, II, Provide>,
    ComponentInternalOptions,
    ComponentCustomOptions {
  setup?: (
    this: void,
    props: LooseRequired<
      Props &
        Prettify<
          UnwrapMixinsType<
            IntersectionMixin<Mixin> & IntersectionMixin<Extends>,
            'P'
          >
        >
    >,
    ctx: SetupContext<E, S>,
  ) => Promise<RawBindings> | RawBindings | RenderFunction | void
  name?: string
  template?: string | object // can be a direct DOM node
  // Note: we are intentionally using the signature-less `Function` type here
  // since any type with signature will cause the whole inference to fail when
  // the return expression contains reference to `this`.
  // Luckily `render()` doesn't need any arguments nor does it care about return
  // type.
  render?: Function
  // NOTE: extending both LC and Record<string, Component> allows objects to be forced
  // to be of type Component, while still inferring LC generic
  components?: LC & Record<string, Component>
  // NOTE: extending both Directives and Record<string, Directive> allows objects to be forced
  // to be of type Directive, while still inferring Directives generic
  directives?: Directives & Record<string, Directive>
  inheritAttrs?: boolean
  emits?: (E | EE[]) & ThisType<void>
  slots?: S
  expose?: Exposed[]
  serverPrefetch?(): void | Promise<any>

  // Runtime compiler only -----------------------------------------------------
  compilerOptions?: RuntimeCompilerOptions

  // Internal ------------------------------------------------------------------

  /**
   * SSR only. This is produced by compiler-ssr and attached in compiler-sfc
   * not user facing, so the typing is lax and for test only.
   * @internal
   */
  ssrRender?: (
    ctx: any,
    push: (item: any) => void,
    parentInstance: ComponentInternalInstance,
    attrs: Data | undefined,
    // for compiler-optimized bindings
    $props: ComponentInternalInstance['props'],
    $setup: ComponentInternalInstance['setupState'],
    $data: ComponentInternalInstance['data'],
    $options: ComponentInternalInstance['ctx'],
  ) => void

  /**
   * Only generated by compiler-sfc to mark a ssr render function inlined and
   * returned from setup()
   * @internal
   */
  __ssrInlineRender?: boolean

  /**
   * marker for AsyncComponentWrapper
   * @internal
   */
  __asyncLoader?: () => Promise<ConcreteComponent>
  /**
   * the inner component resolved by the AsyncComponentWrapper
   * @internal
   */
  __asyncResolved?: ConcreteComponent
  /**
   * Exposed for lazy hydration
   * @internal
   */
  __asyncHydrate?: (
    el: Element,
    instance: ComponentInternalInstance,
    hydrate: () => void,
  ) => void

  // Type differentiators ------------------------------------------------------

  // Note these are internal but need to be exposed in d.ts for type inference
  // to work!

  // type-only differentiator to separate OptionWithoutProps from a constructor
  // type returned by defineComponent() or FunctionalComponent
  call?: (this: unknown, ...args: unknown[]) => never
  // type-only differentiators for built-in Vnode types
  __isFragment?: never
  __isTeleport?: never
  __isSuspense?: never

  __defaults?: Defaults
}

/**
 * 运行时编译器选项接口
 * 定义了对运行时有意义的编译器选项子集
 */
export interface RuntimeCompilerOptions {
  isCustomElement?: (tag: string) => boolean
  whitespace?: 'preserve' | 'condense'
  comments?: boolean
  delimiters?: [string, string]
}

/**
 * 组件选项类型
 * 定义了组件的完整选项类型，继承自ComponentOptionsBase
 *
 * @template Props - 组件属性类型
 * @template RawBindings - setup函数返回的绑定类型
 * @template D - 组件数据类型
 * @template C - 计算属性类型
 * @template M - 方法类型
 * @template Mixin - 混入类型
 * @template Extends - 继承类型
 * @template E - 事件选项类型
 * @template EE - 事件名称类型
 * @template Defaults - 默认属性类型
 * @template I - 注入选项类型
 * @template II - 注入键类型
 * @template S - 插槽类型
 * @template LC - 局部组件类型
 * @template Directives - 指令类型
 * @template Exposed - 暴露属性类型
 * @template Provide - 提供选项类型
 */
export type ComponentOptions<
  Props = {},
  RawBindings = any,
  D = any,
  C extends ComputedOptions = any,
  M extends MethodOptions = any,
  Mixin extends ComponentOptionsMixin = any,
  Extends extends ComponentOptionsMixin = any,
  E extends EmitsOptions = any,
  EE extends string = string,
  Defaults = {},
  I extends ComponentInjectOptions = {},
  II extends string = string,
  S extends SlotsType = {},
  LC extends Record<string, Component> = {},
  Directives extends Record<string, Directive> = {},
  Exposed extends string = string,
  Provide extends ComponentProvideOptions = ComponentProvideOptions,
> = ComponentOptionsBase<
  Props,
  RawBindings,
  D,
  C,
  M,
  Mixin,
  Extends,
  E,
  EE,
  Defaults,
  I,
  II,
  S,
  LC,
  Directives,
  Exposed,
  Provide
> &
  ThisType<
    CreateComponentPublicInstanceWithMixins<
      {},
      RawBindings,
      D,
      C,
      M,
      Mixin,
      Extends,
      E,
      Readonly<Props>,
      Defaults,
      false,
      I,
      S,
      LC,
      Directives
    >
  >

/**
 * 组件选项混入类型
 * 定义了组件选项的混入类型，可以被其他组件继承或混入
 */
export type ComponentOptionsMixin = ComponentOptionsBase<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>

/**
 * 计算属性选项类型
 * 定义了组件中计算属性的类型
 */
export type ComputedOptions = Record<
  string,
  ComputedGetter<any> | WritableComputedOptions<any>
>

/**
 * 方法选项接口
 * 定义了组件中方法的类型
 */
export interface MethodOptions {
  [key: string]: Function
}

/**
 * 提取计算属性返回值类型
 * 从计算属性选项中提取返回值类型
 * @template T - 计算属性选项类型
 */
export type ExtractComputedReturns<T extends any> = {
  [key in keyof T]: T[key] extends { get: (...args: any[]) => infer TReturn }
    ? TReturn
    : T[key] extends (...args: any[]) => infer TReturn
      ? TReturn
      : never
}

/**
 * 对象形式的监视选项项
 * 定义了对象形式的监视选项
 */
export type ObjectWatchOptionItem = {
  handler: WatchCallback | string
} & WatchOptions

/**
 * 监视选项项
 * 定义了监视选项的可能类型
 */
type WatchOptionItem = string | WatchCallback | ObjectWatchOptionItem

/**
 * 组件监视选项项
 * 定义了组件中监视选项的可能类型
 */
type ComponentWatchOptionItem = WatchOptionItem | WatchOptionItem[]

/**
 * 组件监视选项
 * 定义了组件中监视选项的记录类型
 */
type ComponentWatchOptions = Record<string, ComponentWatchOptionItem>

/**
 * 组件提供选项类型
 * 定义了组件中provide选项的类型
 */
export type ComponentProvideOptions = ObjectProvideOptions | Function

/**
 * 对象形式的提供选项
 * 定义了对象形式的provide选项
 */
type ObjectProvideOptions = Record<string | symbol, unknown>

/**
 * 组件注入选项类型
 * 定义了组件中inject选项的类型，可以是字符串数组或对象形式
 */
export type ComponentInjectOptions = string[] | ObjectInjectOptions

/**
 * 对象形式的注入选项
 * 定义了对象形式的inject选项
 */
type ObjectInjectOptions = Record<
  string | symbol,
  string | symbol | { from?: string | symbol; default?: unknown }
>

/**
 * 将注入选项转换为对象类型
 * 将组件注入选项转换为对应的对象类型
 * @template T - 组件注入选项类型
 */
export type InjectToObject<T extends ComponentInjectOptions> =
  T extends string[]
    ? {
        [K in T[number]]?: unknown
      }
    : T extends ObjectInjectOptions
      ? {
          [K in keyof T]?: unknown
        }
      : never

/**
 * 遗留选项接口
 * 定义了组件的遗留选项，兼容旧版Vue的选项
 *
 * @template Props - 组件属性类型
 * @template D - 组件数据类型
 * @template C - 计算属性类型
 * @template M - 方法类型
 * @template Mixin - 混入类型
 * @template Extends - 继承类型
 * @template I - 注入选项类型
 * @template II - 注入键类型
 * @template Provide - 提供选项类型
 */
interface LegacyOptions<
  Props,
  D,
  C extends ComputedOptions,
  M extends MethodOptions,
  Mixin extends ComponentOptionsMixin,
  Extends extends ComponentOptionsMixin,
  I extends ComponentInjectOptions,
  II extends string,
  Provide extends ComponentProvideOptions = ComponentProvideOptions,
> {
  compatConfig?: CompatConfig

  // allow any custom options
  [key: string]: any

  // state
  // Limitation: we cannot expose RawBindings on the `this` context for data
  // since that leads to some sort of circular inference and breaks ThisType
  // for the entire component.
  data?: (
    this: CreateComponentPublicInstanceWithMixins<
      Props,
      {},
      {},
      {},
      MethodOptions,
      Mixin,
      Extends
    >,
    vm: CreateComponentPublicInstanceWithMixins<
      Props,
      {},
      {},
      {},
      MethodOptions,
      Mixin,
      Extends
    >,
  ) => D
  computed?: C
  methods?: M
  watch?: ComponentWatchOptions
  provide?: Provide
  inject?: I | II[]

  // assets
  filters?: Record<string, Function>

  // composition
  mixins?: Mixin[]
  extends?: Extends

  // lifecycle
  beforeCreate?(): any
  created?(): any
  beforeMount?(): any
  mounted?(): any
  beforeUpdate?(): any
  updated?(): any
  activated?(): any
  deactivated?(): any
  /** @deprecated use `beforeUnmount` instead */
  beforeDestroy?(): any
  beforeUnmount?(): any
  /** @deprecated use `unmounted` instead */
  destroyed?(): any
  unmounted?(): any
  renderTracked?: DebuggerHook
  renderTriggered?: DebuggerHook
  errorCaptured?: ErrorCapturedHook

  /**
   * runtime compile only
   * @deprecated use `compilerOptions.delimiters` instead.
   */
  delimiters?: [string, string]

  /**
   * #3468
   *
   * type-only, used to assist Mixin's type inference,
   * typescript will try to simplify the inferred `Mixin` type,
   * with the `__differentiator`, typescript won't be able to combine different mixins,
   * because the `__differentiator` will be different
   */
  __differentiator?: keyof D | keyof C | keyof M
}

/**
 * 合并后的钩子函数类型
 * 表示可以是单个钩子函数或钩子函数数组
 * @template T - 钩子函数类型，默认为无参数无返回值的函数
 */
type MergedHook<T = () => void> = T | T[]

/**
 * 合并后的组件选项类型
 * 定义了合并后的组件选项，包含基础组件选项和覆盖选项
 */
export type MergedComponentOptions = ComponentOptions &
  MergedComponentOptionsOverride

/**
 * 合并组件选项覆盖类型
 * 定义了可以覆盖的合并组件选项，主要是生命周期钩子
 */
export type MergedComponentOptionsOverride = {
  beforeCreate?: MergedHook
  created?: MergedHook
  beforeMount?: MergedHook
  mounted?: MergedHook
  beforeUpdate?: MergedHook
  updated?: MergedHook
  activated?: MergedHook
  deactivated?: MergedHook
  /** @deprecated use `beforeUnmount` instead */
  beforeDestroy?: MergedHook
  beforeUnmount?: MergedHook
  /** @deprecated use `unmounted` instead */
  destroyed?: MergedHook
  unmounted?: MergedHook
  renderTracked?: MergedHook<DebuggerHook>
  renderTriggered?: MergedHook<DebuggerHook>
  errorCaptured?: MergedHook<ErrorCapturedHook>
}

/**
 * 选项类型键
 * 定义了组件选项类型的键
 */
export type OptionTypesKeys = 'P' | 'B' | 'D' | 'C' | 'M' | 'Defaults'

/**
 * 选项类型映射
 * 定义了组件选项类型的映射关系
 *
 * @template P - 属性类型
 * @template B - 绑定类型
 * @template D - 数据类型
 * @template C - 计算属性类型
 * @template M - 方法类型
 * @template Defaults - 默认属性类型
 */
export type OptionTypesType<
  P = {},
  B = {},
  D = {},
  C extends ComputedOptions = {},
  M extends MethodOptions = {},
  Defaults = {},
> = {
  P: P
  B: B
  D: D
  C: C
  M: M
  Defaults: Defaults
}

/**
 * 选项类型枚举
 * 枚举了组件的各种选项类型
 */
enum OptionTypes {
  PROPS = 'Props',
  DATA = 'Data',
  COMPUTED = 'Computed',
  METHODS = 'Methods',
  INJECT = 'Inject',
}

/**
 * 创建重复检查器
 * 创建一个函数，用于检查组件选项中是否存在重复定义的属性
 * @returns 检查函数，接受选项类型和属性名作为参数
 */
function createDuplicateChecker() {
  const cache = Object.create(null)
  return (type: OptionTypes, key: string) => {
    if (cache[key]) {
      warn(`${type} property "${key}" is already defined in ${cache[key]}.`)
    } else {
      cache[key] = type
    }
  }
}

/**
 * 是否缓存属性访问
 * 控制是否缓存对公共代理的属性访问
 */
export let shouldCacheAccess = true

/**
 * 应用组件选项
 * 将组件选项应用到组件实例
 * @param instance - 组件内部实例
 */
export function applyOptions(instance: ComponentInternalInstance): void {
  const options = resolveMergedOptions(instance)
  const publicThis = instance.proxy! as any
  const ctx = instance.ctx

  // do not cache property access on public proxy during state initialization
  shouldCacheAccess = false

  // call beforeCreate first before accessing other options since
  // the hook may mutate resolved options (#2791)
  if (options.beforeCreate) {
    callHook(options.beforeCreate, instance, LifecycleHooks.BEFORE_CREATE)
  }

  const {
    // state
    data: dataOptions,
    computed: computedOptions,
    methods,
    watch: watchOptions,
    provide: provideOptions,
    inject: injectOptions,
    // lifecycle
    created,
    beforeMount,
    mounted,
    beforeUpdate,
    updated,
    activated,
    deactivated,
    beforeDestroy,
    beforeUnmount,
    destroyed,
    unmounted,
    render,
    renderTracked,
    renderTriggered,
    errorCaptured,
    serverPrefetch,
    // public API
    expose,
    inheritAttrs,
    // assets
    components,
    directives,
    filters,
  } = options

  const checkDuplicateProperties = __DEV__ ? createDuplicateChecker() : null

  if (__DEV__) {
    const [propsOptions] = instance.propsOptions
    if (propsOptions) {
      for (const key in propsOptions) {
        checkDuplicateProperties!(OptionTypes.PROPS, key)
      }
    }
  }

  // options initialization order (to be consistent with Vue 2):
  // - props (already done outside of this function)
  // - inject
  // - methods
  // - data (deferred since it relies on `this` access)
  // - computed
  // - watch (deferred since it relies on `this` access)

  if (injectOptions) {
    resolveInjections(injectOptions, ctx, checkDuplicateProperties)
  }

  if (methods) {
    for (const key in methods) {
      const methodHandler = (methods as MethodOptions)[key]
      if (isFunction(methodHandler)) {
        // In dev mode, we use the `createRenderContext` function to define
        // methods to the proxy target, and those are read-only but
        // reconfigurable, so it needs to be redefined here
        if (__DEV__) {
          Object.defineProperty(ctx, key, {
            value: methodHandler.bind(publicThis),
            configurable: true,
            enumerable: true,
            writable: true,
          })
        } else {
          ctx[key] = methodHandler.bind(publicThis)
        }
        if (__DEV__) {
          checkDuplicateProperties!(OptionTypes.METHODS, key)
        }
      } else if (__DEV__) {
        warn(
          `Method "${key}" has type "${typeof methodHandler}" in the component definition. ` +
            `Did you reference the function correctly?`,
        )
      }
    }
  }

  if (dataOptions) {
    if (__DEV__ && !isFunction(dataOptions)) {
      warn(
        `The data option must be a function. ` +
          `Plain object usage is no longer supported.`,
      )
    }
    const data = dataOptions.call(publicThis, publicThis)
    if (__DEV__ && isPromise(data)) {
      warn(
        `data() returned a Promise - note data() cannot be async; If you ` +
          `intend to perform data fetching before component renders, use ` +
          `async setup() + <Suspense>.`,
      )
    }
    if (!isObject(data)) {
      __DEV__ && warn(`data() should return an object.`)
    } else {
      instance.data = reactive(data)
      if (__DEV__) {
        for (const key in data) {
          checkDuplicateProperties!(OptionTypes.DATA, key)
          // expose data on ctx during dev
          if (!isReservedPrefix(key[0])) {
            Object.defineProperty(ctx, key, {
              configurable: true,
              enumerable: true,
              get: () => data[key],
              set: NOOP,
            })
          }
        }
      }
    }
  }

  // state initialization complete at this point - start caching access
  shouldCacheAccess = true

  if (computedOptions) {
    for (const key in computedOptions) {
      const opt = (computedOptions as ComputedOptions)[key]
      const get = isFunction(opt)
        ? opt.bind(publicThis, publicThis)
        : isFunction(opt.get)
          ? opt.get.bind(publicThis, publicThis)
          : NOOP
      if (__DEV__ && get === NOOP) {
        warn(`Computed property "${key}" has no getter.`)
      }
      const set =
        !isFunction(opt) && isFunction(opt.set)
          ? opt.set.bind(publicThis)
          : __DEV__
            ? () => {
                warn(
                  `Write operation failed: computed property "${key}" is readonly.`,
                )
              }
            : NOOP
      const c = computed({
        get,
        set,
      })
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => c.value,
        set: v => (c.value = v),
      })
      if (__DEV__) {
        checkDuplicateProperties!(OptionTypes.COMPUTED, key)
      }
    }
  }

  if (watchOptions) {
    for (const key in watchOptions) {
      createWatcher(watchOptions[key], ctx, publicThis, key)
    }
  }

  if (provideOptions) {
    const provides = isFunction(provideOptions)
      ? provideOptions.call(publicThis)
      : provideOptions
    Reflect.ownKeys(provides).forEach(key => {
      provide(key, provides[key])
    })
  }

  if (created) {
    callHook(created, instance, LifecycleHooks.CREATED)
  }

  /**
 * 注册生命周期钩子
 * 注册组件的生命周期钩子函数
 * @param register - 注册函数
 * @param hook - 生命周期钩子函数或函数数组
 */
function registerLifecycleHook(
    register: Function,
    hook?: Function | Function[],
  ) {
    if (isArray(hook)) {
      hook.forEach(_hook => register(_hook.bind(publicThis)))
    } else if (hook) {
      register(hook.bind(publicThis))
    }
  }

  registerLifecycleHook(onBeforeMount, beforeMount)
  registerLifecycleHook(onMounted, mounted)
  registerLifecycleHook(onBeforeUpdate, beforeUpdate)
  registerLifecycleHook(onUpdated, updated)
  registerLifecycleHook(onActivated, activated)
  registerLifecycleHook(onDeactivated, deactivated)
  registerLifecycleHook(onErrorCaptured, errorCaptured)
  registerLifecycleHook(onRenderTracked, renderTracked)
  registerLifecycleHook(onRenderTriggered, renderTriggered)
  registerLifecycleHook(onBeforeUnmount, beforeUnmount)
  registerLifecycleHook(onUnmounted, unmounted)
  registerLifecycleHook(onServerPrefetch, serverPrefetch)

  if (__COMPAT__) {
    if (
      beforeDestroy &&
      softAssertCompatEnabled(DeprecationTypes.OPTIONS_BEFORE_DESTROY, instance)
    ) {
      registerLifecycleHook(onBeforeUnmount, beforeDestroy)
    }
    if (
      destroyed &&
      softAssertCompatEnabled(DeprecationTypes.OPTIONS_DESTROYED, instance)
    ) {
      registerLifecycleHook(onUnmounted, destroyed)
    }
  }

  if (isArray(expose)) {
    if (expose.length) {
      const exposed = instance.exposed || (instance.exposed = {})
      expose.forEach(key => {
        Object.defineProperty(exposed, key, {
          get: () => publicThis[key],
          set: val => (publicThis[key] = val),
          enumerable: true,
        })
      })
    } else if (!instance.exposed) {
      instance.exposed = {}
    }
  }

  // options that are handled when creating the instance but also need to be
  // applied from mixins
  if (render && instance.render === NOOP) {
    instance.render = render as InternalRenderFunction
  }
  if (inheritAttrs != null) {
    instance.inheritAttrs = inheritAttrs
  }

  // asset options.
  if (components) instance.components = components as any
  if (directives) instance.directives = directives
  if (
    __COMPAT__ &&
    filters &&
    isCompatEnabled(DeprecationTypes.FILTERS, instance)
  ) {
    instance.filters = filters
  }

  if (__SSR__ && serverPrefetch) {
    markAsyncBoundary(instance)
  }
}

/**
 * 解析注入选项
 * 解析组件的注入选项，并将注入的值添加到组件上下文中
 * @param injectOptions - 组件的注入选项，可以是字符串数组或对象
 * @param ctx - 组件上下文对象
 * @param checkDuplicateProperties - 检查重复属性的函数，默认为空函数
 */
export function resolveInjections(
  injectOptions: ComponentInjectOptions,
  ctx: any,
  checkDuplicateProperties = NOOP as any,
): void {
  if (isArray(injectOptions)) {
    injectOptions = normalizeInject(injectOptions)!
  }
  for (const key in injectOptions) {
    const opt = injectOptions[key]
    let injected: unknown
    if (isObject(opt)) {
      if ('default' in opt) {
        injected = inject(
          opt.from || key,
          opt.default,
          true /* treat default function as factory */,
        )
      } else {
        injected = inject(opt.from || key)
      }
    } else {
      injected = inject(opt)
    }
    if (isRef(injected)) {
      // unwrap injected refs (ref #4196)
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => (injected as Ref).value,
        set: v => ((injected as Ref).value = v),
      })
    } else {
      ctx[key] = injected
    }
    if (__DEV__) {
      checkDuplicateProperties!(OptionTypes.INJECT, key)
    }
  }
}

/**
 * 调用生命周期钩子
 * 调用组件的生命周期钩子函数，并处理异步错误
 * @param hook - 要调用的生命周期钩子函数或函数数组
 * @param instance - 组件内部实例
 * @param type - 生命周期钩子类型
 */
function callHook(
  hook: Function,
  instance: ComponentInternalInstance,
  type: LifecycleHooks,
) {
  callWithAsyncErrorHandling(
    isArray(hook)
      ? hook.map(h => h.bind(instance.proxy!))
      : hook.bind(instance.proxy!),
    instance,
    type,
  )
}

/**
 * 创建监听器
 * 根据组件的watch选项创建监听器
 * @param raw - 原始的监视选项，可以是字符串、函数、对象或对象数组
 * @param ctx - 组件上下文对象
 * @param publicThis - 组件公共实例
 * @param key - 要监视的属性键名
 */
export function createWatcher(
  raw: ComponentWatchOptionItem,
  ctx: Data,
  publicThis: ComponentPublicInstance,
  key: string,
): void {
  let getter = key.includes('.')
    ? createPathGetter(publicThis, key)
    : () => (publicThis as any)[key]

  const options: WatchOptions = {}
  if (__COMPAT__) {
    const instance =
      currentInstance && getCurrentScope() === currentInstance.scope
        ? currentInstance
        : null

    const newValue = getter()
    if (
      isArray(newValue) &&
      isCompatEnabled(DeprecationTypes.WATCH_ARRAY, instance)
    ) {
      options.deep = true
    }

    const baseGetter = getter
    getter = () => {
      const val = baseGetter()
      if (
        isArray(val) &&
        checkCompatEnabled(DeprecationTypes.WATCH_ARRAY, instance)
      ) {
        traverse(val)
      }
      return val
    }
  }

  if (isString(raw)) {
    const handler = ctx[raw]
    if (isFunction(handler)) {
      if (__COMPAT__) {
        watch(getter, handler as WatchCallback, options)
      } else {
        watch(getter, handler as WatchCallback)
      }
    } else if (__DEV__) {
      warn(`Invalid watch handler specified by key "${raw}"`, handler)
    }
  } else if (isFunction(raw)) {
    if (__COMPAT__) {
      watch(getter, raw.bind(publicThis), options)
    } else {
      watch(getter, raw.bind(publicThis))
    }
  } else if (isObject(raw)) {
    if (isArray(raw)) {
      raw.forEach(r => createWatcher(r, ctx, publicThis, key))
    } else {
      const handler = isFunction(raw.handler)
        ? raw.handler.bind(publicThis)
        : (ctx[raw.handler] as WatchCallback)
      if (isFunction(handler)) {
        watch(getter, handler, __COMPAT__ ? extend(raw, options) : raw)
      } else if (__DEV__) {
        warn(`Invalid watch handler specified by key "${raw.handler}"`, handler)
      }
    }
  } else if (__DEV__) {
    warn(`Invalid watch option: "${key}"`, raw)
  }
}

/**
 * 解析合并后的组件选项
 * 解析合并后的组件选项并缓存到组件上
 * 每个组件只执行一次，因为合并不涉及实例
 * @param instance - 组件内部实例
 * @returns 合并后的组件选项
 */
export function resolveMergedOptions(
  instance: ComponentInternalInstance,
): MergedComponentOptions {
  const base = instance.type as ComponentOptions
  const { mixins, extends: extendsOptions } = base
  const {
    mixins: globalMixins,
    optionsCache: cache,
    config: { optionMergeStrategies },
  } = instance.appContext
  const cached = cache.get(base)

  let resolved: MergedComponentOptions

  if (cached) {
    resolved = cached
  } else if (!globalMixins.length && !mixins && !extendsOptions) {
    if (
      __COMPAT__ &&
      isCompatEnabled(DeprecationTypes.PRIVATE_APIS, instance)
    ) {
      resolved = extend({}, base) as MergedComponentOptions
      resolved.parent = instance.parent && instance.parent.proxy
      resolved.propsData = instance.vnode.props
    } else {
      resolved = base as MergedComponentOptions
    }
  } else {
    resolved = {}
    if (globalMixins.length) {
      globalMixins.forEach(m =>
        mergeOptions(resolved, m, optionMergeStrategies, true),
      )
    }
    mergeOptions(resolved, base, optionMergeStrategies)
  }
  if (isObject(base)) {
    cache.set(base, resolved)
  }
  return resolved
}

/**
 * 合并组件选项
 * 合并两个组件选项对象
 * @param to - 目标对象，合并结果将存储在这里
 * @param from - 源对象，要合并的选项
 * @param strats - 选项合并策略对象
 * @param asMixin - 是否作为混入合并，默认为false
 * @returns 合并后的对象
 */
export function mergeOptions(
  to: any,
  from: any,
  strats: Record<string, OptionMergeFunction>,
  asMixin = false,
): any {
  if (__COMPAT__ && isFunction(from)) {
    from = from.options
  }

  const { mixins, extends: extendsOptions } = from

  if (extendsOptions) {
    mergeOptions(to, extendsOptions, strats, true)
  }
  if (mixins) {
    mixins.forEach((m: ComponentOptionsMixin) =>
      mergeOptions(to, m, strats, true),
    )
  }

  for (const key in from) {
    if (asMixin && key === 'expose') {
      __DEV__ &&
        warn(
          `"expose" option is ignored when declared in mixins or extends. ` +
            `It should only be declared in the base component itself.`,
        )
    } else {
      const strat = internalOptionMergeStrats[key] || (strats && strats[key])
      to[key] = strat ? strat(to[key], from[key]) : from[key]
    }
  }
  return to
}

/**
 * 内部选项合并策略
 * 定义了各种组件选项的合并策略
 */
export const internalOptionMergeStrats: Record<string, Function> = {
  data: mergeDataFn,
  props: mergeEmitsOrPropsOptions,
  emits: mergeEmitsOrPropsOptions,
  // objects
  methods: mergeObjectOptions,
  computed: mergeObjectOptions,
  // lifecycle
  beforeCreate: mergeAsArray,
  created: mergeAsArray,
  beforeMount: mergeAsArray,
  mounted: mergeAsArray,
  beforeUpdate: mergeAsArray,
  updated: mergeAsArray,
  beforeDestroy: mergeAsArray,
  beforeUnmount: mergeAsArray,
  destroyed: mergeAsArray,
  unmounted: mergeAsArray,
  activated: mergeAsArray,
  deactivated: mergeAsArray,
  errorCaptured: mergeAsArray,
  serverPrefetch: mergeAsArray,
  // assets
  components: mergeObjectOptions,
  directives: mergeObjectOptions,
  // watch
  watch: mergeWatchOptions,
  // provide / inject
  provide: mergeDataFn,
  inject: mergeInject,
}

if (__COMPAT__) {
  internalOptionMergeStrats.filters = mergeObjectOptions
}

/**
 * 合并数据函数
 * 合并组件的data选项
 * @param to - 目标数据
 * @param from - 源数据
 * @returns 合并后的数据函数
 */
function mergeDataFn(to: any, from: any) {
  if (!from) {
    return to
  }
  if (!to) {
    return from
  }
  return function mergedDataFn(this: ComponentPublicInstance) {
    return (
      __COMPAT__ && isCompatEnabled(DeprecationTypes.OPTIONS_DATA_MERGE, null)
        ? deepMergeData
        : extend
    )(
      isFunction(to) ? to.call(this, this) : to,
      isFunction(from) ? from.call(this, this) : from,
    )
  }
}

/**
 * 合并注入选项
 * 合并组件的inject选项
 * @param to - 目标注入选项
 * @param from - 源注入选项
 * @returns 合并后的注入选项
 */
function mergeInject(
  to: ComponentInjectOptions | undefined,
  from: ComponentInjectOptions,
) {
  return mergeObjectOptions(normalizeInject(to), normalizeInject(from))
}

/**
 * 标准化注入选项
 * 将注入选项标准化为对象形式
 * @param raw - 原始注入选项
 * @returns 标准化后的注入选项
 */
function normalizeInject(
  raw: ComponentInjectOptions | undefined,
): ObjectInjectOptions | undefined {
  if (isArray(raw)) {
    const res: ObjectInjectOptions = {}
    for (let i = 0; i < raw.length; i++) {
      res[raw[i]] = raw[i]
    }
    return res
  }
  return raw
}

/**
 * 合并为数组
 * 将选项合并为数组
 * @template T - 数组元素类型，默认为Function
 * @param to - 目标选项
 * @param from - 源选项
 * @returns 合并后的数组
 */
function mergeAsArray<T = Function>(to: T[] | T | undefined, from: T | T[]) {
  return to ? [...new Set([].concat(to as any, from as any))] : from
}

/**
 * 合并对象选项
 * 合并对象类型的组件选项
 * @param to - 目标对象
 * @param from - 源对象
 * @returns 合并后的对象
 */
function mergeObjectOptions(to: Object | undefined, from: Object | undefined) {
  return to ? extend(Object.create(null), to, from) : from
}

/**
 * 合并emits或props选项
 * 合并组件的emits或props选项
 * @param to - 目标选项
 * @param from - 源选项
 * @returns 合并后的选项
 */
function mergeEmitsOrPropsOptions(
  to: EmitsOptions | undefined,
  from: EmitsOptions | undefined,
): EmitsOptions | undefined
function mergeEmitsOrPropsOptions(
  to: ComponentPropsOptions | undefined,
  from: ComponentPropsOptions | undefined,
): ComponentPropsOptions | undefined
function mergeEmitsOrPropsOptions(
  to: ComponentPropsOptions | EmitsOptions | undefined,
  from: ComponentPropsOptions | EmitsOptions | undefined,
) {
  if (to) {
    if (isArray(to) && isArray(from)) {
      return [...new Set([...to, ...from])]
    }
    return extend(
      Object.create(null),
      normalizePropsOrEmits(to),
      normalizePropsOrEmits(from ?? {}),
    )
  } else {
    return from
  }
}

/**
 * 合并监视选项
 * 合并组件的watch选项
 * @param to - 目标监视选项
 * @param from - 源监视选项
 * @returns 合并后的监视选项
 */
function mergeWatchOptions(
  to: ComponentWatchOptions | undefined,
  from: ComponentWatchOptions | undefined,
) {
  if (!to) return from
  if (!from) return to
  const merged = extend(Object.create(null), to)
  for (const key in from) {
    merged[key] = mergeAsArray(to[key], from[key])
  }
  return merged
}

// Deprecated legacy types, kept because they were previously exported ---------

/**
 * 无props的组件选项类型
 * @deprecated 已弃用的类型
 *
 * @template Props - 属性类型，默认为空对象
 * @template RawBindings - setup函数返回的绑定类型
 * @template D - 组件数据类型
 * @template C - 计算属性类型
 * @template M - 方法类型
 * @template Mixin - 混入类型
 * @template Extends - 继承类型
 * @template E - 事件选项类型
 * @template EE - 事件名称类型
 * @template I - 注入选项类型
 * @template II - 注入键类型
 * @template S - 插槽类型
 * @template LC - 局部组件类型
 * @template Directives - 指令类型
 * @template Exposed - 暴露属性类型
 * @template Provide - 提供选项类型
 */
export type ComponentOptionsWithoutProps<
  Props = {},
  RawBindings = {},
  D = {},
  C extends ComputedOptions = {},
  M extends MethodOptions = {},
  Mixin extends ComponentOptionsMixin = ComponentOptionsMixin,
  Extends extends ComponentOptionsMixin = ComponentOptionsMixin,
  E extends EmitsOptions = {},
  EE extends string = string,
  I extends ComponentInjectOptions = {},
  II extends string = string,
  S extends SlotsType = {},
  LC extends Record<string, Component> = {},
  Directives extends Record<string, Directive> = {},
  Exposed extends string = string,
  Provide extends ComponentProvideOptions = ComponentProvideOptions,
  TE extends ComponentTypeEmits = {},
  ResolvedEmits extends EmitsOptions = {} extends E
    ? TypeEmitsToOptions<TE>
    : E,
  PE = Props & EmitsToProps<ResolvedEmits>,
> = ComponentOptionsBase<
  PE,
  RawBindings,
  D,
  C,
  M,
  Mixin,
  Extends,
  E,
  EE,
  {},
  I,
  II,
  S,
  LC,
  Directives,
  Exposed,
  Provide
> & {
  props?: never
  /**
   * @private for language-tools use only
   */
  __typeProps?: Props
  /**
   * @private for language-tools use only
   */
  __typeEmits?: TE
} & ThisType<
    CreateComponentPublicInstanceWithMixins<
      PE,
      RawBindings,
      D,
      C,
      M,
      Mixin,
      Extends,
      ResolvedEmits,
      EE,
      {},
      false,
      I,
      S,
      LC,
      Directives,
      Exposed
    >
  >

/**
 * 带数组props的组件选项类型
 * @deprecated 已弃用的类型
 *
 * @template PropNames - 属性名称类型，默认为字符串
 * @template RawBindings - setup函数返回的绑定类型
 * @template D - 组件数据类型
 * @template C - 计算属性类型
 * @template M - 方法类型
 * @template Mixin - 混入类型
 * @template Extends - 继承类型
 * @template E - 事件选项类型
 * @template EE - 事件名称类型
 * @template I - 注入选项类型
 * @template II - 注入键类型
 * @template S - 插槽类型
 * @template LC - 局部组件类型
 * @template Directives - 指令类型
 * @template Exposed - 暴露属性类型
 * @template Provide - 提供选项类型
 * @template Props - 处理后的属性类型
 */
export type ComponentOptionsWithArrayProps<
  PropNames extends string = string,
  RawBindings = {},
  D = {},
  C extends ComputedOptions = {},
  M extends MethodOptions = {},
  Mixin extends ComponentOptionsMixin = ComponentOptionsMixin,
  Extends extends ComponentOptionsMixin = ComponentOptionsMixin,
  E extends EmitsOptions = EmitsOptions,
  EE extends string = string,
  I extends ComponentInjectOptions = {},
  II extends string = string,
  S extends SlotsType = {},
  LC extends Record<string, Component> = {},
  Directives extends Record<string, Directive> = {},
  Exposed extends string = string,
  Provide extends ComponentProvideOptions = ComponentProvideOptions,
  Props = Prettify<Readonly<{ [key in PropNames]?: any } & EmitsToProps<E>>>,
> = ComponentOptionsBase<
  Props,
  RawBindings,
  D,
  C,
  M,
  Mixin,
  Extends,
  E,
  EE,
  {},
  I,
  II,
  S,
  LC,
  Directives,
  Exposed,
  Provide
> & {
  props: PropNames[]
} & ThisType<
    CreateComponentPublicInstanceWithMixins<
      Props,
      RawBindings,
      D,
      C,
      M,
      Mixin,
      Extends,
      E,
      Props,
      {},
      false,
      I,
      S,
      LC,
      Directives,
      Exposed
    >
  >

/**
 * 带对象props的组件选项类型
 * @deprecated 已弃用的类型
 *
 * @template PropsOptions - 对象属性选项类型
 * @template RawBindings - setup函数返回的绑定类型
 * @template D - 组件数据类型
 * @template C - 计算属性类型
 * @template M - 方法类型
 * @template Mixin - 混入类型
 * @template Extends - 继承类型
 * @template E - 事件选项类型
 * @template EE - 事件名称类型
 * @template I - 注入选项类型
 * @template II - 注入键类型
 * @template S - 插槽类型
 * @template LC - 局部组件类型
 * @template Directives - 指令类型
 * @template Exposed - 暴露属性类型
 * @template Provide - 提供选项类型
 * @template Props - 处理后的属性类型
 * @template Defaults - 默认属性类型
 */
export type ComponentOptionsWithObjectProps<
  PropsOptions = ComponentObjectPropsOptions,
  RawBindings = {},
  D = {},
  C extends ComputedOptions = {},
  M extends MethodOptions = {},
  Mixin extends ComponentOptionsMixin = ComponentOptionsMixin,
  Extends extends ComponentOptionsMixin = ComponentOptionsMixin,
  E extends EmitsOptions = EmitsOptions,
  EE extends string = string,
  I extends ComponentInjectOptions = {},
  II extends string = string,
  S extends SlotsType = {},
  LC extends Record<string, Component> = {},
  Directives extends Record<string, Directive> = {},
  Exposed extends string = string,
  Provide extends ComponentProvideOptions = ComponentProvideOptions,
  Props = Prettify<
    Readonly<ExtractPropTypes<PropsOptions>> & Readonly<EmitsToProps<E>>
  >,
  Defaults = ExtractDefaultPropTypes<PropsOptions>,
> = ComponentOptionsBase<
  Props,
  RawBindings,
  D,
  C,
  M,
  Mixin,
  Extends,
  E,
  EE,
  Defaults,
  I,
  II,
  S,
  LC,
  Directives,
  Exposed,
  Provide
> & {
  props: PropsOptions & ThisType<void>
} & ThisType<
    CreateComponentPublicInstanceWithMixins<
      Props,
      RawBindings,
      D,
      C,
      M,
      Mixin,
      Extends,
      E,
      Props,
      Defaults,
      false,
      I,
      S,
      LC,
      Directives
    >
  >
