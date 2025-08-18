/**
 * Vue运行时核心 - 异步组件API
 * 提供定义和处理异步加载组件的功能
 * @packageDocumentation
 */
// 导入核心组件类型和实例相关API
import {
  type Component,
  type ComponentInternalInstance,
  type ComponentOptions,
  type ConcreteComponent,
  currentInstance,
  getComponentName,
  isInSSRComponentSetup,
} from './component'
// 导入共享工具函数
import { isFunction, isObject } from '@vue/shared'
// 导入组件公共实例类型
import type { ComponentPublicInstance } from './componentPublicInstance'
// 导入vnode相关类型和API
import { type VNode, createVNode } from './vnode'
// 导入定义组件API
import { defineComponent } from './apiDefineComponent'
import { warn } from './warning'
// 导入响应式工具
import { ref } from '@vue/reactivity'
// 导入错误处理相关API
import { ErrorCodes, handleError } from './errorHandling'
// 导入KeepAlive组件相关工具
import { isKeepAlive } from './components/KeepAlive'
// 导入异步边界标记工具
import { markAsyncBoundary } from './helpers/useId'
// 导入 hydration 策略相关类型和工具
import { type HydrationStrategy, forEachElement } from './hydrationStrategies'

/**
 * 异步组件解析结果类型
 * 支持直接返回组件或包含default属性的模块对象
 * @typeParam T - 组件类型
 */
export type AsyncComponentResolveResult<T = Component> = T | { default: T } // es modules

/**
 * 异步组件加载器类型
 * 返回一个解析为异步组件结果的Promise
 * @typeParam T - 组件类型
 */
export type AsyncComponentLoader<T = any> = () => Promise<
  AsyncComponentResolveResult<T>
>

/**
 * 异步组件选项接口
 * 提供配置异步组件行为的选项
 * @typeParam T - 组件类型
 */
export interface AsyncComponentOptions<T = any> {
  /**
   * 加载组件的函数
   */
  loader: AsyncComponentLoader<T>
  /**
   * 加载过程中显示的组件
   */
  loadingComponent?: Component
  /**
   * 加载失败时显示的组件
   */
  errorComponent?: Component
  /**
   * 显示加载组件前的延迟时间(毫秒)
   * @default 200
   */
  delay?: number
  /**
   * 加载超时时间(毫秒)
   * undefined表示永不超时
   */
  timeout?: number
  /**
   * 是否可被Suspense控制
   * @default true
   */
  suspensible?: boolean
  /**
   * 水合策略
   */
  hydrate?: HydrationStrategy
  /**
   * 错误处理函数
   * @param error - 错误对象
   * @param retry - 重试加载的函数
   * @param fail - 标记加载失败的函数
   * @param attempts - 当前尝试次数
   */
  onError?: (
    error: Error,
    retry: () => void,
    fail: () => void,
    attempts: number,
  ) => any
}

/**
 * 检查一个实例或VNode是否是异步组件包装器
 * @param i - 组件内部实例或VNode
 * @returns 是否是异步组件包装器
 */
export const isAsyncWrapper = (i: ComponentInternalInstance | VNode): boolean =>
  !!(i.type as ComponentOptions).__asyncLoader

/**
 * 定义一个异步组件
 * 支持两种形式：直接传入加载器函数或传入配置选项
 * @param source - 异步组件加载器函数或配置选项
 * @returns 包装后的异步组件
 */
/*! #__NO_SIDE_EFFECTS__ */
export function defineAsyncComponent<
  T extends Component = { new (): ComponentPublicInstance },
>(source: AsyncComponentLoader<T> | AsyncComponentOptions<T>): T {
  // 规范化参数：如果传入的是函数，则包装为选项对象
  if (isFunction(source)) {
    source = { loader: source }
  }

  // 解构选项对象
  const {
    loader,
    loadingComponent,
    errorComponent,
    delay = 200, // 默认延迟200ms显示加载组件
    hydrate: hydrateStrategy, // 水合策略
    timeout, // 超时时间，undefined表示永不超时
    suspensible = true, // 默认可被Suspense控制
    onError: userOnError, // 用户定义的错误处理函数
  } = source

  // 当前挂起的请求
  let pendingRequest: Promise<ConcreteComponent> | null = null
  // 已解析的组件
  let resolvedComp: ConcreteComponent | undefined

  // 重试次数
  let retries = 0
  /**
   * 重试加载组件
   * @returns 重新加载的Promise
   */
  const retry = () => {
    retries++
    pendingRequest = null
    return load()
  }

/**
   * 加载异步组件
   * @returns 解析为具体组件的Promise
   */
  const load = (): Promise<ConcreteComponent> => {
    let thisRequest: Promise<ConcreteComponent>
    // 如果已有挂起的请求，则复用，否则创建新请求
    return (
      pendingRequest ||
      (thisRequest = pendingRequest =
        loader()
          .catch(err => {
            // 规范化错误对象
            err = err instanceof Error ? err : new Error(String(err))
            if (userOnError) {
              // 如果用户提供了错误处理函数，则调用它
              return new Promise((resolve, reject) => {
                const userRetry = () => resolve(retry())
                const userFail = () => reject(err)
                userOnError(err, userRetry, userFail, retries + 1)
              })
            } else {
              // 否则直接抛出错误
              throw err
            }
          })
          .then((comp: any) => {
            // 如果当前请求已不是最新的，则返回最新请求
            if (thisRequest !== pendingRequest && pendingRequest) {
              return pendingRequest
            }
            if (__DEV__ && !comp) {
              warn(
                `Async component loader resolved to undefined. ` +
                  `If you are using retry(), make sure to return its return value.`,
              )
            }
            // 处理ES模块默认导出
            if (
              comp &&
              (comp.__esModule || comp[Symbol.toStringTag] === 'Module')
            ) {
              comp = comp.default
            }
            // 验证组件有效性
            if (__DEV__ && comp && !isObject(comp) && !isFunction(comp)) {
              throw new Error(`Invalid async component load result: ${comp}`)
            }
            // 缓存已解析的组件
            resolvedComp = comp
            return comp
          }))
    )
  }

  // 返回一个包装后的异步组件
  return defineComponent({
    name: 'AsyncComponentWrapper',

      /**
       * 异步加载器函数
       * @internal
       */
    __asyncLoader: load,

    /**
     * 异步组件水合方法
     * @param el - DOM元素
     * @param instance - 组件实例
     * @param hydrate - 水合函数
     * @internal
     */
    __asyncHydrate(el, instance, hydrate) {
        // 标记组件是否已被修补
        let patched = false
        // 在组件挂载完成后标记为已修补
        ;(instance.bu || (instance.bu = [])).push(() => (patched = true))
        // 执行水合的函数
        const performHydrate = () => {
          // 如果组件已被修补，则跳过水合
          if (patched) {
            if (__DEV__) {
              warn(
                `Skipping lazy hydration for component '${getComponentName(resolvedComp!) || resolvedComp!.__file}': ` +
                  `it was updated before lazy hydration performed.`,
              )
            }
            return
          }
          // 执行水合
          hydrate()
        }
        // 根据是否有水合策略创建水合函数
        const doHydrate = hydrateStrategy
          ? () => {
              const teardown = hydrateStrategy(performHydrate, cb =>
                forEachElement(el, cb),
              )
              // 如果有水合清理函数，则添加到组件卸载钩子中
              if (teardown) {
                ;(instance.bum || (instance.bum = [])).push(teardown)
              }
            }
          : performHydrate
        // 如果组件已解析，则立即执行水合
        if (resolvedComp) {
          doHydrate()
        } else {
          // 否则加载组件后再执行水合
          load().then(() => !instance.isUnmounted && doHydrate())
        }
      },

    /**
       * 获取已解析的组件
       * @returns 已解析的组件或undefined
       * @internal
       */
      get __asyncResolved() {
        return resolvedComp
      },

    /**
       * 组件设置函数
       * 处理异步组件的加载、错误和状态管理
       * @returns 渲染函数
       */
      setup() {
        // 获取当前组件实例
        const instance = currentInstance!
        // 标记为异步边界
        markAsyncBoundary(instance)

        // 如果组件已解析，直接返回渲染函数
        if (resolvedComp) {
          return () => createInnerComp(resolvedComp!, instance)
        }

        // 定义错误处理函数
        const onError = (err: Error) => {
          // 清除挂起的请求
          pendingRequest = null
          // 处理错误
          handleError(
            err,
            instance,
            ErrorCodes.ASYNC_COMPONENT_LOADER,
            !errorComponent /* 如果提供了错误组件，在开发环境不抛出错误 */,
          )
        }

      // 处理Suspense控制或SSR情况
        if (
          // 如果支持Suspense且组件可被Suspense控制，并且有Suspense实例
          (__FEATURE_SUSPENSE__ && suspensible && instance.suspense) ||
          // 或者在SSR组件设置中
          (__SSR__ && isInSSRComponentSetup)
        ) {
          // 直接返回加载Promise
          return load()
            .then(comp => {
              // 加载成功，返回渲染函数
              return () => createInnerComp(comp, instance)
            })
            .catch(err => {
              // 加载失败，处理错误
              onError(err)
              // 返回错误组件或null
              return () =>
                errorComponent
                  ? createVNode(errorComponent as ConcreteComponent, {
                    error: err,
                  })
                  : null
            })
        }

      // 标记组件是否已加载完成
        const loaded = ref(false)
      // 错误状态
        const error = ref()
        // 是否需要延迟显示加载组件
        const delayed = ref(!!delay)

      // 处理延迟显示加载组件的逻辑
        if (delay) {
          const timer = setTimeout(() => {
            // 延迟后设置delayed为false，显示加载组件
            delayed.value = false
          }, delay)
          // 在组件卸载时清除定时器
          ;(instance.bm || (instance.bm = [])).push(() => clearTimeout(timer))
        }

      // 处理加载超时逻辑
        if (timeout != null) {
          const timer = setTimeout(() => {
            if (!loaded.value && !error.value) {
              const err = new Error(
                `Async component timed out after ${timeout}ms.`,
              )
              // 处理超时错误
              onError(err)
              // 设置错误状态
              error.value = err
            }
          }, timeout)
          // 在组件卸载时清除定时器
          ;(instance.bm || (instance.bm = [])).push(() => clearTimeout(timer))
        }

      // 开始加载组件
      // 开始加载组件
        load()
          .then(() => {
            // 标记加载完成
            loaded.value = true
            // 如果父组件是KeepAlive，强制更新以确保加载的组件名称被考虑
            if (instance.parent && isKeepAlive(instance.parent.vnode)) {
              instance.parent.update()
            }
          })
        .catch(err => {
          // 处理加载错误
          onError(err)
          // 设置错误状态
          error.value = err
        })

      // 返回渲染函数，根据不同状态渲染不同内容
      return () => {
        // 如果组件已加载完成且已解析，则渲染解析后的组件
        if (loaded.value && resolvedComp) {
          return createInnerComp(resolvedComp, instance)
        } 
        // 如果有错误且提供了错误组件，则渲染错误组件
        else if (error.value && errorComponent) {
          return createVNode(errorComponent, {
            error: error.value,
          })
        } 
        // 如果提供了加载组件且延迟时间已过，则渲染加载组件
        else if (loadingComponent && !delayed.value) {
          return createVNode(loadingComponent)
        }
        // 其他情况不渲染任何内容
      }
    },
  }) as T
}

/**
 * 创建内部组件的vnode
 * @param comp - 具体组件
 * @param parent - 父组件实例
 * @returns 创建的组件vnode
 */
function createInnerComp(
  comp: ConcreteComponent,
  parent: ComponentInternalInstance,
) {
  // 从父组件vnode中解构所需属性
  const { ref, props, children, ce } = parent.vnode
  // 创建内部组件的vnode
  const vnode = createVNode(comp, props, children)
  // 确保内部组件继承异步包装器的ref所有者
  vnode.ref = ref
  // 将自定义元素回调传递给内部组件
  // 并从异步包装器中移除
  vnode.ce = ce
  delete parent.vnode.ce

  // 返回创建的vnode
  return vnode
}
