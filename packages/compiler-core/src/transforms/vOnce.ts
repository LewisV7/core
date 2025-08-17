// ***********************************************************************
// * v-once 指令转换处理
// * 负责处理带有 v-once 指令的节点，使其只渲染一次
// ***********************************************************************
import type { NodeTransform } from '../transform'
import { findDir } from '../utils'
import { type ElementNode, type ForNode, type IfNode, NodeTypes } from '../ast'
import { SET_BLOCK_TRACKING } from '../runtimeHelpers'

// 用于跟踪已经处理过的节点，避免重复处理
const seen = new WeakSet()

/**
 * v-once 指令转换函数
 * @param node 当前处理的 AST 节点
 * @param context 转换上下文
 * @returns 清理函数，在子节点处理完成后执行
 */
export const transformOnce: NodeTransform = (node, context) => {
    // 检查是否是元素节点且包含 v-once 指令
  if (node.type === NodeTypes.ELEMENT && findDir(node, 'once', true)) {
        // 跳过已处理的节点、已经在 v-once 上下文中的节点或服务端渲染的节点
    if (seen.has(node) || context.inVOnce || context.inSSR) {
      return
    }
        // 标记节点为已处理
    seen.add(node)
    // 进入 v-once 上下文
    context.inVOnce = true
    // 注册 SET_BLOCK_TRACKING 运行时帮助函数
    context.helper(SET_BLOCK_TRACKING)
        // 返回清理函数，在子节点处理完成后执行
    return () => {
            // 退出 v-once 上下文
      context.inVOnce = false
      // 获取当前节点（可能已被转换）
      const cur = context.currentNode as ElementNode | IfNode | ForNode
      // 如果存在代码生成节点，则将其缓存
      if (cur.codegenNode) {
        cur.codegenNode = context.cache(
          cur.codegenNode,
          true /* isVNode：标记为虚拟节点 */,
          true /* inVOnce：在 v-once 上下文中 */,
        )
      }
    }
  }
}
