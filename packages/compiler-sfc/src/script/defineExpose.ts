/*
 * Vue单文件组件defineExpose宏处理
 * 负责解析和处理SFC中的defineExpose调用
 */

// 导入Babel类型定义
import type { Node } from '@babel/types'
// 导入工具函数，用于检查是否是特定函数调用
import { isCallOf } from './utils'
// 导入脚本编译上下文类型
import type { ScriptCompileContext } from './context'

/**
 * defineExpose宏的函数名常量
 */
export const DEFINE_EXPOSE = 'defineExpose'

/**
 * 处理defineExpose宏调用
 * @param ctx - 脚本编译上下文
 * @param node - 当前AST节点
 * @returns 是否成功处理了defineExpose调用
 */
export function processDefineExpose(
  ctx: ScriptCompileContext,
  node: Node,
): boolean {
  // 检查是否是defineExpose函数调用
  if (isCallOf(node, DEFINE_EXPOSE)) {
    // 检查是否重复调用defineExpose
    if (ctx.hasDefineExposeCall) {
      // 报告重复调用错误
      ctx.error(`duplicate ${DEFINE_EXPOSE}() call`, node)
    }
    // 标记已调用defineExpose
    ctx.hasDefineExposeCall = true
    return true
  }
  return false
}
