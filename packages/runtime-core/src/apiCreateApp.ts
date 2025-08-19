// Vue 3 核心模块 - 应用创建 API
// 此模块负责创建和管理 Vue 应用实例
import {
  type Component,
  type ComponentInternalInstance,
  type ConcreteComponent,
  type Data,
  getComponentPublicInstance,
  validateComponentName,
} from './component'
import type {
  ComponentOptions,
  MergedComponentOptions,
  RuntimeCompilerOptions,
} from './componentOptions'
import type {
  ComponentCustomProperties,
  ComponentPublicInstance,
} from './componentPublicInstance'
import { type Directive, validateDirectiveName } from './directives'
import type { ElementNamespace, RootRenderFunction } from './renderer'
import type { InjectionKey } from './apiInject'
import { warn } from './warning'
import { type VNode, cloneVNode, createVNode } from './vnode'
import type { RootHydrateFunction } from './hydration'
import { devtoolsInitApp, devtoolsUnmountApp } from './devtools'
import { NO, extend, hasOwn, isFunction, isObject } from '@vue/shared'
import { version } from '.'
import { installAppCompatProperties } from './compat/global'
import type { NormalizedPropsOptions } from './componentProps'
import type { ObjectEmitsOptions } from './componentEmits'
import { ErrorCodes, callWithAsyncErrorHandling } from './errorHandling'
import type { DefineComponent } from './apiDefineComponent'

/**
 * Vue 应用实例接口
 * @template HostElement - 宿主元素类型
 */
export interface App<HostElement = any> {
  version: string
  config: AppConfig

  /**
     * 安装插件
     * @template Options - 插件选项类型
     * @param plugin - 要安装的插件
     * @param options - 插件选项
     * @returns 应用实例本身
     */
    use<Options extends unknown[]>(
    plugin: Plugin<Options>,
    ...options: NoInfer<Options>
  ): this
  use<Options>(plugin: Plugin<Options>, options: NoInfer<Options>): this

  /**
     * 全局混入组件选项
     * @param mixin - 要混入的组件选项
     * @returns 应用实例本身
     */
    mixin(mixin: ComponentOptions): this
  /**
     * 获取已注册的组件
     * @param name - 组件名称
     * @returns 组件定义或undefined
     */
    component(name: string): Component | undefined
  /**
     * 注册组件
     * @template T - 组件类型
     * @param name - 组件名称
     * @param component - 组件定义
     * @returns 应用实例本身
     */
    component<T extends Component | DefineComponent>(
    name: string,
    component: T,
  ): this
  /**
     * 获取已注册的指令
     * @template HostElement - 宿主元素类型
     * @template Value - 指令值类型
     * @template Modifiers - 指令修饰符类型
     * @template Arg - 指令参数类型
     * @param name - 指令名称
     * @returns 指令定义或undefined
     */
    /**
     * 注册指令
     * @template HostElement - 宿主元素类型
     * @template Value - 指令值类型
     * @template Modifiers - 指令修饰符类型
     * @template Arg - 指令参数类型
     * @param name - 指令名称
     * @param directive - 指令定义
     * @returns 应用实例本身
     */
    directive<
    HostElement = any,
    Value = any,
    Modifiers extends string = string,
    Arg extends string = string,
  >(
    name: string,
  ): Directive<HostElement, Value, Modifiers, Arg> | undefined
  directive<
    HostElement = any,
    Value = any,
    Modifiers extends string = string,
    Arg extends string = string,
  >(
    name: string,
    directive: Directive<HostElement, Value, Modifiers, Arg>,
  ): this
  mount(
    rootContainer: HostElement | string,
    /**
     * @internal
     */
    isHydrate?: boolean,
    /**
     * @internal
     */
    namespace?: boolean | ElementNamespace,
    /**
     * @internal
     */
    vnode?: VNode,
  ): ComponentPublicInstance
  /**
     * 卸载应用
     */
    unmount(): void
  /**
     * 注册应用卸载时的回调
     * @param cb - 回调函数
     */
    onUnmount(cb: () => void): void
  /**
     * 提供全局依赖项
     * @template T - 依赖项类型
     * @template K - 依赖项键类型
     * @param key - 依赖项键
     * @param value - 依赖项值
     * @returns 应用实例本身
     */
    provide<T, K = InjectionKey<T> | string | number>(
    key: K,
    value: K extends InjectionKey<infer V> ? V : T,
  ): this

  /**
   * Runs a function with the app as active instance. This allows using of `inject()` within the function to get access
   * to variables provided via `app.provide()`.
   *
   * @param fn - function to run with the app as active instance
   */
  /**
     * 在应用上下文中运行函数
     * @template T - 函数返回值类型
     * @param fn - 要运行的函数
     * @returns 函数执行结果
     */
    runWithContext<T>(fn: () => T): T

  // internal, but we need to expose these for the server-renderer and devtools
  _uid: number
  _component: ConcreteComponent
  _props: Data | null
  _container: HostElement | null
  _context: AppContext
  _instance: ComponentInternalInstance | null

  /**
   * @internal custom element vnode
   */
  _ceVNode?: VNode

  /**
   * v2 compat only
   */
  filter?(name: string): Function | undefined
  filter?(name: string, filter: Function): this

  /**
   * @internal v3 compat only
   */
  _createRoot?(options: ComponentOptions): ComponentPublicInstance
}

export type OptionMergeFunction = (to: unknown, from: unknown) => any

/**
 * 应用配置接口
 * 包含应用的各种配置选项
 */
export interface AppConfig {
  // @private
  readonly isNativeTag: (tag: string) => boolean

  performance: boolean
  optionMergeStrategies: Record<string, OptionMergeFunction>
  globalProperties: ComponentCustomProperties & Record<string, any>
  errorHandler?: (
    err: unknown,
    instance: ComponentPublicInstance | null,
    info: string,
  ) => void
  warnHandler?: (
    msg: string,
    instance: ComponentPublicInstance | null,
    trace: string,
  ) => void

  /**
   * Options to pass to `@vue/compiler-dom`.
   * Only supported in runtime compiler build.
   */
  compilerOptions: RuntimeCompilerOptions

  /**
   * @deprecated use config.compilerOptions.isCustomElement
   */
  isCustomElement?: (tag: string) => boolean

  /**
   * TODO document for 3.5
   * Enable warnings for computed getters that recursively trigger itself.
   */
  warnRecursiveComputed?: boolean

  /**
   * Whether to throw unhandled errors in production.
   * Default is `false` to avoid crashing on any error (and only logs it)
   * But in some cases, e.g. SSR, throwing might be more desirable.
   */
  throwUnhandledErrorInProduction?: boolean

  /**
   * Prefix for all useId() calls within this app
   */
  idPrefix?: string
}

/**
 * 应用上下文接口
 * 存储应用的全局状态和配置
 */
export interface AppContext {
  app: App // for devtools
  config: AppConfig
  mixins: ComponentOptions[]
  components: Record<string, Component>
  directives: Record<string, Directive>
  provides: Record<string | symbol, any>

  /**
   * Cache for merged/normalized component options
   * Each app instance has its own cache because app-level global mixins and
   * optionMergeStrategies can affect merge behavior.
   * @internal
   */
  optionsCache: WeakMap<ComponentOptions, MergedComponentOptions>
  /**
   * Cache for normalized props options
   * @internal
   */
  propsCache: WeakMap<ConcreteComponent, NormalizedPropsOptions>
  /**
   * Cache for normalized emits options
   * @internal
   */
  emitsCache: WeakMap<ConcreteComponent, ObjectEmitsOptions | null>
  /**
   * HMR only
   * @internal
   */
  reload?: () => void
  /**
   * v2 compat only
   * @internal
   */
  filters?: Record<string, Function>
}

type PluginInstallFunction<Options = any[]> = Options extends unknown[]
  ? (app: App, ...options: Options) => any
  : (app: App, options: Options) => any

export type ObjectPlugin<Options = any[]> = {
  install: PluginInstallFunction<Options>
}
export type FunctionPlugin<Options = any[]> = PluginInstallFunction<Options> &
  Partial<ObjectPlugin<Options>>

export type Plugin<
  Options = any[],
  // TODO: in next major Options extends unknown[] and remove P
  P extends unknown[] = Options extends unknown[] ? Options : [Options],
> = FunctionPlugin<P> | ObjectPlugin<P>

/**
 * 创建应用上下文
 * @returns 新的应用上下文对象
 */
export function createAppContext(): AppContext {
  return {
    app: null as any,
    config: {
      isNativeTag: NO,
      performance: false,
      globalProperties: {},
      optionMergeStrategies: {},
      errorHandler: undefined,
      warnHandler: undefined,
      compilerOptions: {},
    },
    mixins: [],
    components: {},
    directives: {},
    provides: Object.create(null),
    optionsCache: new WeakMap(),
    propsCache: new WeakMap(),
    emitsCache: new WeakMap(),
  }
}

export type CreateAppFunction<HostElement> = (
  rootComponent: Component,
  rootProps?: Data | null,
) => App<HostElement>

let uid = 0

/**
 * 创建应用 API 函数
 * @template HostElement - 宿主元素类型
 * @param render - 根渲染函数
 * @param hydrate - 根水合函数（可选）
 * @returns 创建应用的函数
 */
export function createAppAPI<HostElement>(
  render: RootRenderFunction<HostElement>,
  hydrate?: RootHydrateFunction,
): CreateAppFunction<HostElement> {
  return function createApp(rootComponent, rootProps = null) {
    if (!isFunction(rootComponent)) {
      rootComponent = extend({}, rootComponent)
    }

    if (rootProps != null && !isObject(rootProps)) {
      __DEV__ && warn(`root props passed to app.mount() must be an object.`)
      rootProps = null
    }

    const context = createAppContext()
    // 已安装插件集合，用于防止重复安装
    const installedPlugins = new WeakSet()
    const pluginCleanupFns: Array<() => any> = []

    // 应用挂载状态标记
    let isMounted = false

    const app: App = (context.app = {
      _uid: uid++,
      _component: rootComponent as ConcreteComponent,
      _props: rootProps,
      _container: null,
      _context: context,
      // 初始化根实例为null
  _instance: null,

      version,

      get config() {
        return context.config
      },

      set config(v) {
        if (__DEV__) {
          warn(
            `app.config cannot be replaced. Modify individual options instead.`,
          )
        }
      },

      use(plugin: Plugin, ...options: any[]) {
        if (installedPlugins.has(plugin)) {
      __DEV__ && warn(`Plugin has already been applied to target app.`)
    } else if (plugin && isFunction(plugin.install)) {
      // 标记插件为已安装
      installedPlugins.add(plugin)
          plugin.install(app, ...options)
        } else if (isFunction(plugin)) {
      // 标记插件为已安装
      installedPlugins.add(plugin)
          plugin(app, ...options)
        } else if (__DEV__) {
          warn(
            `A plugin must either be a function or an object with an "install" ` +
              `function.`,
          )
        }
        return app
      },

      mixin(mixin: ComponentOptions) {
        if (__FEATURE_OPTIONS_API__) {
          if (!context.mixins.includes(mixin)) {
            context.mixins.push(mixin)
          } else if (__DEV__) {
            warn(
              'Mixin has already been applied to target app' +
                (mixin.name ? `: ${mixin.name}` : ''),
            )
          }
        } else if (__DEV__) {
          warn('Mixins are only available in builds supporting Options API')
        }
        return app
      },

      component(name: string, component?: Component): any {
        if (__DEV__) {
          validateComponentName(name, context.config)
        }
        if (!component) {
          return context.components[name]
        }
        if (__DEV__ && context.components[name]) {
          warn(`Component "${name}" has already been registered in target app.`)
        }
        context.components[name] = component
        return app
      },

      directive(name: string, directive?: Directive) {
        if (__DEV__) {
          validateDirectiveName(name)
        }

        if (!directive) {
          return context.directives[name] as any
        }
        if (__DEV__ && context.directives[name]) {
          warn(`Directive "${name}" has already been registered in target app.`)
        }
        context.directives[name] = directive
        return app
      },

      /**
     * 挂载应用
     * @param rootContainer - 根容器元素
     * @param isHydrate - 是否进行水合（服务端渲染）
     * @param namespace - 元素命名空间
     * @param vnode - 自定义vnode（内部使用）
     * @returns 根组件的公共实例
     */
    mount(
        rootContainer: HostElement,
        isHydrate?: boolean,
        namespace?: boolean | ElementNamespace,
      ): any {
        if (!isMounted) {
          // #5571
          if (__DEV__ && (rootContainer as any).__vue_app__) {
            warn(
              `There is already an app instance mounted on the host container.\n` +
                ` If you want to mount another app on the same host container,` +
                ` you need to unmount the previous app by calling \`app.unmount()\` first.`,
            )
          }
          // 创建根组件的vnode
          const vnode = app._ceVNode || createVNode(rootComponent, rootProps)
          // 将应用上下文存储在vnode上，以便子组件可以访问
          vnode.appContext = context

          if (namespace === true) {
            namespace = 'svg'
          } else if (namespace === false) {
            namespace = undefined
          }

          // HMR root reload
          if (__DEV__) {
            context.reload = () => {
              const cloned = cloneVNode(vnode)
              // avoid hydration for hmr updating
              cloned.el = null
              // casting to ElementNamespace because TS doesn't guarantee type narrowing
              // over function boundaries
              render(cloned, rootContainer, namespace as ElementNamespace)
            }
          }

          if (isHydrate && hydrate) {
            hydrate(vnode as VNode<Node, Element>, rootContainer as any)
          } else {
            render(vnode, rootContainer, namespace)
          }
          // 标记应用为已挂载状态
          isMounted = true
          app._container = rootContainer
          // for devtools and telemetry
          ;(rootContainer as any).__vue_app__ = app

          // 只在应用未挂载且开发环境或生产环境开发工具功能启用时执行
          if ((__DEV__ || __FEATURE_PROD_DEVTOOLS__)) {
            app._instance = vnode.component
            devtoolsInitApp(app, version)
          }

          return getComponentPublicInstance(vnode.component!)
        } else // 开发环境下，添加组件渲染的调试信息
      if (__DEV__) {
        warn(
          `App has already been mounted.\n` +
            `If you want to remount the same app, move your app creation logic ` +
            `into a factory function and create fresh app instances for each ` +
            `mount - e.g. \`const createMyApp = () => createApp(App)\``,
        )
        }
      },

      onUnmount(cleanupFn: () => void) {
        if (__DEV__ && typeof cleanupFn !== 'function') {
          warn(
            `Expected function as first argument to app.onUnmount(), ` +
              `but got ${typeof cleanupFn}`,
          )
        }
        pluginCleanupFns.push(cleanupFn)
      },

      unmount() {
        if (isMounted) {
          callWithAsyncErrorHandling(
            pluginCleanupFns,
            app._instance,
            ErrorCodes.APP_UNMOUNT_CLEANUP,
          )
          // 清空渲染内容
          render(null, app._container)
          if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
            app._instance = null
            devtoolsUnmountApp(app)
          }
          // 删除容器上的应用实例引用
            delete app._container.__vue_app__
        } else if (__DEV__) {
          warn(`Cannot unmount an app that is not mounted.`)
        }
      },

      provide(key, value) {
        if (__DEV__ && (key as string | symbol) in context.provides) {
          if (hasOwn(context.provides, key as string | symbol)) {
            warn(
              `App already provides property with key "${String(key)}". ` +
                `It will be overwritten with the new value.`,
            )
          } else {
            // #13212, context.provides can inherit the provides object from parent on custom elements
            warn(
              `App already provides property with key "${String(key)}" inherited from its parent element. ` +
                `It will be overwritten with the new value.`,
            )
          }
        }

        context.provides[key as string | symbol] = value

        return app
      },

      runWithContext(fn) {
        // 保存当前应用实例
          const lastApp = currentApp
        currentApp = app
        try {
          return fn()
        } finally {
          // 恢复之前的应用实例
            currentApp = lastApp
        }
      },
    })

    if (__COMPAT__) {
      installAppCompatProperties(app, context, render)
    }

    return app
  }
}

/**
 * @internal Used to identify the current app when using `inject()` within
 * `app.runWithContext()`.
 */
export let currentApp: App<unknown> | null = null
