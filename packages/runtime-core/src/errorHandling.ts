/**
 * Vue 3 核心模块 - 错误处理
 * 提供组件生命周期和用户交互过程中的错误捕获与处理机制
 */
import { pauseTracking, resetTracking } from '@vue/reactivity'
import type { VNode } from './vnode'
import type { ComponentInternalInstance } from './component'
import { popWarningContext, pushWarningContext, warn } from './warning'
import { EMPTY_OBJ, isArray, isFunction, isPromise } from '@vue/shared'
import { LifecycleHooks } from './enums'
import { WatchErrorCodes } from '@vue/reactivity'

// 用户提供的函数可能执行的上下文，除了生命周期钩子之外
/**
 * 错误代码枚举
 * 表示不同类型的用户代码执行上下文
 */
export enum ErrorCodes {
  /** 组件setup函数 */
  SETUP_FUNCTION,
  /** 组件渲染函数 */
  RENDER_FUNCTION,
  // 注意：watch相关的错误代码已移至reactivity包
  // 为保持代码兼容性，此处值必须保持不变
  // WATCH_GETTER,
  // WATCH_CALLBACK,
  // WATCH_CLEANUP,
  /** 原生事件处理器 */
  NATIVE_EVENT_HANDLER = 5,
  /** 组件事件处理器 */
  COMPONENT_EVENT_HANDLER,
  /** VNode钩子函数 */
  VNODE_HOOK,
  /** 指令钩子函数 */
  DIRECTIVE_HOOK,
  /** 过渡动画钩子函数 */
  TRANSITION_HOOK,
  /** 应用错误处理器 */
  APP_ERROR_HANDLER,
  /** 应用警告处理器 */
  APP_WARN_HANDLER,
  /** 函数式ref */
  FUNCTION_REF,
  /** 异步组件加载器 */
  ASYNC_COMPONENT_LOADER,
  /** 调度器 */
  SCHEDULER,
  /** 组件更新 */
  COMPONENT_UPDATE,
  /** 应用卸载清理函数 */
  APP_UNMOUNT_CLEANUP,
}

/**
 * 错误类型字符串映射
 * 将错误类型代码映射为可读的字符串描述
 */
export const ErrorTypeStrings: Record<ErrorTypes, string> = {
  [LifecycleHooks.SERVER_PREFETCH]: 'serverPrefetch hook',
  [LifecycleHooks.BEFORE_CREATE]: 'beforeCreate hook',
  [LifecycleHooks.CREATED]: 'created hook',
  [LifecycleHooks.BEFORE_MOUNT]: 'beforeMount hook',
  [LifecycleHooks.MOUNTED]: 'mounted hook',
  [LifecycleHooks.BEFORE_UPDATE]: 'beforeUpdate hook',
  [LifecycleHooks.UPDATED]: 'updated',
  [LifecycleHooks.BEFORE_UNMOUNT]: 'beforeUnmount hook',
  [LifecycleHooks.UNMOUNTED]: 'unmounted hook',
  [LifecycleHooks.ACTIVATED]: 'activated hook',
  [LifecycleHooks.DEACTIVATED]: 'deactivated hook',
  [LifecycleHooks.ERROR_CAPTURED]: 'errorCaptured hook',
  [LifecycleHooks.RENDER_TRACKED]: 'renderTracked hook',
  [LifecycleHooks.RENDER_TRIGGERED]: 'renderTriggered hook',
  [ErrorCodes.SETUP_FUNCTION]: 'setup function',
  [ErrorCodes.RENDER_FUNCTION]: 'render function',
  [WatchErrorCodes.WATCH_GETTER]: 'watcher getter',
  [WatchErrorCodes.WATCH_CALLBACK]: 'watcher callback',
  [WatchErrorCodes.WATCH_CLEANUP]: 'watcher cleanup function',
  [ErrorCodes.NATIVE_EVENT_HANDLER]: 'native event handler',
  [ErrorCodes.COMPONENT_EVENT_HANDLER]: 'component event handler',
  [ErrorCodes.VNODE_HOOK]: 'vnode hook',
  [ErrorCodes.DIRECTIVE_HOOK]: 'directive hook',
  [ErrorCodes.TRANSITION_HOOK]: 'transition hook',
  [ErrorCodes.APP_ERROR_HANDLER]: 'app errorHandler',
  [ErrorCodes.APP_WARN_HANDLER]: 'app warnHandler',
  [ErrorCodes.FUNCTION_REF]: 'ref function',
  [ErrorCodes.ASYNC_COMPONENT_LOADER]: 'async component loader',
  [ErrorCodes.SCHEDULER]: 'scheduler flush',
  [ErrorCodes.COMPONENT_UPDATE]: 'component update',
  [ErrorCodes.APP_UNMOUNT_CLEANUP]: 'app unmount cleanup function',
}

/**
 * 错误类型联合类型
 * 包括生命周期钩子、错误代码和监听错误代码
 */
export type ErrorTypes = LifecycleHooks | ErrorCodes | WatchErrorCodes

/**
 * 带错误处理的函数调用
 * @param fn 要调用的函数
 * @param instance 组件内部实例
 * @param type 错误类型
 * @param args 函数参数
 * @returns 函数调用结果
 */
/**
 * 带错误处理的函数调用
 * @param fn 要调用的函数
 * @param instance 组件内部实例
 * @param type 错误类型
 * @param args 函数参数
 * @returns 函数调用结果
 */
export function callWithErrorHandling(
  fn: Function,
  instance: ComponentInternalInstance | null | undefined,
  type: ErrorTypes,
  args?: unknown[],
): any {
  // 尝试执行函数
  try {
    // 根据是否有参数决定调用方式
    return args ? fn(...args) : fn()
  } catch (err) {    // 调用错误处理函数
    handleError(err, instance, type)
  }
}

/**
 * 带异步错误处理的函数调用
 * @param fn 要调用的函数或函数数组
 * @param instance 组件内部实例
 * @param type 错误类型
 * @param args 函数参数
 * @returns 函数调用结果或结果数组
 */
export function callWithAsyncErrorHandling(
  fn: Function | Function[],
  instance: ComponentInternalInstance | null,
  type: ErrorTypes,
  args?: unknown[],
): any {
  // 如果是单个函数
  if (isFunction(fn)) {
    // 调用带错误处理的函数
    const res = callWithErrorHandling(fn, instance, type, args)
    // 如果结果是Promise
    if (res && isPromise(res)) {
      // 捕获Promise拒绝
      res.catch(err => {
        // 处理错误
        handleError(err, instance, type)
      })
    }
    return res
  }

  // 如果是函数数组
  if (isArray(fn)) {
    // 初始化结果数组
    const values = []
    // 遍历函数数组
    for (let i = 0; i < fn.length; i++) {
      // 递归调用处理每个函数
      values.push(callWithAsyncErrorHandling(fn[i], instance, type, args))
    }
    return values
  } else if (__DEV__) {
    warn(
      `Invalid value type passed to callWithAsyncErrorHandling(): ${typeof fn}`,
    )
  }
}

/**
 * 错误处理函数
 * @param err 错误对象
 * @param instance 组件内部实例
 * @param type 错误类型
 * @param throwInDev 是否在开发环境抛出错误
 */
export function handleError(
  err: unknown,
  instance: ComponentInternalInstance | null | undefined,
  type: ErrorTypes,
  throwInDev = true,
): void {
  // 获取上下文VNode
  const contextVNode = instance ? instance.vnode : null
  // 获取应用配置中的错误处理器和生产环境错误抛出设置
  const { errorHandler, throwUnhandledErrorInProduction } =
    (instance && instance.appContext.config) || EMPTY_OBJ
  // 如果存在组件实例
  if (instance) {
    // 从当前实例的父组件开始
    let cur = instance.parent
    // 暴露的实例是渲染代理，与2.x保持一致
    // 获取暴露的实例
    const exposedInstance = instance.proxy
    // 在生产环境中，钩子只接收错误代码
    // 错误信息，开发环境显示描述，生产环境显示文档链接
    const errorInfo = __DEV__
      ? ErrorTypeStrings[type]
      : `https://vuejs.org/error-reference/#runtime-${type}`
    // 遍历组件树向上查找错误捕获钩子
    while (cur) {
      // 获取当前组件的错误捕获钩子
      const errorCapturedHooks = cur.ec
      // 如果存在错误捕获钩子
      if (errorCapturedHooks) {
        // 遍历所有错误捕获钩子
        for (let i = 0; i < errorCapturedHooks.length; i++) {
          // 调用错误捕获钩子，如果返回false则停止传播
          if (
            errorCapturedHooks[i](err, exposedInstance, errorInfo) === false
          ) {
            // 停止错误传播
            // 返回
      return
          }
        }
      }
      cur = cur.parent
    }
    // 应用级错误处理
    // 如果存在应用错误处理器
    if (errorHandler) {
      // 暂停依赖跟踪
      pauseTracking()
      // 调用应用错误处理器
      callWithErrorHandling(errorHandler, null, ErrorCodes.APP_ERROR_HANDLER, [
        err,
        exposedInstance,
        errorInfo,
      ])
      // 重置依赖跟踪
      resetTracking()
      return
    }
  }
  // 记录错误
  logError(err, type, contextVNode, throwInDev, throwUnhandledErrorInProduction)
}

/**
 * 记录错误
 * @param err 错误对象
 * @param type 错误类型
 * @param contextVNode 上下文VNode
 * @param throwInDev 是否在开发环境抛出错误
 * @param throwInProd 是否在生产环境抛出错误
 */
function logError(
  err: unknown,
  type: ErrorTypes,
  contextVNode: VNode | null,
  throwInDev = true,
  throwInProd = false,
) {
  // 在开发环境中
  if (__DEV__) {
    // 获取错误类型信息
    const info = ErrorTypeStrings[type]
    // 如果存在上下文VNode
    // 如果存在上下文VNode
    if (contextVNode) {
      // 推入警告上下文
      pushWarningContext(contextVNode)
    }
    // 输出未处理错误警告
    warn(`Unhandled error${info ? ` during execution of ${info}` : ``}`)
    if (contextVNode) {
      // 弹出警告上下文
      popWarningContext()
    }
    // 默认在开发环境崩溃以便于发现问题
    // 如果在开发环境抛出错误
    if (throwInDev) {
        // 抛出错误
        throw err
      } // 如果不是测试环境
      else if (!__TEST__) {
        // 输出错误到控制台
        console.error(err)
    }
  // 在生产环境中，如果设置了抛出错误
  } else if (throwInProd) {
    throw err
  // 其他情况
  } else {
    // 在生产环境中恢复以减少对最终用户的影响
    console.error(err)
  }
}
