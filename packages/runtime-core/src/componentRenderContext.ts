/**
 * 组件渲染上下文
 * 管理组件渲染过程中的上下文信息，包括当前渲染实例和作用域ID
 */
import type { ComponentInternalInstance } from './component'
import { devtoolsComponentUpdated } from './devtools'
import { setBlockTracking } from './vnode'

/**
 * 当前渲染实例
 * 用于在渲染过程中标记当前组件实例，以便解析组件、指令等资源
 */
export let currentRenderingInstance: ComponentInternalInstance | null = null
/**
 * 当前作用域ID
 * 用于标记当前组件的作用域，在处理CSS作用域等场景时使用
 */
export let currentScopeId: string | null = null

/**
 * 设置当前渲染实例
 * 注意：渲染调用可能是嵌套的。此函数返回父渲染实例（如果存在），
 * 在渲染完成后应恢复该实例。
 *
 * @example
 * ```js
 * const prev = setCurrentRenderingInstance(i)
 * // ...render
 * setCurrentRenderingInstance(prev)
 * ```
 * @param instance - 要设置的组件内部实例
 * @returns 之前的渲染实例
 */
export function setCurrentRenderingInstance(
  instance: ComponentInternalInstance | null,
): ComponentInternalInstance | null {
  const prev = currentRenderingInstance
  currentRenderingInstance = instance
  currentScopeId = (instance && instance.type.__scopeId) || null
  // v2 pre-compiled components uses _scopeId instead of __scopeId
  if (__COMPAT__ && !currentScopeId) {
    currentScopeId = (instance && (instance.type as any)._scopeId) || null
  }
  return prev
}

/**
 * 设置作用域ID
 * 在创建提升的虚拟节点时设置作用域ID
 * @param id - 作用域ID
 * @private 编译器辅助函数
 */
export function pushScopeId(id: string | null): void {
  currentScopeId = id
}

/**
 * 清除作用域ID
 * 从技术上讲，3.0.8之后不再需要此函数，但为了与编译器生成的代码保持向后兼容
 * @private
 */
export function popScopeId(): void {
  currentScopeId = null
}

/**
 * 仅用于向后兼容
 * @param _id - 作用域ID（未使用）
 * @returns withCtx函数
 * @private
 */
export const withScopeId = (_id: string): typeof withCtx => withCtx

/**
 * 上下文渲染函数类型
 * 带有标记属性的函数类型，用于表示已规范化的渲染函数
 */
export type ContextualRenderFn = {
  (...args: any[]): any
  _n: boolean /* already normalized */
  _c: boolean /* compiled */
  _d: boolean /* disableTracking */
  _ns: boolean /* nonScoped */
}

/**
 * 包装插槽函数以记忆当前渲染实例
 * @param fn - 要包装的插槽函数
 * @param ctx - 组件内部实例，默认为当前渲染实例
 * @param isNonScopedSlot - 是否为非作用域插槽（仅兼容模式下使用）
 * @returns 包装后的函数
 * @private 编译器辅助函数
 */
export function withCtx(
  fn: Function,
  ctx: ComponentInternalInstance | null = currentRenderingInstance,
  isNonScopedSlot?: boolean, // __COMPAT__ only
): Function {
  if (!ctx) return fn

  // already normalized
  if ((fn as ContextualRenderFn)._n) {
    return fn
  }

  const renderFnWithContext: ContextualRenderFn = (...args: any[]) => {
    // If a user calls a compiled slot inside a template expression (#1745), it
    // can mess up block tracking, so by default we disable block tracking and
    // force bail out when invoking a compiled slot (indicated by the ._d flag).
    // This isn't necessary if rendering a compiled `<slot>`, so we flip the
    // ._d flag off when invoking the wrapped fn inside `renderSlot`.
    if (renderFnWithContext._d) {
      setBlockTracking(-1)
    }
    const prevInstance = setCurrentRenderingInstance(ctx)
    let res
    try {
      res = fn(...args)
    } finally {
      setCurrentRenderingInstance(prevInstance)
      if (renderFnWithContext._d) {
        setBlockTracking(1)
      }
    }

    if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
      devtoolsComponentUpdated(ctx)
    }

    return res
  }

  // mark normalized to avoid duplicated wrapping
  renderFnWithContext._n = true
  // mark this as compiled by default
  // this is used in vnode.ts -> normalizeChildren() to set the slot
  // rendering flag.
  renderFnWithContext._c = true
  // disable block tracking by default
  renderFnWithContext._d = true
  // compat build only flag to distinguish scoped slots from non-scoped ones
  if (__COMPAT__ && isNonScopedSlot) {
    renderFnWithContext._ns = true
  }
  return renderFnWithContext
}
