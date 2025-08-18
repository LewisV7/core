/**
 * 依赖注入 API
 * 提供了 provide 和 inject 函数，用于组件之间的数据传递
 */
import { isFunction } from '@vue/shared'
import { currentInstance, getCurrentInstance } from './component'
import { currentApp } from './apiCreateApp'
import { warn } from './warning'

/**
 * 注入约束接口
 * @internal
 */
interface InjectionConstraint<T> {}

/**
 * 注入键类型
 * 用于类型安全的依赖注入
 */
export type InjectionKey<T> = symbol & InjectionConstraint<T>

/**
 * 提供一个值，使其可被后代组件注入
 * @param key - 注入的键，可以是字符串、数字或 InjectionKey
 * @param value - 要提供的值
 */
export function provide<T, K = InjectionKey<T> | string | number>(
  key: K,
  value: K extends InjectionKey<infer V> ? V : T,
): void {
  // 检查是否在组件 setup 中调用
  if (!currentInstance) {
    if (__DEV__) {
      warn(`provide() 只能在 setup() 中使用。`)
    }
  } else {
    let provides = currentInstance.provides
    // 默认情况下，实例继承其父级的 provides 对象
    // 但当它需要提供自己的值时，会创建自己的 provides 对象
    // 使用父级 provides 对象作为原型，这样在 inject 时可以简单地
    // 从直接父级查找注入，并让原型链完成工作
    const parentProvides = 
      currentInstance.parent && currentInstance.parent.provides
    if (parentProvides === provides) {
      provides = currentInstance.provides = Object.create(parentProvides)
    }
    // TS 不允许使用 symbol 作为索引类型
    provides[key as string] = value
  }
}

/**
 * 注入一个由祖先组件提供的值
 * @param key - 要注入的键
 * @returns 注入的值或 undefined
 */
export function inject<T>(key: InjectionKey<T> | string): T | undefined
/**
 * 注入一个由祖先组件提供的值，如果不存在则使用默认值
 * @param key - 要注入的键
 * @param defaultValue - 默认值
 * @param treatDefaultAsFactory - 是否将默认值视为工厂函数
 * @returns 注入的值或默认值
 */
export function inject<T>(
  key: InjectionKey<T> | string,
  defaultValue: T,
  treatDefaultAsFactory?: false,
): T
/**
 * 注入一个由祖先组件提供的值，如果不存在则使用工厂函数生成默认值
 * @param key - 要注入的键
 * @param defaultValue - 生成默认值的工厂函数
 * @param treatDefaultAsFactory - 是否将默认值视为工厂函数（必须为 true）
 * @returns 注入的值或工厂函数生成的值
 */
export function inject<T>(
  key: InjectionKey<T> | string,
  defaultValue: T | (() => T),
  treatDefaultAsFactory: true,
): T
/**
 * 注入一个由祖先组件提供的值的实现函数
 */
export function inject(
  key: InjectionKey<any> | string,
  defaultValue?: unknown,
  treatDefaultAsFactory = false,
) {
  // 回退到 currentRenderingInstance，以便在函数式组件中调用
  const instance = getCurrentInstance()

  // 也支持从应用级别提供的值中查找（使用 app.runWithContext()）
  if (instance || currentApp) {
    // #2400 支持 app.use 插件
    // 如果实例是根组件，则回退到 appContext 的 provides
    // #11488 在嵌套的 createApp 中，优先使用 currentApp 的 provides
    // #13212 对于自定义元素，必须从其 appContext 获取注入值
    // 因为它已经继承了父元素的 provides 对象
    let provides = currentApp
      ? currentApp._context.provides
      : instance
        ? instance.parent == null || instance.ce
          ? instance.vnode.appContext && instance.vnode.appContext.provides
          : instance.parent.provides
        : undefined

    // 检查是否存在注入的值
    if (provides && (key as string | symbol) in provides) {
      // TS 不允许使用 symbol 作为索引类型
      return provides[key as string]
    } else if (arguments.length > 1) {
      // 如果提供了默认值，且 treatDefaultAsFactory 为 true 且默认值是函数
      // 则调用该函数生成默认值，否则直接使用默认值
      return treatDefaultAsFactory && isFunction(defaultValue)
        ? defaultValue.call(instance && instance.proxy)
        : defaultValue
    } else if (__DEV__) {
      warn(`未找到注入 "${String(key)}"。`)
    }
  } else if (__DEV__) {
    warn(`inject() 只能在 setup() 或函数式组件中使用。`)
  }
}

/**
 * 检查是否可以使用 `inject()` 而不会警告在错误的地方调用（例如在 setup() 之外）
 * 这被希望在内部使用 `inject()` 而不向最终用户触发警告的库使用
 * 例如 `vue-router` 中的 `useRoute()`
 * @returns 如果可以使用 inject() 则返回 true
 */
export function hasInjectionContext(): boolean {
  return !!(getCurrentInstance() || currentApp)
}
