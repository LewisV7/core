/**
 * 处理defineSlots宏的编译逻辑
 * 用于解析和转换Vue组件中的defineSlots调用
 */
import type { LVal, Node } from '@babel/types' // 导入Babel类型定义
import { isCallOf } from './utils' // 导入判断函数调用的工具函数
import type { ScriptCompileContext } from './context' // 导入脚本编译上下文类型

/**
 * defineSlots宏的函数名常量
 */
export const DEFINE_SLOTS = 'defineSlots'

/**
 * 处理defineSlots宏调用
 * @param ctx 脚本编译上下文
 * @param node AST节点
 * @param declId 声明标识符
 * @returns 是否成功处理
 */
export function processDefineSlots(
  ctx: ScriptCompileContext,
  node: Node,
  declId?: LVal,
): boolean {
  // 检查是否是defineSlots函数调用
  if (!isCallOf(node, DEFINE_SLOTS)) {
    return false
  }
  // 检查是否重复调用
  if (ctx.hasDefineSlotsCall) {
    ctx.error(`重复的 ${DEFINE_SLOTS}() 调用`, node)
  }
  // 标记已调用defineSlots
  ctx.hasDefineSlotsCall = true

  // 检查是否传入参数
  if (node.arguments.length > 0) {
    ctx.error(`${DEFINE_SLOTS}() 不能接受参数`, node)
  }

  // 如果有声明标识符，替换为useSlots调用
  if (declId) {
    ctx.s.overwrite(
      ctx.startOffset! + node.start!,
      ctx.startOffset! + node.end!,
      `${ctx.helper('useSlots')}()`,
    )
  }

  return true
}
