/**
 * 组件公共实例模块
 * 此文件定义了Vue组件的公共实例类型、接口和相关工具函数
 * 负责组件实例的属性访问、方法调用和生命周期管理
 */
import {
  type Component,
  type ComponentInternalInstance,
  type Data,
  getComponentPublicInstance,
  isStatefulComponent,
} from './component'
import { nextTick, queueJob } from './scheduler'
import {
  type OnCleanup,
  type WatchOptions,
  type WatchStopHandle,
  instanceWatch,
} from './apiWatch'
import {
  EMPTY_OBJ,
  type IfAny,
  NOOP,
  type Prettify,
  type UnionToIntersection,
  extend,
  hasOwn,
  isFunction,
  isGloballyAllowed,
  isString,
} from '@vue/shared'
import {
  ReactiveFlags,
  type ShallowUnwrapRef,
  TrackOpTypes,
  type UnwrapNestedRefs,
  shallowReadonly,
  toRaw,
  track,
} from '@vue/reactivity'
import {
  type ComponentInjectOptions,
  type ComponentOptionsBase,
  type ComponentOptionsMixin,
  type ComponentProvideOptions,
  type ComputedOptions,
  type ExtractComputedReturns,
  type InjectToObject,
  type MergedComponentOptionsOverride,
  type MethodOptions,
  type OptionTypesKeys,
  type OptionTypesType,
  resolveMergedOptions,
  shouldCacheAccess,
} from './componentOptions'
import type { EmitFn, EmitsOptions } from './componentEmits'
import type { SlotsType, UnwrapSlotsType } from './componentSlots'
import { markAttrsAccessed } from './componentRenderUtils'
import { currentRenderingInstance } from './componentRenderContext'
import { warn } from './warning'
import { installCompatInstanceProperties } from './compat/instance'
import type { Directive } from './directives'

/**
 * 组件自定义属性接口
 * 用于扩展组件实例的属性，可以通过 `this` 访问
 *
 * @example
 * 以下是向每个组件实例添加 `$router` 属性的示例：
 * ```ts
 * import { createApp } from 'vue'
 * import { Router, createRouter } from 'vue-router'
 *
 * declare module 'vue' {
 *   interface ComponentCustomProperties {
 *     $router: Router
 *   }
 * }
 *
 * // 有效地将路由器添加到每个组件实例
 * const app = createApp({})
 * const router = createRouter()
 * app.config.globalProperties.$router = router
 *
 * const vm = app.mount('#app')
 * // 我们可以从实例访问路由器
 * vm.$router.push('/')
 * ```
 */
export interface ComponentCustomProperties {}

/**
 * 判断是否为默认混入组件类型
 * 如果T是ComponentOptionsMixin且ComponentOptionsMixin是T的父类型，则返回true
 */
type IsDefaultMixinComponent<T> = T extends ComponentOptionsMixin
  ? ComponentOptionsMixin extends T
    ? true
    : false
  : false

/**
 * 将混入类型转换为选项类型
 * 从ComponentOptionsBase中提取P、B、D、C、M和Defaults类型，并与混入和扩展的类型相交
 */
type MixinToOptionTypes<T> =
  T extends ComponentOptionsBase<
    infer P,
    infer B,
    infer D,
    infer C,
    infer M,
    infer Mixin,
    infer Extends,
    any,
    any,
    infer Defaults,
    any,
    any,
    any,
    any,
    any,
    any,
    any
  >
    ? OptionTypesType<P & {}, B & {}, D & {}, C & {}, M & {}, Defaults & {}> &
        IntersectionMixin<Mixin> &
        IntersectionMixin<Extends>
    : never

/**
 * 提取混入类型（映射类型）
 * 用于解析循环引用
 */
type ExtractMixin<T> = {
  Mixin: MixinToOptionTypes<T>
}[T extends ComponentOptionsMixin ? 'Mixin' : never]

/**
 * 相交混入类型
 * 如果T是默认混入组件类型，则返回OptionTypesType，否则返回所有提取混入类型的交集
 */
export type IntersectionMixin<T> =
  IsDefaultMixinComponent<T> extends true
    ? OptionTypesType
    : UnionToIntersection<ExtractMixin<T>>

/**
 * 解包混入类型
 * 从OptionTypesType中提取指定类型的属性
 *
 * @template T 要解包的类型
 * @template Type 要提取的选项类型键
 */
export type UnwrapMixinsType<
  T,
  Type extends OptionTypesKeys,
> = T extends OptionTypesType ? T[Type] : never

/**
 * 确保非void类型
 * 如果T是void类型，则返回空对象，否则返回T
 */
type EnsureNonVoid<T> = T extends void ? {} : T

/**
 * 组件公共实例构造函数类型
 * 定义了组件实例的构造函数接口
 *
 * @template T 组件公共实例类型
 * @template Props props类型
 * @template RawBindings 原始绑定类型
 * @template D 数据类型
 * @template C 计算属性选项类型
 * @template M 方法选项类型
 */
export type ComponentPublicInstanceConstructor<
  T extends ComponentPublicInstance<
    Props,
    RawBindings,
    D,
    C,
    M
  > = ComponentPublicInstance<any>,
  Props = any,
  RawBindings = any,
  D = any,
  C extends ComputedOptions = ComputedOptions,
  M extends MethodOptions = MethodOptions,
> = {
  __isFragment?: never
  __isTeleport?: never
  __isSuspense?: never
  new (...args: any[]): T
}

/**
 * 创建组件公共实例类型
 * 此类型已不再内部使用，但被vue-tsc生成的现有库类型依赖
 *
 * @template P props类型
 * @template B 原始绑定类型
 * @template D 数据类型
 * @template C 计算属性选项类型
 * @template M 方法选项类型
 * @template Mixin 混入类型
 * @template Extends 扩展类型
 * @template E 触发事件选项类型
 * @template PublicProps 公共props类型
 * @template Defaults 默认值类型
 * @template MakeDefaultsOptional 是否使默认值可选
 * @template I 注入选项类型
 * @template S 插槽类型
 * @template PublicMixin 公共混入类型
 * @template PublicP 公共props类型(解析后)
 * @template PublicB 公共绑定类型(解析后)
 * @template PublicD 公共数据类型(解析后)
 * @template PublicC 公共计算属性类型(解析后)
 * @template PublicM 公共方法类型(解析后)
 * @template PublicDefaults 公共默认值类型(解析后)
 * @deprecated 此类型已不再内部使用，但被现有库类型依赖
 */
export type CreateComponentPublicInstance<
  P = {},
  B = {},
  D = {},
  C extends ComputedOptions = {},
  M extends MethodOptions = {},
  Mixin extends ComponentOptionsMixin = ComponentOptionsMixin,
  Extends extends ComponentOptionsMixin = ComponentOptionsMixin,
  E extends EmitsOptions = {},
  PublicProps = P,
  Defaults = {},
  MakeDefaultsOptional extends boolean = false,
  I extends ComponentInjectOptions = {},
  S extends SlotsType = {},
  PublicMixin = IntersectionMixin<Mixin> & IntersectionMixin<Extends>,
  PublicP = UnwrapMixinsType<PublicMixin, 'P'> & EnsureNonVoid<P>,
  PublicB = UnwrapMixinsType<PublicMixin, 'B'> & EnsureNonVoid<B>,
  PublicD = UnwrapMixinsType<PublicMixin, 'D'> & EnsureNonVoid<D>,
  PublicC extends ComputedOptions = UnwrapMixinsType<PublicMixin, 'C'> &
    EnsureNonVoid<C>,
  PublicM extends MethodOptions = UnwrapMixinsType<PublicMixin, 'M'> &
    EnsureNonVoid<M>,
  PublicDefaults = UnwrapMixinsType<PublicMixin, 'Defaults'> &
    EnsureNonVoid<Defaults>,
> = ComponentPublicInstance<
  PublicP,
  PublicB,
  PublicD,
  PublicC,
  PublicM,
  E,
  PublicProps,
  PublicDefaults,
  MakeDefaultsOptional,
  ComponentOptionsBase<
    P,
    B,
    D,
    C,
    M,
    Mixin,
    Extends,
    E,
    string,
    Defaults,
    {},
    string,
    S
  >,
  I,
  S
>

/**
 * 创建带有混入的组件公共实例类型
 * 与`CreateComponentPublicInstance`类似，但添加了本地组件、全局指令、暴露属性和provide推断
 * 更改了参数顺序，避免在内部重复混入推断，但为避免破坏依赖于先前参数顺序的类型，必须作为新类型存在 (#10842)
 *
 * @template P props类型
 * @template B 原始绑定类型
 * @template D 数据类型
 * @template C 计算属性选项类型
 * @template M 方法选项类型
 * @template Mixin 混入类型
 * @template Extends 扩展类型
 * @template E 触发事件选项类型
 * @template PublicProps 公共props类型
 * @template Defaults 默认值类型
 * @template MakeDefaultsOptional 是否使默认值可选
 * @template I 注入选项类型
 * @template S 插槽类型
 * @template LC 本地组件类型
 * @template Directives 指令类型
 * @template Exposed 暴露的属性类型
 * @template TypeRefs 类型引用
 */
export type CreateComponentPublicInstanceWithMixins<
  P = {},
  B = {},
  D = {},
  C extends ComputedOptions = {},
  M extends MethodOptions = {},
  Mixin extends ComponentOptionsMixin = ComponentOptionsMixin,
  Extends extends ComponentOptionsMixin = ComponentOptionsMixin,
  E extends EmitsOptions = {},
  PublicProps = P,
  Defaults = {},
  MakeDefaultsOptional extends boolean = false,
  I extends ComponentInjectOptions = {},
  S extends SlotsType = {},
  LC extends Record<string, Component> = {},
  Directives extends Record<string, Directive> = {},
  Exposed extends string = string,
  TypeRefs extends Data = {},
  TypeEl extends Element = any,
  Provide extends ComponentProvideOptions = ComponentProvideOptions,
  // mixin inference
  PublicMixin = IntersectionMixin<Mixin> & IntersectionMixin<Extends>,
  PublicP = UnwrapMixinsType<PublicMixin, 'P'> & EnsureNonVoid<P>,
  PublicB = UnwrapMixinsType<PublicMixin, 'B'> & EnsureNonVoid<B>,
  PublicD = UnwrapMixinsType<PublicMixin, 'D'> & EnsureNonVoid<D>,
  PublicC extends ComputedOptions = UnwrapMixinsType<PublicMixin, 'C'> &
    EnsureNonVoid<C>,
  PublicM extends MethodOptions = UnwrapMixinsType<PublicMixin, 'M'> &
    EnsureNonVoid<M>,
  PublicDefaults = UnwrapMixinsType<PublicMixin, 'Defaults'> &
    EnsureNonVoid<Defaults>,
> = ComponentPublicInstance<
  PublicP,
  PublicB,
  PublicD,
  PublicC,
  PublicM,
  E,
  PublicProps,
  PublicDefaults,
  MakeDefaultsOptional,
  ComponentOptionsBase<
    P,
    B,
    D,
    C,
    M,
    Mixin,
    Extends,
    E,
    string,
    Defaults,
    {},
    string,
    S,
    LC,
    Directives,
    Exposed,
    Provide
  >,
  I,
  S,
  Exposed,
  TypeRefs,
  TypeEl
>

export type ExposedKeys<
  T,
  Exposed extends string & keyof T,
> = '' extends Exposed ? T : Pick<T, Exposed>

/**
 * 组件公共实例类型
 * 定义了组件实例的公共接口，用于模板渲染上下文（作为render选项中的`this`）
 *
 * @template P 从props选项提取的props类型
 * @template B 从setup()返回的原始绑定类型
 * @template D 从data()返回的数据类型
 * @template C 计算属性选项类型
 * @template M 方法选项类型
 * @template E 触发事件选项类型
 * @template PublicProps 公共props类型
 * @template Defaults 默认值类型
 * @template MakeDefaultsOptional 是否使默认值可选
 * @template Options 组件选项类型
 * @template I 注入选项类型
 * @template S 插槽类型
 * @template Exposed 暴露的属性类型
 * @template TypeRefs 类型引用
 * @template TypeEl 元素类型
 */
export type ComponentPublicInstance<
  P = {}, // props类型（从props选项提取）
  B = {}, // 原始绑定类型（从setup()返回）
  D = {}, // 数据类型（从data()返回）
  C extends ComputedOptions = {},
  M extends MethodOptions = {},
  E extends EmitsOptions = {},
  PublicProps = {},
  Defaults = {},
  MakeDefaultsOptional extends boolean = false,
  Options = ComponentOptionsBase<any, any, any, any, any, any, any, any, any>,
  I extends ComponentInjectOptions = {},
  S extends SlotsType = {},
  Exposed extends string = '',
  TypeRefs extends Data = {},
  TypeEl extends Element = any,
> = {
  $: ComponentInternalInstance // 内部组件实例引用
  $data: D // 组件数据
  $props: MakeDefaultsOptional extends true
    ? Partial<Defaults> & Omit<Prettify<P> & PublicProps, keyof Defaults>
    : Prettify<P> & PublicProps // 组件属性
  $attrs: Data // 非prop属性
  $refs: Data & TypeRefs // 引用
  $slots: UnwrapSlotsType<S> // 插槽
  $root: ComponentPublicInstance | null // 根组件实例
  $parent: ComponentPublicInstance | null // 父组件实例
  $host: Element | null // 宿主元素

  $emit: EmitFn<E>
  $el: TypeEl
  $options: Options & MergedComponentOptionsOverride
  $forceUpdate: () => void
  $nextTick: typeof nextTick
  $watch<T extends string | ((...args: any) => any)>(
    source: T,
    cb: T extends (...args: any) => infer R
      ? (...args: [R, R, OnCleanup]) => any
      : (...args: [any, any, OnCleanup]) => any,
    options?: WatchOptions,
  ): WatchStopHandle
} & ExposedKeys<
  IfAny<
    P,
    P,
    Readonly<Defaults> & Omit<P, keyof ShallowUnwrapRef<B> | keyof Defaults>
  > &
    ShallowUnwrapRef<B> &
    UnwrapNestedRefs<D> &
    ExtractComputedReturns<C> &
    M &
    ComponentCustomProperties &
    InjectToObject<I>,
  Exposed
>

/**
 * 公共属性映射类型
 * 定义了组件公共实例属性到其获取函数的映射
 */
export type PublicPropertiesMap = Record<
  string,
  (i: ComponentInternalInstance) => any
>

/**
 * 获取组件公共实例
 * 在Vue 3中，函数式组件没有公共实例代理，但它们存在于内部父链中
 * 对于依赖遍历公共$parent链的代码，跳过函数式组件，直接获取其父组件
 *
 * @param i 组件内部实例或null
 * @returns 组件公共实例、暴露的属性或null
 */
const getPublicInstance = (
  i: ComponentInternalInstance | null,
): ComponentPublicInstance | ComponentInternalInstance['exposed'] | null => {
  if (!i) return null
  if (isStatefulComponent(i)) return getComponentPublicInstance(i)
  return getPublicInstance(i.parent)
}

/**
 * 公共属性映射实现
 * 定义了组件公共属性的具体获取函数实现
 */
export const publicPropertiesMap: PublicPropertiesMap = 
  // 将PURE标记移到新行，以解决编译器因类型注释而丢弃它的问题
  /*@__PURE__*/ extend(Object.create(null), {
    $: i => i,
    $el: i => i.vnode.el,
    $data: i => i.data,
    $props: i => (__DEV__ ? shallowReadonly(i.props) : i.props),
    $attrs: i => (__DEV__ ? shallowReadonly(i.attrs) : i.attrs),
    $slots: i => (__DEV__ ? shallowReadonly(i.slots) : i.slots),
    $refs: i => (__DEV__ ? shallowReadonly(i.refs) : i.refs),
    $parent: i => getPublicInstance(i.parent),
    $root: i => getPublicInstance(i.root),
    $host: i => i.ce,
    $emit: i => i.emit,
    $options: i => (__FEATURE_OPTIONS_API__ ? resolveMergedOptions(i) : i.type),
    $forceUpdate: i =>
      i.f ||
      (i.f = () => {
        queueJob(i.update)
      }),
    $nextTick: i => i.n || (i.n = nextTick.bind(i.proxy!)),
    $watch: i => (__FEATURE_OPTIONS_API__ ? instanceWatch.bind(i) : NOOP),
  } as PublicPropertiesMap)

if (__COMPAT__) {
  installCompatInstanceProperties(publicPropertiesMap)
}

/**
 * 访问类型枚举
 * 定义了组件属性的不同访问类型
 */
enum AccessTypes {
  OTHER,      // 其他访问类型
  SETUP,      // 来自setup函数的访问
  DATA,       // 数据访问
  PROPS,      // 属性访问
  CONTEXT,    // 上下文访问
}

/**
 * 组件渲染上下文接口
 * 用于在渲染过程中访问组件实例的属性和方法
 */
export interface ComponentRenderContext {
  [key: string]: any  // 任意属性
  _: ComponentInternalInstance  // 组件内部实例引用
}

/**
 * 检查属性名是否以保留前缀开头
 * @param key 属性名
 * @returns 如果属性名以'_'或'$'开头则返回true，否则返回false
 */
export const isReservedPrefix = (key: string): key is '_' | '$' =>
  key === '_' || key === '$'

/**
 * 检查setup状态中是否包含指定的键
 * @param state setup状态对象
 * @param key 要检查的键
 * @returns 如果状态不为空对象、不是script setup且包含指定键则返回true
 */
const hasSetupBinding = (state: Data, key: string) =>
  state !== EMPTY_OBJ && !state.__isScriptSetup && hasOwn(state, key)

/**
 * 组件公共实例代理处理器
 * 拦截组件公共实例的属性访问、设置等操作
 * 负责处理数据、props、setup状态、上下文等属性的访问逻辑
 */
export const PublicInstanceProxyHandlers: ProxyHandler<any> = {
  get({ _: instance }: ComponentRenderContext, key: string) {
    if (key === ReactiveFlags.SKIP) {
      return true
    }

    const { ctx, setupState, data, props, accessCache, type, appContext } =
      instance

    // for internal formatters to know that this is a Vue instance
    if (__DEV__ && key === '__isVue') {
      return true
    }

    // data / props / ctx
    // This getter gets called for every property access on the render context
    // during render and is a major hotspot. The most expensive part of this
    // is the multiple hasOwn() calls. It's much faster to do a simple property
    // access on a plain object, so we use an accessCache object (with null
    // prototype) to memoize what access type a key corresponds to.
    let normalizedProps
    if (key[0] !== '$') {
      const n = accessCache![key]
      if (n !== undefined) {
        switch (n) {
          case AccessTypes.SETUP:
            return setupState[key]
          case AccessTypes.DATA:
            return data[key]
          case AccessTypes.CONTEXT:
            return ctx[key]
          case AccessTypes.PROPS:
            return props![key]
          // default: just fallthrough
        }
      } else if (hasSetupBinding(setupState, key)) {
        accessCache![key] = AccessTypes.SETUP
        return setupState[key]
      } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
        accessCache![key] = AccessTypes.DATA
        return data[key]
      } else if (
        // only cache other properties when instance has declared (thus stable)
        // props
        (normalizedProps = instance.propsOptions[0]) &&
        hasOwn(normalizedProps, key)
      ) {
        accessCache![key] = AccessTypes.PROPS
        return props![key]
      } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
        accessCache![key] = AccessTypes.CONTEXT
        return ctx[key]
      } else if (!__FEATURE_OPTIONS_API__ || shouldCacheAccess) {
        accessCache![key] = AccessTypes.OTHER
      }
    }

    const publicGetter = publicPropertiesMap[key]
    let cssModule, globalProperties
    // public $xxx properties
    if (publicGetter) {
      if (key === '$attrs') {
        track(instance.attrs, TrackOpTypes.GET, '')
        __DEV__ && markAttrsAccessed()
      } else if (__DEV__ && key === '$slots') {
        // for HMR only
        track(instance, TrackOpTypes.GET, key)
      }
      return publicGetter(instance)
    } else if (
      // css module (injected by vue-loader)
      (cssModule = type.__cssModules) &&
      (cssModule = cssModule[key])
    ) {
      return cssModule
    } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
      // user may set custom properties to `this` that start with `$`
      accessCache![key] = AccessTypes.CONTEXT
      return ctx[key]
    } else if (
      // global properties
      ((globalProperties = appContext.config.globalProperties),
      hasOwn(globalProperties, key))
    ) {
      if (__COMPAT__) {
        const desc = Object.getOwnPropertyDescriptor(globalProperties, key)!
        if (desc.get) {
          return desc.get.call(instance.proxy)
        } else {
          const val = globalProperties[key]
          return isFunction(val) ? extend(val.bind(instance.proxy), val) : val
        }
      } else {
        return globalProperties[key]
      }
    } else if (
      __DEV__ &&
      currentRenderingInstance &&
      (!isString(key) ||
        // #1091 avoid internal isRef/isVNode checks on component instance leading
        // to infinite warning loop
        key.indexOf('__v') !== 0)
    ) {
      if (data !== EMPTY_OBJ && isReservedPrefix(key[0]) && hasOwn(data, key)) {
        warn(
          `Property ${JSON.stringify(
            key,
          )} must be accessed via $data because it starts with a reserved ` +
            `character ("$" or "_") and is not proxied on the render context.`,
        )
      } else if (instance === currentRenderingInstance) {
        warn(
          `Property ${JSON.stringify(key)} was accessed during render ` +
            `but is not defined on instance.`,
        )
      }
    }
  },

  set(
    { _: instance }: ComponentRenderContext,
    key: string,
    value: any,
  ): boolean {
    const { data, setupState, ctx } = instance
    if (hasSetupBinding(setupState, key)) {
      setupState[key] = value
      return true
    } else if (
      __DEV__ &&
      setupState.__isScriptSetup &&
      hasOwn(setupState, key)
    ) {
      warn(`Cannot mutate <script setup> binding "${key}" from Options API.`)
      return false
    } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
      data[key] = value
      return true
    } else if (hasOwn(instance.props, key)) {
      __DEV__ && warn(`Attempting to mutate prop "${key}". Props are readonly.`)
      return false
    }
    if (key[0] === '$' && key.slice(1) in instance) {
      __DEV__ &&
        warn(
          `Attempting to mutate public property "${key}". ` +
            `Properties starting with $ are reserved and readonly.`,
        )
      return false
    } else {
      if (__DEV__ && key in instance.appContext.config.globalProperties) {
        Object.defineProperty(ctx, key, {
          enumerable: true,
          configurable: true,
          value,
        })
      } else {
        ctx[key] = value
      }
    }
    return true
  },

  has(
    {
      _: { data, setupState, accessCache, ctx, appContext, propsOptions },
    }: ComponentRenderContext,
    key: string,
  ) {
    let normalizedProps
    return (
      !!accessCache![key] ||
      (data !== EMPTY_OBJ && hasOwn(data, key)) ||
      hasSetupBinding(setupState, key) ||
      ((normalizedProps = propsOptions[0]) && hasOwn(normalizedProps, key)) ||
      hasOwn(ctx, key) ||
      hasOwn(publicPropertiesMap, key) ||
      hasOwn(appContext.config.globalProperties, key)
    )
  },

  defineProperty(
    target: ComponentRenderContext,
    key: string,
    descriptor: PropertyDescriptor,
  ) {
    if (descriptor.get != null) {
      // invalidate key cache of a getter based property #5417
      target._.accessCache![key] = 0
    } else if (hasOwn(descriptor, 'value')) {
      this.set!(target, key, descriptor.value, null)
    }
    return Reflect.defineProperty(target, key, descriptor)
  },
}

if (__DEV__ && !__TEST__) {
  PublicInstanceProxyHandlers.ownKeys = (target: ComponentRenderContext) => {
    warn(
      `Avoid app logic that relies on enumerating keys on a component instance. ` +
        `The keys will be empty in production mode to avoid performance overhead.`,
    )
    return Reflect.ownKeys(target)
  }
}

/**
 * 运行时编译的组件公共实例代理处理器
 * 扩展自PublicInstanceProxyHandlers，用于处理运行时编译的组件实例
 */
export const RuntimeCompiledPublicInstanceProxyHandlers: ProxyHandler<any> = 
  /*@__PURE__*/ extend({}, PublicInstanceProxyHandlers, {
    get(target: ComponentRenderContext, key: string) {
      // fast path for unscopables when using `with` block
      if ((key as any) === Symbol.unscopables) {
        return
      }
      return PublicInstanceProxyHandlers.get!(target, key, target)
    },
    has(_: ComponentRenderContext, key: string) {
      const has = key[0] !== '_' && !isGloballyAllowed(key)
      if (__DEV__ && !has && PublicInstanceProxyHandlers.has!(_, key)) {
        warn(
          `Property ${JSON.stringify(
            key,
          )} should not start with _ which is a reserved prefix for Vue internals.`,
        )
      }
      return has
    },
  })

/**
 * 创建开发环境下的渲染上下文
 * 在开发模式下，代理目标暴露与`this`相同的属性，以便于控制台检查
 * 在生产模式下，它将是一个空对象，因此可以跳过这些属性定义
 *
 * @param instance 组件内部实例
 * @returns 开发环境下的渲染上下文
 */
export function createDevRenderContext(instance: ComponentInternalInstance) {
  const target: Record<string, any> = {}

  // expose internal instance for proxy handlers
  Object.defineProperty(target, `_`, {
    configurable: true,
    enumerable: false,
    get: () => instance,
  })

  // expose public properties
  Object.keys(publicPropertiesMap).forEach(key => {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: false,
      get: () => publicPropertiesMap[key](instance),
      // intercepted by the proxy so no need for implementation,
      // but needed to prevent set errors
      set: NOOP,
    })
  })

  return target as ComponentRenderContext
}

/**
 * 在渲染上下文中暴露props
 * 仅在开发环境中使用
 *
 * @param instance 组件内部实例
 */
export function exposePropsOnRenderContext(
  instance: ComponentInternalInstance,
): void {
  const {
    ctx,
    propsOptions: [propsOptions],
  } = instance
  if (propsOptions) {
    Object.keys(propsOptions).forEach(key => {
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => instance.props[key],
        set: NOOP,
      })
    })
  }
}

/**
 * 在渲染上下文中暴露setup状态
 * 仅在开发环境中使用
 *
 * @param instance 组件内部实例
 */
export function exposeSetupStateOnRenderContext(
  instance: ComponentInternalInstance,
): void {
  const { ctx, setupState } = instance
  Object.keys(toRaw(setupState)).forEach(key => {
    if (!setupState.__isScriptSetup) {
      if (isReservedPrefix(key[0])) {
        warn(
          `setup() return property ${JSON.stringify(
            key,
          )} should not start with "$" or "_" ` +
            `which are reserved prefixes for Vue internals.`,
        )
        return
      }
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => setupState[key],
        set: NOOP,
      })
    }
  })
}
