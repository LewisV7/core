/**
 * 服务端渲染上下文工具
 * 提供用于访问服务端渲染上下文的函数和键
 */
import { inject } from '../apiInject'
import { warn } from '../warning'

/** 服务端渲染上下文注入键 */
export const ssrContextKey: unique symbol = Symbol.for('v-scx')

/**
 * 获取服务端渲染上下文
 * @template T 上下文类型，默认为Record<string, any>
 * @returns 服务端渲染上下文对象或undefined
 * @warning 只能在服务端构建中调用此函数
 */
export const useSSRContext = <T = Record<string, any>>(): T | undefined => {
  if (!__GLOBAL__) {
    const ctx = inject<T>(ssrContextKey)
    if (!ctx) {
      __DEV__ &&
        warn(
          `Server rendering context not provided. Make sure to only call ` +
            `useSSRContext() conditionally in the server build.`,
        )
    }
    return ctx
  } else if (__DEV__) {
    warn(`useSSRContext() is not supported in the global build.`)
  }
}
