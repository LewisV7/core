/**
 * 生命周期钩子 API 实现
 * 该文件定义了 Vue 组件的生命周期钩子函数及其底层实现
 */
import {
  type ComponentInternalInstance,
  currentInstance,
  isInSSRComponentSetup,
  setCurrentInstance,
} from './component'
import type { ComponentPublicInstance } from './componentPublicInstance'
import { ErrorTypeStrings, callWithAsyncErrorHandling } from './errorHandling'
import { warn } from './warning'
import { toHandlerKey } from '@vue/shared'
import {
  type DebuggerEvent,
  pauseTracking,
  resetTracking,
} from '@vue/reactivity'
import { LifecycleHooks } from './enums'

export { onActivated, onDeactivated } from './components/KeepAlive'

/**
 * 将生命周期钩子注入到组件实例中
 * @param type 生命周期钩子类型
 * @param hook 要注入的钩子函数
 * @param target 目标组件实例，默认为当前活跃实例
 * @param prepend 是否前置添加到钩子数组
 * @returns 包装后的钩子函数或undefined
 */
export function injectHook(
  type: LifecycleHooks,
  hook: Function & { __weh?: Function },
  target: ComponentInternalInstance | null = currentInstance,
  prepend: boolean = false,
): Function | undefined {
      // SSR环境下，除了serverPrefetch外，其他创建后的生命周期注册都是无效的
    if (target) {
    const hooks = target[type] || (target[type] = [])
    // cache the error handling wrapper for injected hooks so the same hook
    // can be properly deduped by the scheduler. "__weh" stands for "with error
    // handling".
        // 为钩子函数添加错误处理包装器
    // 缓存包装后的钩子以确保调度器能正确去重
    const wrappedHook =
      hook.__weh ||
      (hook.__weh = (...args: unknown[]) => {
        // disable tracking inside all lifecycle hooks
        // since they can potentially be called inside effects.
                // 在所有生命周期钩子中禁用响应式追踪
        // 因为它们可能在effect中被调用
        pauseTracking()
        // Set currentInstance during hook invocation.
        // This assumes the hook does not synchronously trigger other hooks, which
        // can only be false when the user does something really funky.
                // 在钩子调用期间设置当前实例
        // 这假设钩子不会同步触发其他钩子
        const reset = setCurrentInstance(target)
        const res = callWithAsyncErrorHandling(hook, target, type, args)
                // 重置当前实例
        reset()
        resetTracking()
        return res
      })
    if (prepend) {
      hooks.unshift(wrappedHook)
    } else {
      hooks.push(wrappedHook)
    }
    return wrappedHook
  } else if (__DEV__) {
    const apiName = toHandlerKey(ErrorTypeStrings[type].replace(/ hook$/, ''))
    warn(
      `${apiName} is called when there is no active component instance to be ` +
        `associated with. ` +
        `Lifecycle injection APIs can only be used during execution of setup().` +
        (__FEATURE_SUSPENSE__
          ? ` If you are using async setup(), make sure to register lifecycle ` +
            `hooks before the first await statement.`
          : ``),
    )
  }
}

/**
 * 创建生命周期钩子函数的工厂函数
 * @param lifecycle 生命周期钩子类型
 * @returns 一个注册生命周期钩子的函数
 */
const createHook =
  <T extends Function = () => any>(lifecycle: LifecycleHooks) =>
  (
    hook: T,
    target: ComponentInternalInstance | null = currentInstance,
  ): void => {
    // post-create lifecycle registrations are noops during SSR (except for serverPrefetch)
    if (
      !isInSSRComponentSetup ||
      lifecycle === LifecycleHooks.SERVER_PREFETCH
    ) {
      injectHook(lifecycle, (...args: unknown[]) => hook(...args), target)
    }
  }
type CreateHook<T = any> = (
  hook: T,
  target?: ComponentInternalInstance | null,
) => void

/**
 * 注册组件挂载前的钩子函数
 * 组件被挂载到DOM之前触发
 */
export const onBeforeMount: CreateHook = createHook(LifecycleHooks.BEFORE_MOUNT)
/**
 * 注册组件挂载后的钩子函数
 * 组件被挂载到DOM之后触发
 */
export const onMounted: CreateHook = createHook(LifecycleHooks.MOUNTED)
/**
 * 注册组件更新前的钩子函数
 * 组件数据更新、重新渲染前触发
 */
export const onBeforeUpdate: CreateHook = createHook(
  LifecycleHooks.BEFORE_UPDATE,
)
/**
 * 注册组件更新后的钩子函数
 * 组件数据更新、重新渲染后触发
 */
export const onUpdated: CreateHook = createHook(LifecycleHooks.UPDATED)
/**
 * 注册组件卸载前的钩子函数
 * 组件被卸载前触发
 */
export const onBeforeUnmount: CreateHook = createHook(
  LifecycleHooks.BEFORE_UNMOUNT,
)
/**
 * 注册组件卸载后的钩子函数
 * 组件被卸载后触发
 */
export const onUnmounted: CreateHook = createHook(LifecycleHooks.UNMOUNTED)
/**
 * 注册服务端预取钩子函数
 * 仅在服务端渲染时执行，用于预取数据
 */
export const onServerPrefetch: CreateHook = createHook(
  LifecycleHooks.SERVER_PREFETCH,
)

/**
 * 调试器钩子函数类型
 * @param e 调试器事件对象
 */
export type DebuggerHook = (e: DebuggerEvent) => void
/**
 * 注册渲染触发钩子函数
 * 在响应式数据变化触发组件重新渲染时调用
 */
export const onRenderTriggered: CreateHook<DebuggerHook> =
  createHook<DebuggerHook>(LifecycleHooks.RENDER_TRIGGERED)
/**
 * 注册渲染追踪钩子函数
 * 在组件渲染过程中追踪到响应式依赖时调用
 */
export const onRenderTracked: CreateHook<DebuggerHook> =
  createHook<DebuggerHook>(LifecycleHooks.RENDER_TRACKED)

/**
 * 错误捕获钩子函数类型
 * @param err 捕获到的错误
 * @param instance 组件实例
 * @param info 错误信息
 * @returns 返回布尔值表示是否阻止错误传播
 */
export type ErrorCapturedHook<TError = unknown> = (
  err: TError,
  instance: ComponentPublicInstance | null,
  info: string,
) => boolean | void

/**
 * 注册错误捕获钩子函数
 * 捕获组件树中发生的错误
 * @param hook 错误捕获函数
 * @param target 目标组件实例
 */
export function onErrorCaptured<TError = Error>(
  hook: ErrorCapturedHook<TError>,
  target: ComponentInternalInstance | null = currentInstance,
): void {
  injectHook(LifecycleHooks.ERROR_CAPTURED, hook, target)
}
