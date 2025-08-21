// 顶级await处理模块
// 此模块用于支持Vue单文件组件中顶级await表达式的上下文持久化
// 解决在异步操作后仍能访问当前组件实例的问题

import type { AwaitExpression } from '@babel/types'
import type { ScriptCompileContext } from './context'

/**
 * 支持顶级await表达式之间的上下文持久化
 * 
 * ```js
 * const instance = getCurrentInstance()
 * await foo()
 * expect(getCurrentInstance()).toBe(instance)
 * ```
 * 
 * 未来当Async Context广泛可用时，我们可能会移除这个实现：
 * https://github.com/tc39/proposal-async-context
 * 
 * 实现方式示例：
 * ```js
 * // 输入
 * await foo()
 * // 输出
 * ;(
 *   ([__temp,__restore] = withAsyncContext(() => foo())),
 *   await __temp,
 *   __restore()
 * )
 * 
 * // 输入
 * const a = await foo()
 * // 输出
 * const a = (
 *   ([__temp, __restore] = withAsyncContext(() => foo())),
 *   __temp = await __temp,
 *   __restore(),
 *   __temp
 * )
 * ```
 */
export function processAwait(
  ctx: ScriptCompileContext,
  node: AwaitExpression,
  needSemi: boolean,
  isStatement: boolean,
): void {
  // 获取参数起始位置（处理括号情况）
  const argumentStart = 
    node.argument.extra && node.argument.extra.parenthesized
      ? (node.argument.extra.parenStart as number)
      : node.argument.start!

  const startOffset = ctx.startOffset!
  // 提取参数字符串
  const argumentStr = ctx.descriptor.source.slice(
    argumentStart + startOffset,
    node.argument.end! + startOffset,
  )

  // 检查参数中是否包含嵌套的await
  const containsNestedAwait = /\bawait\b/.test(argumentStr)

  // 重写await表达式开始部分
  ctx.s.overwrite(
    node.start! + startOffset,
    argumentStart + startOffset,
    `${needSemi ? `;` : ``}(
  ([__temp,__restore] = ${ctx.helper(
      `withAsyncContext`,
    )}(${containsNestedAwait ? `async ` : ``}() => `,
  )
  // 追加await表达式结束部分
  ctx.s.appendLeft(
    node.end! + startOffset,
    `)),
  ${isStatement ? `` : `__temp = `}await __temp,
  __restore()${
      isStatement ? `` : `,
  __temp`
    }
)`,
  )
}
